import express, { Application } from 'express';
import { connectToDatabase } from './config/ConnectDB';
import coinRoutes from './routes/coinRoutes';
import authRoutes from './routes/authRoute';
import cors from 'cors';
import axios from 'axios';
import { maybeAuth } from './middlewares/maybeAuth';
import watchlistRoutes from './routes/watchListRoute';
import notificationRoutes from './routes/notificationRoutes';
import { startTelegramBot } from './bots/telegramBot';
import cron from 'node-cron';
const app: Application = express();

app.use(express.json()); 
app.use(cors({ origin: true, credentials: true }));

connectToDatabase();

app.use('/api/coins', maybeAuth, coinRoutes);
app.use('/api/auth',  authRoutes); 
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/notifications', notificationRoutes);

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
  await axios.post('http://localhost:5000/api/notifications/send-notifications', {}, {
  headers: { 'x-cron-key': process.env.CRON_KEY || 'dev_cron_key' }
});

}

fetchAndStoreCoins();

cron.schedule('*/5 * * * *', () => {
  fetchAndStoreCoins();
}, { timezone: 'Asia/Bangkok' });
startTelegramBot();

cron.schedule('0 7 * * *', () => {
  void getNotifications();
}, { timezone: 'Asia/Bangkok' });


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
