import express, { Application } from 'express';
import { Env } from './config/env';
import { connectToDatabase } from './config/ConnectDB';
import coinRoutes from './routes/coinRoutes';
import authRoutes from './routes/authRoute';
import watchlistRoutes from './routes/watchListRoute';
import notificationRoutes from './routes/notificationRoutes';
import CEXRoutes from "./routes/CEXRoutes";
import DEXRoutes from "./routes/DEXRoutes";
import aiRoute from './routes/aiRoute';
import cors from 'cors';
import axios from 'axios';
import { maybeAuth } from './middlewares/maybeAuth';
import { checkCoinChangesAndNotifyEmergency } from './services/checkCoinChangesAndNotifyEmergency';
import {checkHyperliquidWhaleDepositsAndNotify} from './services/HyperLiquidWhaleWatcher';
import { startTelegramBot } from './bots/telegramBot';
import { pruneOldByVersion } from './services/pruneByVersion';
import cron from 'node-cron';
const app: Application = express();

app.use(express.json()); 
app.use(cors({ origin: true, credentials: true }));

connectToDatabase();

app.use('/api/coins', maybeAuth, coinRoutes);
app.use('/api/auth',  authRoutes); 
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoute);
app.use("/api/exchanges", CEXRoutes);
app.use('/api/dex', DEXRoutes);
async function fetchAndStoreCoins() {
  return axios.get(`${Env.LOCALHOST}/api/coins/fetch-and-store`)
    .then(response => {
      console.log('API fetch-and-store success:', response.data);
    })
    .catch(error => {
      console.error('Error fetching and storing coins:', error);
    });
}

async function getNotifications(){
  // TRẢ VỀ promise của axios
  return axios.post(`${Env.LOCALHOST}/api/api/notifications/send-notifications`, {})
    .then(res => console.log('[watchlist] success:', res.status, res.data))
    .catch(err => console.error('[watchlist] FAILED', err?.response?.status, err?.response?.data || err?.message || err));
}
startTelegramBot();
checkHyperliquidWhaleDepositsAndNotify();
let isFetchRunning =  false;
let isNotifRunning = false;


cron.schedule('*/5 * * * *', async () => {
  const th = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  console.log('[CRON */5] tick', th.toISOString());

  if (isFetchRunning) return console.warn('[CRON */5] skipped (fetch running)');
  isFetchRunning = true;
  try {
    await fetchAndStoreCoins();
    await checkCoinChangesAndNotifyEmergency();
    await checkHyperliquidWhaleDepositsAndNotify();
  } catch (e) {
    console.error('[CRON */5] error', e);
  } finally {
    isFetchRunning = false;
  }
}, { timezone: 'Asia/Bangkok' });

// 7:01 AM everyday
cron.schedule('1 7 * * *', async () => {
  const th = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  console.log('[CRON 07:01] tick', th.toISOString());

  if (isNotifRunning) return console.warn('[CRON 07:01] skipped (notif running)');
  isNotifRunning = true;
  try {
    await getNotifications();
  } catch (e) {
    console.error('[CRON 07:01] error', e);
  } finally {
    isNotifRunning = false;
  }
}, { timezone: 'Asia/Bangkok' });

cron.schedule('30 12 * * *', async () => {
  try {
    const r = await pruneOldByVersion();
    console.log('[pruneByVersion]', r);
    return r;
  } catch (e) {
    console.error('[pruneByVersion] failed:', e);
  }
}, { timezone: 'Asia/Bangkok' });

cron.schedule('2 14 * * *', async () => {
  const th = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  console.log('[CRON 14:02] tick', th.toISOString());

  if (isNotifRunning) return console.warn('[CRON 07:01] skipped (notif running)');
  isNotifRunning = true;
  try {
    await getNotifications();
  } catch (e) {
    console.error('[CRON 14:02] error', e);
  } finally {
    isNotifRunning = false;
  }
}, { timezone: 'Asia/Bangkok' });
cron.schedule('3 12 * * *', async () => {
  const th = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  console.log('[CRON 12:03] tick', th.toISOString());

  if (isNotifRunning) return console.warn('[CRON 07:01] skipped (notif running)');
  isNotifRunning = true;
  try {
    await getNotifications();
  } catch (e) {
    console.error('[CRON 12:03] error', e);
  } finally {
    isNotifRunning = false;
  }
}, { timezone: 'Asia/Bangkok' });

const PORT = Env.PORT||5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
