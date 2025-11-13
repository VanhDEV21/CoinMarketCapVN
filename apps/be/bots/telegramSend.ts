// apps/be/services/telegramSend.ts
import { bot } from '../bots/telegramBot';

function sleep(ms:number){ return new Promise(r=>setTimeout(r, ms)); }

export async function safeSendMessage(chatId: number | string, text: string) {
  const maxRetries = 3;
  let delay = 1000; // 1s → 2s → 4s
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Telegraf có thể treo do mạng, ta tự cắt sau 10s
      const res = await Promise.race([
        bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('local-timeout-10s')), 10_000)),
      ]);
      return res;
    } catch (e:any) {
      const msg = e?.message || '';
      if (i === maxRetries - 1) throw e;      // hết số lần retry
      // chỉ retry khi là lỗi mạng/timeout
      if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|local-timeout/i.test(msg)) {
        await sleep(delay);
        delay *= 2;
      } else {
        throw e; 
      }
    }
  }
}
