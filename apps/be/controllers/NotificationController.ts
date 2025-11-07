import { Request, Response } from 'express';
import User from '../models/UserModel';
import Watchlist from '../models/WatchListModel';
import Coin from '../models/CoinModel';
import { bot } from '../bots/telegramBot';
import Bottleneck from 'bottleneck';

const BOT_DEEP_LINK = 'https://t.me/CRYPTOANNOUCEBOT';

function fmtPrice(n: number) {
  if (!Number.isFinite(n)) return String(n);
  // hiển thị nhiều số lẻ nếu giá nhỏ
  const digits = n >= 1 ? 2 : n >= 0.01 ? 4 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function fmtPct(n: number) {
  if (!Number.isFinite(n)) return String(n);
  return Math.abs(n).toFixed(2);
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function chunkByChar(text: string, maxChars = 3800) {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxChars));
    i += maxChars;
  }
    return chunks;
}

export class NotificationsController {
  async getStatus(req: Request, res: Response) {
    try {
      const uid = (req as any).auth?.uid;
      const user = await User.findById(uid).lean();
      if (!user) return res.status(401).json({ error: true, message: 'Unauthorized' });

      const hasChat = !!user.telegramChatId;
      const enabled = !!user.notificationsEnabled;
      return res.json({ ok: true, hasChat, enabled, botUrl: BOT_DEEP_LINK });
    } catch (e: any) {
      return res.status(500).json({ error: true, message: e.message || 'Internal error' });
    }
  }

  async toggleNotifications(req: Request, res: Response) {
    try {
      const uid = (req as any).auth?.uid;
      const enable = !!req.body?.enabled;

      const user = await User.findById(uid);
      if (!user) return res.status(401).json({ error: true, message: 'Unauthorized' });

      if (enable && !user.telegramChatId) {
        return res.status(409).json({
          error: true,
          needLink: true,
          message: 'Vui lòng liên kết Telegram trước khi bật thông báo',
          botUrl: BOT_DEEP_LINK,
        });
      }

      user.notificationsEnabled = enable;
      await user.save();
      return res.json({ ok: true, enabled: user.notificationsEnabled });
    } catch (e: any) {
      return res.status(500).json({ error: true, message: e.message || 'Internal error' });
    }
  }

  // --- NEW: scale-friendly fan-out ---
  async sendNotifications(_req: Request, res: Response) {
    try {
      // 1) Version mới nhất
      const last = await Coin.findOne().sort({ version: -1 }).select({ version: 1 }).lean();
      const version = last?.version;
      if (!version) return res.status(200).json({ message: 'No coin version available' });

      // 2) Prefetch 200 coin mới nhất (đã có index {version:-1, cmc_rank:1})
      const latestCoins = await Coin.find({ version })
        .sort({ cmc_rank: 1 })
        .select({ name: 1, symbol: 1, currentPrice: 1, percentChange24h: 1, cmc_rank: 1, _id: 0 })
        .lean();

      const coinBySymbol = new Map<string, typeof latestCoins[number]>(
        latestCoins.map(c => [c.symbol, c])
      );

      // 3) Lấy user đủ điều kiện bằng cursor để không ngốn RAM
      const cursor = User.find({
        notificationsEnabled: true,
        telegramChatId: { $exists: true, $ne: null },
      }).select({ _id: 1, telegramChatId: 1 }).lean().cursor();

      const MAX_PER_USER = 10;

      // 4) Throttle gửi Telegram (an toàn: ≤ 25 msg/s global, ≤ 1 msg/s/ chat)
      const globalLimiter = new Bottleneck({
        reservoir: 25,
        reservoirRefreshAmount: 25,
        reservoirRefreshInterval: 1000,
        maxConcurrent: 5,
      });
      const perChatLimiter = new Bottleneck.Group({
        maxConcurrent: 1,
        minTime: 1100, // ~1.1s/1 msg/chat
      });

      const sendSafe = async (chatIdStr: string, text: string) => {
        const limiter = perChatLimiter.key(chatIdStr);
        return globalLimiter.schedule(() =>
          limiter.schedule(() =>
            bot.telegram.sendMessage(chatIdStr, text, {link_preview_options: { is_disabled: true }})
          )
        );
      };

      // 5) Duyệt và gửi
      for await (const u of cursor) {
        const chatIdStr = String(u.telegramChatId);
        try {
          const wl = await Watchlist.findOne({ userId: u._id })
            .select({ items: 1 })
            .lean();

          let rows: Array<{ name: string; symbol: string; currentPrice: number; percentChange24h: number; cmc_rank: number }>;

          if (wl && wl.items?.length) {
            const symbols = Array.from(new Set((wl.items || []).map(i => (i.symbol || '').toUpperCase()).filter(Boolean)));
            // Map từ prefetch
            rows = symbols
              .map(s => coinBySymbol.get(s))
              .filter((c): c is NonNullable<typeof c> => !!c)
              .sort((a, b) => a.cmc_rank - b.cmc_rank)   // ưu tiên coin top
              .slice(0, MAX_PER_USER);
          } else {
            rows = latestCoins.slice(0, MAX_PER_USER);
          }

          if (!rows.length) continue;

          const header = wl?.items?.length ? '📈 Watchlist của bạn' : '🏆 Top 10 theo Market Cap';
          const bodyLines = rows.map(c => {
            const arrow = c.percentChange24h > 0 ? '🔼' : c.percentChange24h < 0 ? '🔽' : '⏸️';
            return `${c.name} (${c.symbol}) / $${fmtPrice(c.currentPrice)} / ${arrow} ${fmtPct(c.percentChange24h)}%`;
          });

          // Gộp header + body rồi chunk theo ký tự (<=4096)
          const fullText = `${header}:\n\n${bodyLines.join('\n')}`;
          const chunks = chunkByChar(fullText, 3800);

          for (const ch of chunks) {
            await sendSafe(chatIdStr, ch);
          }
        } catch (err: any) {
          // Nếu user block bot hoặc chat_id không valid → tắt thông báo & xóa chatId để tránh spam lần sau
          const code = err?.on?.error_code || err?.code;
          const desc = err?.on?.description || err?.message;
          console.error(`send to user ${u._id} failed:`, code, desc);

          if (code === 403 || (typeof desc === 'string' && /bot.*blocked/i.test(desc))) {
            await User.updateOne({ _id: u._id }, { $set: { notificationsEnabled: false }, $unset: { telegramChatId: "" } });
          }
          continue;
        }
      }

      return res.status(200).json({ ok: true, message: 'Notifications dispatched' });
    } catch (e: any) {
      console.error('sendNotifications fatal:', e?.message || e);
      return res.status(500).json({ error: true, message: e?.message || 'Failed to send notifications' });
    }
  }
}
