// apps/be/middlewares/requireCronKey.ts
import { Request, Response, NextFunction } from 'express';
import { Env } from '../config/env';
export function requireCronKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header('x-cron-key');
  if (!key || key !== (Env.CRON_KEY || '')) {
    return res.status(401).json({ error: true, message: 'Invalid cron key' });
  }
  next();
}
