// apps/be/bots/telegramBot.ts
import { Telegraf } from 'telegraf';
import { session } from 'telegraf';


import UserModel from '../models/UserModel';
import Coin from '../models/CoinModel'; // thêm: để check coin & lấy giá hiện tại
import { getPrediction } from '../services/aiClient';
type Horizon = "5m" | "1h" | "24h";
// ====== Cấu hình ======
const TELEGRAM_BOT_TOKEN = '8291089808:AAHuFVAXlyJ2U1BrUjpzS1Qb_J6PIjpbVwA'; // khuyên dùng .env


const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== Session
bot.use(session());

// ===== Helpers
function fmtPrice(n: number) {
  if (!Number.isFinite(n)) return String(n);
  const digits = n >= 1 ? 2 : n >= 0.01 ? 4 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function confidenceText(yhat: number, lo: number, hi: number) {
  const conf = yhat ? 1 - (hi - lo) / Math.max(yhat, 1e-9) : 0.5;
  return conf >= 0.66 ? 'cao' : conf >= 0.5 ? 'trung bình' : 'thấp';
}
function escRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse lệnh:
 *  - /predict BTC
 *  - /predict BTC 5m
 *  - /predict bitcoin
 *  - /predict "bitcoin cash" 1h
 *  - /predict bitcoin-cash 24h  (dấu - hoặc _ sẽ được hiểu là khoảng trắng)
 *  - /predictBTC [5m|1h|24h]   (giữ tương thích)
 */
function parsePredictArgs(txt: string): { query: string; h: Horizon } | null {
  if (!txt?.startsWith('/predict')) return null;

  // Trường hợp /predictBTC ... (dính liền symbol) vẫn giữ hỗ trợ
  const compact = txt.match(/^\/predict([A-Za-z0-9._-]{2,15})(?:\s+(5m|1h|24h))?$/i);
  if (compact?.[1]) {
    const symbol = compact[1];
    const h = (compact[2]?.toLowerCase() as Horizon) ?? '1h';
    return { query: symbol, h };
  }

  // Trường hợp chuẩn: "/predict <query> [h]"
  const tokens = txt.trim().split(/\s+/); // ["/predict", ...args]
  if (tokens.length < 2) return null;

  let args = tokens.slice(1); // [...query, maybe horizon]
  let h: Horizon = '1h';
  const last = args[args.length - 1]?.toLowerCase();
  if (last === '5m' || last === '1h' || last === '24h') {
    h = last as Horizon;
    args = args.slice(0, -1);
  }

  // Ghép lại phần query (có thể là tên có khoảng trắng)
  let raw = args.join(' ');
  // bỏ cặp "..." nếu có
  raw = raw.replace(/^"(.*)"$/, '$1');
  // chuyển -/_ thành khoảng trắng để match tên
  raw = raw.replace(/[-_]+/g, ' ').trim();

  if (!raw) return null;
  return { query: raw, h };
}

/**
 * Resolve từ input (symbol hoặc tên) -> document coin mới nhất.
 * Ưu tiên:
 *  1) exact symbol (case-insensitive)
 *  2) exact name (case-insensitive)
 *  3) partial name (i, contains)
 */
async function resolveCoin(query: string) {
  const symbol = query;

  // 1) Symbol khớp
  let coin = await Coin.findOne({ symbol }).sort({ version: -1 }).lean();
  if (coin) return coin;

  // 2) Tên khớp tuyệt đối (case-insensitive)
  coin = await Coin.findOne({ name: new RegExp(`^${escRegex(query)}$`, 'i') })
    .sort({ version: -1 })
    .lean();
  if (coin) return coin;

  // 3) Tên chứa chuỗi (partial, case-insensitive) — ưu tiên rank cao / version mới
  coin = await Coin.findOne({ name: new RegExp(escRegex(query), 'i') })
    .sort({ cmc_rank: 1, version: -1 }) // ưu tiên coin top
    .lean();

  return coin;
}

// ===== /start — liên kết email (giữ logic cũ)
bot.start(async (ctx: any) => {
  if (!ctx.session) ctx.session = {};
  await ctx.reply('Chào bạn! Để liên kết tài khoản với bot, vui lòng cung cấp email của bạn.');
  ctx.session.state = 'waitingForEmail';
});

// ===== /predict — hỗ trợ symbol hoặc tên + 5m|1h|24h
bot.command('predict', async (ctx: any) => {
  const args = parsePredictArgs(ctx.message?.text || '');
  if (!args) {
    return ctx.reply(
      'Cách dùng: `/predict <symbol|tên-coin> [5m|1h|24h]`\n' +
      'Ví dụ: `/predict BTC`, `/predict bitcoin`, `/predict "bitcoin cash" 24h`',
      { parse_mode: 'Markdown' }
    );
  }
  await handlePredictCommand(ctx, args.query, args.h);
});

// Giữ tương thích dạng dính liền: /predictBTC [5m|1h|24h]
bot.hears(/^\/predict([A-Za-z0-9._-]{2,15})(?:\s+(5m|1h|24h))?$/i, async (ctx: any) => {
  const args = parsePredictArgs(ctx.message?.text || '');
  if (!args) {
    return ctx.reply(
      'Cách dùng: `/predict <symbol|tên-coin> [5m|1h|24h]`',
      { parse_mode: 'Markdown' }
    );
  }
  await handlePredictCommand(ctx, args.query, args.h);
});

async function handlePredictCommand(ctx: any, query: string, h: Horizon = '1h') {
  try {
    const coin = await resolveCoin(query);
    if (!coin) {
      await ctx.reply(`❗ Không tìm thấy dữ liệu trong DB cho: ${query}`);
      return;
    }

    const symbol = coin.symbol;
    const name = coin.name || symbol;

    await ctx.reply(`⏳ Đang phân tích *${name}* (${symbol}, ${h}) ...`, { parse_mode: 'Markdown' });

    const p = await getPrediction(symbol, h);
    if (!p?.ok) {
      await ctx.reply('⚠️ Chưa lấy được dự đoán từ AI. Thử lại sau.');
      return;
    }

    const price = coin.currentPrice != null ? `$${fmtPrice(coin.currentPrice)}`
                 : (p.yhat ? `$${fmtPrice(p.yhat)}` : 'N/A');
    const pct1h =
      coin.percentChange1h != null
        ? `${coin.percentChange1h >= 0 ? '🟢' : '🔻'} ${coin.percentChange1h.toFixed(2)}%`
        : 'N/A';
    const pct24h =
      coin.percentChange24h != null
        ? `${coin.percentChange24h >= 0 ? '🟢' : '🔻'} ${coin.percentChange24h.toFixed(2)}%`
        : 'N/A';

    const lines: string[] = [];
    lines.push(`*${name}* (${symbol}) — *Dự báo AI* (${h})`);
    lines.push(`Giá hiện tại: *${price}*  •  1h: ${pct1h}  •  24h: ${pct24h}`);
    lines.push(
      `Mục tiêu ~ *$${fmtPrice(p.yhat)}* ` +
      `(biên $${fmtPrice(p.yhat_lower)} – $${fmtPrice(p.yhat_upper)}; ` +
      `độ tin cậy ${confidenceText(p.yhat, p.yhat_lower, p.yhat_upper)})`
    );

    const f = p.features || {};
    const feats: string[] = [];
    if (Number.isFinite(f.rsi)) feats.push(`RSI ${f.rsi.toFixed(1)}`);
    if (Number.isFinite(f.macd)) feats.push(`MACD ${f.macd.toFixed(2)}`);
    if (Number.isFinite(f.bb_pos)) feats.push(`BBpos ${(f.bb_pos * 100).toFixed(0)}%`);
    if (feats.length) lines.push(`   ↳ Chỉ báo: ${feats.join(' · ')}`);

    lines.push(`\n*Lưu ý:* Đây *không* phải khuyến nghị đầu tư.`);
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply('❌ Có lỗi khi xử lý lệnh /predict. Bạn thử lại sau nhé!');
  }
}

// ===== Handler text: giữ logic email, tránh đè lên command
bot.on('text', async (ctx: any) => {
  const userId = ctx.from?.id;
  const text = ctx.message?.text || '';

  if (text.startsWith('/predict') || text.startsWith('/start')) return;
  if (!userId || !text) return;

  if (ctx.session?.state === 'waitingForEmail') {
    if (!isValidEmail(text)) {
      return ctx.reply('Email không hợp lệ. Vui lòng gửi lại một email hợp lệ.');
    }
    const existingUser = await UserModel.findOne({ email: text }).lean();
    if (existingUser) {
      await linkUserTelegramAccount(existingUser, userId);
      await ctx.reply('Tài khoản của bạn đã được liên kết với bot. Bạn sẽ nhận được thông báo từ bot sau này.');
    } else {
      await ctx.reply('Email này chưa được đăng ký trong hệ thống. Vui lòng đăng ký tài khoản trước khi sử dụng bot.');
      ctx.session.state = 'finished';
      await ctx.reply('Chúc bạn một ngày tốt lành!');
    }
    ctx.session.state = 'finished';
  }
});

async function linkUserTelegramAccount(user: any, chatId: number) {
  const u = await UserModel.findById(user._id);
  if (!u) return;
  await UserModel.updateOne({ _id: user._id }, { $set: { telegramChatId: chatId } });
  console.log(`Liên kết tài khoản Telegram với email ${user.email}`);
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  return emailRegex.test(email);
}

export function startTelegramBot() {
  bot.telegram.setMyCommands([
    { command: 'predict', description: 'Dự đoán: /predict <symbol|tên-coin> [5m|1h|24h]' },
  ]);
  bot.launch();
  console.log('Telegram bot started');
}

export { bot };