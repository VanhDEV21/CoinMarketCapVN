import { Request, Response } from 'express';
import User from '../models/UserModel';

const BOT_DEEP_LINK = 'https://t.me/CRYPTOANNOUCEBOT'; // đường dẫn mở bot

export class NotificationsController {
  async getStatus(req: Request, res: Response) {
    try {
      const uid = (req as any).auth?.uid;
      const user = await User.findById(uid).lean();
      if (!user) return res.status(401).json({ error: true, message: 'Unauthorized' });

      const hasChat = !!user.telegramChatId;
      const enabled = !!user.notificationsEnabled;
      return res.json({ ok: true, hasChat, enabled, botUrl: BOT_DEEP_LINK });
    } catch (e:any) {
      return res.status(500).json({ error: true, message: e.message || 'Internal error' });
    }
  }

  async toggleNotifications(req: Request, res: Response) {
    try {
      const uid = (req as any).auth?.uid;
      const enable = !!req.body?.enabled;

      const user = await User.findById(uid);
      if (!user) return res.status(401).json({ error: true, message: 'Unauthorized' });

      // Nếu bật mà chưa liên kết Telegram -> yêu cầu liên kết
      if (enable && !user.telegramChatId) {
        return res.status(409).json({
          error: true,
          needLink: true,
          message: 'Link Telegram first to enable notifications',
          botUrl: BOT_DEEP_LINK,
        });
      }

      user.notificationsEnabled = enable;
      await user.save();
      return res.json({ ok: true, enabled: user.notificationsEnabled });
    } catch (e:any) {
      return res.status(500).json({ error: true, message: e.message || 'Internal error' });
    }
  }
}
