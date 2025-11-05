// apps/be/middlewares/requireCronKey.ts
import { Request, Response, NextFunction } from 'express';
export function requireCronKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header('x-cron-key');
  if (!key || key !== (process.env.CRON_KEY || 'dev_cron_key')) {
    return res.status(401).json({ error: true, message: 'Invalid cron key' });
  }
  next();
}
