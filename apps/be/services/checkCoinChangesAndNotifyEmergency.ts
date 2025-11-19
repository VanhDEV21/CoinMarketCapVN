// services/checkCoinChangesAndNotifyEmergency.ts
import Coin from '../models/CoinModel';
import User from '../models/UserModel';
import { bot } from '../bots/telegramBot';
import Bottleneck from 'bottleneck';

const MAX_COINS_PER_PUSH = 20;

export async function checkCoinChangesAndNotifyEmergency() {
  try {
    // 1) Lấy version mới nhất
    const last = await Coin.findOne().sort({ version: -1 }).select({ version: 1 }).lean();
    const version = last?.version;
    if (!version) {
      console.log('No coin version available');
      return;
    }

    // 2) Lấy danh sách coin của phiên bản mới nhất (ĐÚNG field)
    const latestCoins = await Coin.find({ version })
      .select({
        name: 1,
        symbol: 1,
        currentPrice: 1,
        percentChange5min: 1, 
        percentChange1h: 1,
        percentChange24h: 1,    
        cmc_rank: 1,
        _id: 0,
      })
      .lean();

    // 3) Lọc coin biến động "mạnh"
    const movers = latestCoins.filter(c =>
          Number.isFinite(c.percentChange5min) && Math.abs(c.percentChange5min) >= 5
      || Number.isFinite(c.percentChange1h) && Math.abs(c.percentChange1h) >= 10
      || Number.isFinite(c.percentChange24h) && Math.abs(c.percentChange24h) >= 40
    );

    if (!movers.length) {
      console.log('No significant coin changes detected');
      return;
    }

    // Sắp xếp ưu tiên coin top, cắt bớt để tránh 4096 chars
    const significantCoins = movers
      .sort((a, b) => (a.cmc_rank ?? 9999) - (b.cmc_rank ?? 9999))
      .slice(0, MAX_COINS_PER_PUSH);

    // 4) Chuẩn bị throttling gửi Telegram
    const globalLimiter = new Bottleneck({
      reservoir: 25,
      reservoirRefreshAmount: 25,
      reservoirRefreshInterval: 1000,
      maxConcurrent: 5,
    });
    const perChatLimiter = new Bottleneck.Group({ maxConcurrent: 1, minTime: 1100 });

    const sendSafe = async (chatIdStr: string, text: string) => {
      const limiter = perChatLimiter.key(chatIdStr);
      return globalLimiter.schedule(() =>
        limiter.schedule(() =>
          bot.telegram.sendMessage(chatIdStr, text, {
            link_preview_options: { is_disabled: true },
          })
        )
      );
    };

    // 5) Lấy danh sách user bật thông báo
    const cursor = User.find({
      notificationsEnabled: true,
      telegramChatId: { $exists: true, $ne: null },
    })
      .select({ _id: 1, telegramChatId: 1 })
      .lean()
      .cursor();

    // 6) Soạn thông điệp mẫu một lần
    const lines = significantCoins.map(c => {
      const pick =
        Math.abs(c.percentChange5min ?? 0) >= 5 ? { v: c.percentChange5min, w: '5 phút' } :
        Math.abs(c.percentChange1h ?? 0)   >=10 ? { v: c.percentChange1h,   w: '1 giờ' }  :
                                                  { v: c.percentChange24h,  w: '24 giờ' };
      const arrow = (pick.v ?? 0) > 0 ? '🔼' : (pick.v ?? 0) < 0 ? '🔽' : '⏸️';
      const price = Number.isFinite(c.currentPrice)
        ? (c.currentPrice! >= 1 ? c.currentPrice!.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                : c.currentPrice!.toLocaleString(undefined, { maximumFractionDigits: 8 }))
        : '—';
      return `${c.name} (${c.symbol}) — $${price} — ${arrow} ${Math.abs(pick.v ?? 0).toFixed(2)}% trong ${pick.w}`;
    });

    // Message (giữ ngắn gọn)
    const header = '🚨 Biến động lớn trong thị trường (theo phiên gần nhất):\n' +
                   'Bạn có thể quan tâm tới các coin dưới đây:';
    const footer = '\n\n💡 Mẹo: Thêm coin vào Watchlist để nhận ưu tiên thông báo.';

    const full = `${header}\n\n${lines.join('\n')}${footer}`;
    const chunks = chunkByChar(full, 3800);

    // 7) Gửi cho từng user (an toàn)
    for await (const u of cursor) {
      const chatId = String(u.telegramChatId);
      try {
        for (const ch of chunks) {
          await sendSafe(chatId, ch);
        }
      } catch (err: any) {
        const code = err?.on?.error_code || err?.code;
        const desc = err?.on?.description || err?.message;
        console.error(`send to user ${u._id} failed:`, code, desc);
        if (code === 403 || (typeof desc === 'string' && /bot.*blocked/i.test(desc))) {
          await User.updateOne(
            { _id: u._id },
            { $set: { notificationsEnabled: false }, $unset: { telegramChatId: '' } }
          );
        }
      }
    }

    console.log(`Emergency movers sent: ${significantCoins.length} coins`);
  } catch (e) {
    console.error('Error checking coin changes and sending notifications:', e);
  }
}

// helper: cắt message
function chunkByChar(text: string, maxChars = 3800) {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) out.push(text.slice(i, i + maxChars));
  return out;
}
