import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/UserModel';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES = '7d';

export class AuthService {
  async register(email: string, password: string, name?: string) {
    email = email.toLowerCase().trim();
    if (!/.+@.+\..+/.test(email)) throw new Error('Invalid email');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 chars');

    const exists = await User.findOne({ email }).lean();
    if (exists) throw new Error('Email already registered');

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, name, passwordHash: hash });

    const token = jwt.sign({ uid: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return { token, user: { id: user._id, email: user.email, name: user.username, role: user.role } };
  }

  async login(email: string, password: string) {
    email = email.toLowerCase().trim();
    const user = await User.findOne({ email });
    if (!user) throw new Error('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new Error('Invalid credentials');

    const token = jwt.sign({ uid: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return { token, user: { id: user._id, email: user.email, name: user.username, role: user.role } };
  }
}
