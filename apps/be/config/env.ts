import dotenv from 'dotenv';

dotenv.config();

export const Env = {
  PORT: Number(process.env.PORT) || 5000,
  NODE_ENV: process.env.NODE_ENV||'development',
  MONGO_URI: process.env.MONGO_URI,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  API_KEY: process.env.API_KEY,
  LOCALHOST: process.env.LOCALHOST,
  JWT_SECRET: process.env.JWT_SECRET,
  CRON_KEY: process.env.CRON_KEY,
};