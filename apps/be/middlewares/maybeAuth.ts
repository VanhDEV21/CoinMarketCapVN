// apps/be/middlewares/maybeAuth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Env } from '../config/env';
const JWT_SECRET = Env.JWT_SECRET;

export function maybeAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (token) {
    try { (req as any).auth = jwt.verify(token, JWT_SECRET); } catch { /* ignore */ }
  }
  next();
}
