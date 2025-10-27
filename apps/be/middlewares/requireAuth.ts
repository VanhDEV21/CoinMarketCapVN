import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

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
