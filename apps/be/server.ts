import express, { Application } from 'express';
import { connectToDatabase } from './config/ConnectDB';
import coinRoutes from './routes/coinRoutes';
import authRoutes from './routes/authRoute';
import watchlistRoutes from './routes/watchListRoute';
import notificationRoutes from './routes/notificationRoutes';
import aiRoute from './routes/aiRoute';
import cors from 'cors';
import axios from 'axios';
import { maybeAuth } from './middlewares/maybeAuth';
import { checkCoinChangesAndNotifyEmergency } from './services/checkCoinChangesAndNotifyEmergency';
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
async function fetchAndStoreCoins() {
  axios.get('http://localhost:5000/api/coins/fetch-and-store')
    .then(response => {
      console.log('API fetch-and-store success:', response.data);
    })
    .catch(error => {
      console.error('Error fetching and storing coins:', error);
    });
}
async function getNotifications(){
  try {
    const res = await axios.post(
      'http://localhost:5000/api/notifications/send-notifications',
      {},
      { headers: { 'x-cron-key': process.env.CRON_KEY || 'dev_cron_key' } }
    );
    console.log('[watchlist] success:', res.status, res.data);
  } catch (err: any) {
    console.error('[watchlist] FAILED',
      err?.response?.status,
      err?.response?.data || err?.message || err
    );
  }
}
fetchAndStoreCoins();
cron.schedule('*/5 * * * *', async() => {
  await fetchAndStoreCoins();
  await checkCoinChangesAndNotifyEmergency();
}, { timezone: 'Asia/Bangkok' });

startTelegramBot();
// 7:01 AM everyday
cron.schedule('1 7 * * *', async() => {
  console.log('Cron job running at:', new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  await getNotifications();
}, { timezone: 'Asia/Bangkok' });
// 11 AM every day
cron.schedule('0 11 * * *', async() => {
  console.log('Sending notifications at 11 AM...');
  await getNotifications();
}, { timezone: 'Asia/Bangkok' });

// 12 PM (noon) every day
cron.schedule('0 12 * * *', async() => {
  console.log('Sending notifications at 12 PM...');
  await getNotifications();
}, { timezone: 'Asia/Bangkok' });

// 2 PM every day
cron.schedule('0 14 * * *', async() => {
  console.log('Sending notifications at 2 PM...');
  await getNotifications();
}, { timezone: 'Asia/Bangkok' });
cron.schedule('30 12 * * *', async () => {
  try {
    const r = await pruneOldByVersion();
    console.log('[pruneByVersion]', r);
  } catch (e) {
    console.error('[pruneByVersion] failed:', e);
  }
}, { timezone: 'Asia/Bangkok' });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
