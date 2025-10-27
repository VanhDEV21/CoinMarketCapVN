import express from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from '../controllers/AuthController';

const router = express.Router();
const ctrl = new AuthController();
const limiter = rateLimit({ windowMs: 60_000, max: 20 });

router.post('/register', limiter, ctrl.register);
router.post('/login',    limiter, ctrl.login);

export default router;
