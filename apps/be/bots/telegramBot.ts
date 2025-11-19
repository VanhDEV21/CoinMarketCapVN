// apps/be/bots/telegramBot.ts
import { Telegraf } from 'telegraf';
import { session } from 'telegraf';
import https from 'https';
import UserModel from '../models/UserModel';
import Coin from '../models/CoinModel';
import { getPrediction } from '../services/aiClient';
import { Env } from '../config/env';

type Horizon = "5m" | "1h" | "24h";
const agent = new https.Agent({ keepAlive: true, timeout: 20_000 });
// ====== Cấu hình ======
const TELEGRAM_BOT_TOKEN = Env.TELEGRAM_BOT_TOKEN || '';

const bot = new Telegraf(TELEGRAM_BOT_TOKEN,{telegram: { agent }});

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
 *  - /predict bitcoin-cash 24h  (dấu - hoặc _ hiểu là khoảng trắng)
 *  - /predictBTC [5m|1h|24h]   (giữ tương thích)
 */
function parsePredictArgs(txt: string): { query: string; h: Horizon } | null {
  if (!txt?.startsWith('/predict')) return null;

  // Trường hợp /predictBTC ... (dính liền symbol)
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
  raw = raw.replace(/^"(.*)"$/, '$1'); // bỏ cặp "..."
  raw = raw.replace(/[-_]+/g, ' ').trim(); // -/_ -> khoảng trắng

  if (!raw) return null;
  return { query: raw, h };
}

/** Parse /compare <coin1> <coin2> [5m|1h|24h] */
function parseCompareArgs(txt: string): { q1: string; q2: string; h: Horizon } | null {
  if (!txt?.startsWith('/compare')) return null;

  // Giữ dấu ngoặc kép cho tên có khoảng trắng
  const m = txt.match(/^\/compare\s+(.+?)\s+(.+?)(?:\s+(5m|1h|24h))?$/i);
  if (!m) return null;

  const raw1 = m[1].replace(/^"(.*)"$/, '$1').replace(/[-_]+/g, ' ').trim();
  const raw2 = m[2].replace(/^"(.*)"$/, '$1').replace(/[-_]+/g, ' ').trim();
  const h = (m[3]?.toLowerCase() as Horizon) ?? '1h';

  if (!raw1 || !raw2) return null;
  return { q1: raw1, q2: raw2, h };
}

/**
 * Resolve từ input (symbol hoặc tên) -> document coin mới nhất.
 * Ưu tiên:
 *  1) exact symbol (case-insensitive)
 *  2) exact name (case-insensitive)
 *  3) partial name (i, contains)
 */
