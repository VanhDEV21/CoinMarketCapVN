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

// ===== Helpers cho /predict
function fmtPrice(n: number) {
  if (!Number.isFinite(n)) return String(n);
  const digits = n >= 1 ? 2 : n >= 0.01 ? 4 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function confidenceText(yhat: number, lo: number, hi: number) {
  const conf = yhat ? 1 - (hi - lo) / Math.max(yhat, 1e-9) : 0.5;
  return conf >= 0.66 ? 'cao' : conf >= 0.5 ? 'trung bình' : 'thấp';
}
function parsePredictArgs(txt: string): { symbol: string; h: Horizon } | null {
  if (!txt?.startsWith("/predict")) return null;

  // "/predict BTC 5m"
  const parts = txt.trim().split(/\s+/); // ["/predict","BTC","5m"?]
  if (parts.length >= 2) {
    const symbol = parts[1];
    const hRaw = (parts[2]?.toLowerCase() ?? "1h") as Horizon;
    const h: Horizon = (hRaw === "5m" || hRaw === "24h" || hRaw === "1h") ? hRaw : "1h";
    return { symbol, h };
  }

  // "/predictBTC" hoặc "/predicteth 24h"
  const m = txt.match(/^\/predict([A-Za-z0-9._-]{2,15})(?:\s+(5m|1h|24h))?$/i);
  if (m && m[1]) {
    const symbol = m[1];
    const h = (m[2]?.toLowerCase() as Horizon) ?? "1h";
    return { symbol, h };
  }
  return null;
}

// ===== /start — liên kết email (giữ nguyên logic của bạn)
bot.start(async (ctx: any) => {
  if (!ctx.session) ctx.session = {};
  await ctx.reply('Chào bạn! Để liên kết tài khoản với bot, vui lòng cung cấp email của bạn.');
  ctx.session.state = 'waitingForEmail';
});

// ===== /predict — hỗ trợ 5m|1h|24h
bot.command('predict', async (ctx: any) => {
  const args = parsePredictArgs(ctx.message?.text || '');
  if (!args) {
    return ctx.reply('Cách dùng: `/predict BTC [5m|1h|24h]` hoặc `/predictBTC [5m|1h|24h]`', { parse_mode: 'Markdown' });
  }
  await handlePredictCommand(ctx, args.symbol, args.h);
});

// Dạng dính liền: "/predictBTC [5m|1h|24h]"
bot.hears(/^\/predict([A-Za-z0-9._-]{2,15})(?:\s+(5m|1h|24h))?$/i, async (ctx: any) => {
  const args = parsePredictArgs(ctx.message?.text || '');
  if (!args) {
    return ctx.reply('Cách dùng: `/predict BTC [5m|1h|24h]` hoặc `/predictBTC [5m|1h|24h]`', { parse_mode: 'Markdown' });
  }
  await handlePredictCommand(ctx, args.symbol, args.h);
});

async function handlePredictCommand(ctx: any, symbol: string, h: Horizon = "1h") {
  try {
    // 1) Kiểm tra coin có dữ liệu trong DB
    const coin = await Coin.findOne({ symbol: symbol})
      .sort({ version: -1 })
      .select({ currentPrice: 1, percentChange1h: 1, percentChange24h: 1 })
      .lean();

    if (!coin) {
      await ctx.reply(`❗ Không tìm thấy dữ liệu cho coin: ${symbol}.Hãy thử lại với coin có trong danh sách có marketcap cao nhất nhé `);
      return;
    }

    await ctx.reply(`⏳ Đang phân tích *${symbol}* (${h}) ...`, { parse_mode: 'Markdown' });

    // 2) Gọi AI đúng horizon
    const p = await getPrediction(symbol, h);
    if (!p?.ok) {
      await ctx.reply('⚠️ Chưa lấy được dự đoán từ AI. Thử lại sau.');
      return;
    }

    // 3) Format kết quả
    const price = coin.currentPrice != null ? `$${fmtPrice(coin.currentPrice)}` : 'N/A';
    const pct1h =
      coin.percentChange1h != null
        ? `${coin.percentChange1h >= 0 ? '🟢' : '🔻'} ${coin.percentChange1h}%`
        : 'N/A';
    const pct24h =
      coin.percentChange24h != null
        ? `${coin.percentChange24h >= 0 ? '🟢' : '🔻'} ${coin.percentChange24h}%`
        : 'N/A';

    const lines: string[] = [];
    lines.push(`*${symbol} — Dự báo AI (${h})*`);
    lines.push(`Giá hiện tại: *${price}*  •  1h: ${pct1h}  •  24h: ${pct24h}`);
    lines.push(
      `Mục tiêu ~ *$${fmtPrice(p.yhat)}* ` +
      `(biên $${fmtPrice(p.yhat_lower)} – $${fmtPrice(p.yhat_upper)}; độ tin cậy ${confidenceText(p.yhat, p.yhat_lower, p.yhat_upper)})`
    );

    const f = p.features || {};
    const feats: string[] = [];
    if (Number.isFinite(f.rsi)) feats.push(`RSI ${f.rsi}`);
    if (Number.isFinite(f.macd)) feats.push(`MACD ${f.macd}`);
    if (Number.isFinite(f.bb_pos)) feats.push(`BBpos ${(f.bb_pos * 100)}%`);
    if (feats.length) lines.push(`   ↳ Chỉ báo: ${feats.join(' · ')}`);

    lines.push(`\n*Lưu ý:* Đây *không* phải khuyến nghị đầu tư.`);
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply('❌ Có lỗi khi xử lý lệnh /predict. Bạn thử lại sau nhé!');
  }
}

// ===== Handler text: giữ logic email của bạn, tránh đè lên lệnh
bot.on('text', async (ctx: any) => {
  const userId = ctx.from?.id;
  const text = ctx.message?.text || '';

  // Bỏ qua nếu là command
  if (text.startsWith('/predict') || text.startsWith('/start')) return;

  if (!userId || !text) return;

  if (ctx.session?.state === 'waitingForEmail') {
    if (!isValidEmail(text)) {
      return ctx.reply('Email không hợp lệ. Vui lòng gửi lại một email hợp lệ.');
    }

    const existingUser = await UserModel.findOne({ email: text }).lean();

    if (existingUser) {
      await linkUserTelegramAccount(existingUser, userId);
      await ctx.reply('Tài khoản của bạn đã được liên kết với bot. Bạn nhớ bật thông báo trên web để nhận được thông báo từ mình nhé 😊');
    } else {
      await ctx.reply('Email này chưa được đăng ký trong hệ thống. Vui lòng đăng ký tài khoản trước khi sử dụng bot.');
      ctx.session.state = 'finished';
      await ctx.reply('Chúc bạn một ngày tốt lành!');
    }

    ctx.session.state = 'finished';
  }
});

// ===== Link Telegram chatId vào User
async function linkUserTelegramAccount(user: any, chatId: number) {
  const u = await UserModel.findById(user._id);
  if (!u) return;
  await UserModel.updateOne({ _id: user._id }, { $set: { telegramChatId: chatId } });
  console.log(`Liên kết tài khoản Telegram với email ${user.email}`);
}

// ===== Validate email
function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  return emailRegex.test(email);
}

// ===== Khởi động bot
export function startTelegramBot() {
  bot.telegram.setMyCommands([
    { command: 'predict', description: 'Dự đoán: /predict BTC [5m|1h|24h]' },
  ]);
  bot.launch();
  console.log('Telegram bot started');
}

export { bot };