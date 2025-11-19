import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Env } from '../config/env';

const JWT_SECRET = Env.JWT_SECRET;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: true, message: 'Missing token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    (req as any).auth = payload; // { uid, role, iat, exp }
    next();
  } catch {
    return res.status(401).json({ error: true, message: 'Invalid token' });
  }
}
