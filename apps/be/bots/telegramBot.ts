import { Telegraf } from 'telegraf';
import UserModel from '../models/UserModel';  // Model người dùng của bạn
import { session } from 'telegraf';  // Sử dụng session tích hợp của Telegraf

const TELEGRAM_BOT_TOKEN = '8291089808:AAHuFVAXlyJ2U1BrUjpzS1Qb_J6PIjpbVwA';  // Token bot của bạn
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Cấu hình session tích hợp của Telegraf
bot.use(session());

// Khi người dùng bắt đầu trò chuyện với bot (lệnh /start)
bot.start(async (ctx) => {
  // Kiểm tra nếu ctx.session không tồn tại và khởi tạo nó nếu cần
  if (!ctx.session) {
    ctx.session = {};  // Khởi tạo session nếu chưa có
  }

  ctx.reply('Chào bạn! Để liên kết tài khoản với bot, vui lòng cung cấp email của bạn.');
  // Chuyển qua trạng thái thu thập email
  ctx.session.state = 'waitingForEmail'; 
});

// Xử lý người dùng gửi email
bot.on('text', async (ctx) => {
  const userId = ctx.from?.id;
  const email = ctx.message?.text;
  console.log(email);
  if (!userId || !email) return;

  if (ctx.session.state === 'waitingForEmail') {
    if (!isValidEmail(email)) {
      return ctx.reply('Email không hợp lệ. Vui lòng gửi lại một email hợp lệ.');
    }

    // Kiểm tra email đã đăng ký trong hệ thống chưa
    const existingUser = await UserModel.findOne({ email }).lean();

    if (existingUser) {
      // Nếu email đã đăng ký, lưu chatId và liên kết tài khoản
      await linkUserTelegramAccount(existingUser, userId);
      ctx.reply('Tài khoản của bạn đã được liên kết với bot. Bạn sẽ nhận được thông báo từ bot sau này.');
    } else {
      // Nếu email chưa đăng ký, yêu cầu người dùng đăng ký tài khoản
      ctx.reply('Email này chưa được đăng ký trong hệ thống. Vui lòng đăng ký tài khoản trước khi sử dụng bot.');
      // Kết thúc trò chuyện
      ctx.session.state = 'finished';
      ctx.reply('Chúc bạn một ngày tốt lành!');
    }

    // Kết thúc quá trình thu thập email
    ctx.session.state = 'finished';
  }
});

// Liên kết tài khoản Telegram với người dùng trong hệ thống
async function linkUserTelegramAccount(user: any, chatId: number) {
  const existingUser = await UserModel.findOne({ _id: user._id });
  
  if (!existingUser) {
    // Nếu không có người dùng, trả về
    return;
  }

  // Cập nhật chatId vào cơ sở dữ liệu người dùng
  await UserModel.updateOne(
    { _id: user._id },
    { $set: { telegramChatId: chatId } }
  );
  console.log(`Liên kết tài khoản Telegram với email ${user.email}`);
}

// Hàm kiểm tra email hợp lệ
function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  return emailRegex.test(email);
}

// Khởi động bot
export function startTelegramBot() {
  bot.launch();
  console.log('Telegram bot started');
}
export { bot };