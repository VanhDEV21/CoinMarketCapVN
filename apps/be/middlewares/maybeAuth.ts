// apps/be/middlewares/maybeAuth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export function maybeAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (token) {
    try { (req as any).auth = jwt.verify(token, JWT_SECRET); } catch { /* ignore */ }
  }
  next();
}