async function resolveCoin(query: string) {
  const symbol = query.toUpperCase();

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
    .sort({ cmc_rank: 1, version: -1 })
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

// ===== /compare — so sánh 2 coin
bot.command('compare', async (ctx: any) => {
  const args = parseCompareArgs(ctx.message?.text || '');
  if (!args) {
    return ctx.reply(
      'Cách dùng: `/compare <coin1> <coin2> [5m|1h|24h]`\n' +
      'Ví dụ: `/compare BTC ETH`, `/compare bitcoin "bitcoin cash" 24h`',
      { parse_mode: 'Markdown' }
    );
  }
  await handleCompareCommand(ctx, args.q1, args.q2, args.h);
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

    const symbol = coin.symbol.toUpperCase();
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

async function handleCompareCommand(ctx: any, q1: string, q2: string, h: Horizon = '1h') {
  try {
    const c1 = await resolveCoin(q1);
    const c2 = await resolveCoin(q2);

    if (!c1 && !c2) return ctx.reply(`❗ Không tìm thấy dữ liệu cho cả hai: "${q1}" và "${q2}".`);
    if (!c1) return ctx.reply(`❗ Không tìm thấy dữ liệu cho: "${q1}".`);
    if (!c2) return ctx.reply(`❗ Không tìm thấy dữ liệu cho: "${q2}".`);

    const s1 = String(c1.symbol).toUpperCase();
    const n1 = c1.name || s1;
    const s2 = String(c2.symbol).toUpperCase();
    const n2 = c2.name || s2;

    await ctx.reply(
      `⏳ Đang so sánh *${n1}* (${s1}) và *${n2}* (${s2}) — khung *${h}* ...`,
      { parse_mode: 'Markdown' }
    );

    const [p1, p2] = await Promise.all([ getPrediction(s1, h), getPrediction(s2, h) ]);
    if (!p1?.ok || !p2?.ok) {
      return ctx.reply('⚠️ Không đủ dữ liệu dự báo cho một trong hai coin. Thử khung khác (vd. 1h) nhé.');
    }

    const price1 = c1.currentPrice != null ? `$${fmtPrice(c1.currentPrice)}` : (p1.yhat ? `$${fmtPrice(p1.yhat)}` : 'N/A');
    const price2 = c2.currentPrice != null ? `$${fmtPrice(c2.currentPrice)}` : (p2.yhat ? `$${fmtPrice(p2.yhat)}` : 'N/A');

    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });

    const better =
      p1.yhat > p2.yhat
        ? `${n1} (${s1}) có mục tiêu cao hơn`
        : p1.yhat < p2.yhat
          ? `${n2} (${s2}) có mục tiêu cao hơn`
          : `Hai bên có mục tiêu tương đương`;

    const risk1 = confidenceText(p1.yhat, p1.yhat_lower, p1.yhat_upper);
    const risk2 = confidenceText(p2.yhat, p2.yhat_lower, p2.yhat_upper);

    const lines: string[] = [];
    lines.push(`*So sánh ${h}*`);
    lines.push(`• *${n1}* (${s1}) — Giá: *${price1}*`);
    lines.push(`   ↳ Dự báo: $${fmt(p1.yhat)} (biên $${fmt(p1.yhat_lower)} – $${fmt(p1.yhat_upper)}; độ tin cậy ${risk1})`);
    lines.push(`• *${n2}* (${s2}) — Giá: *${price2}*`);
    lines.push(`   ↳ Dự báo: $${fmt(p2.yhat)} (biên $${fmt(p2.yhat_lower)} – $${fmt(p2.yhat_upper)}; độ tin cậy ${risk2})`);
    lines.push(`\n*Nhận định nhanh:* ${better}.`);

    const f1 = p1.features || {}; const f2 = p2.features || {};
    const fstr = (f:any) => [
      Number.isFinite(f.rsi) ? `RSI ${f.rsi.toFixed(1)}` : null,
      Number.isFinite(f.macd) ? `MACD ${f.macd.toFixed(2)}` : null,
      Number.isFinite(f.bb_pos) ? `BBpos ${(f.bb_pos*100).toFixed(0)}%` : null,
    ].filter(Boolean).join(' · ');
    if (fstr(f1)) lines.push(`\n• Chỉ báo ${s1}: ${fstr(f1)}`);
    if (fstr(f2)) lines.push(`• Chỉ báo ${s2}: ${fstr(f2)}`);

    lines.push(`\n*Lưu ý:* Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.`);
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });

    // (Tuỳ chọn) Inline keyboard đổi nhanh khung — cần thêm callback_query handler bên dưới
    await ctx.reply(`Đổi khung thời gian cho cặp ${s1} vs ${s2}?`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "5m",  callback_data: `cmp:${s1}:${s2}:5m` },
           { text: "1h",  callback_data: `cmp:${s1}:${s2}:1h` },
           { text: "24h", callback_data: `cmp:${s1}:${s2}:24h` }]
        ]
      }
    });
  } catch {
    await ctx.reply('❌ Có lỗi khi so sánh 2 coin. Bạn thử lại sau nhé!');
  }
}

// ===== (Tuỳ chọn) Handler callback_query cho inline keyboard compare
bot.on('callback_query', async (ctx:any) => {
  try {
    const data = ctx.callbackQuery?.data || "";
    if (data.startsWith('cmp:')) {
      // cmp:SYM1:SYM2:H
      const [, s1, s2, h] = data.split(':');
      await handleCompareCommand(ctx, s1, s2, h as Horizon);
      await ctx.answerCbQuery();
      return;
    }
    await ctx.answerCbQuery();
  } catch {
    // ignore
  }
});

// ===== Handler text: giữ logic email, tránh đè lên command
bot.on('text', async (ctx: any) => {
  const userId = ctx.from?.id;
  const text = ctx.message?.text || '';

  if (text.startsWith('/predict') || text.startsWith('/compare') || text.startsWith('/start')) return;
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
    { command: 'compare', description: 'So sánh 2 coin: /compare <coin1> <coin2> [5m|1h|24h]' },
  ]);
  bot.launch();
  console.log('Telegram bot started');
}

export { bot };
