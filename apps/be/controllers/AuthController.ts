import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';

const svc = new AuthService();

export class AuthController {
  register = async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body || {};
      const result = await svc.register(email, password, name);
      res.json(result); // { token, user }
    } catch (e:any) {
      res.status(400).json({ error: true, message: e.message || 'Register failed' });
    }
  };

  login = async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      const result = await svc.login(email, password);
      res.json(result);
    } catch (e:any) {
      res.status(400).json({ error: true, message: e.message || 'Login failed' });
    }
  };
}
