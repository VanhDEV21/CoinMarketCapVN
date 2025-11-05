import express, { Application } from 'express';
import { connectToDatabase } from './config/ConnectDB';
import coinRoutes from './routes/coinRoutes';
import authRoutes from './routes/authRoute';
import cors from 'cors';
import axios from 'axios';
import { maybeAuth } from './middlewares/maybeAuth';
import watchlistRoutes from './routes/watchListRoute';
import notifyRoutes from './routes/notifycationRoutes';
import { startTelegramBot } from './bots/telegramBot';
const app: Application = express();

app.use(express.json()); 
app.use(cors({ origin: true, credentials: true }));

connectToDatabase();

app.use('/api/coins', maybeAuth, coinRoutes);
app.use('/api/auth',  authRoutes); 
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/notifications', notifyRoutes);

async function fetchAndStoreCoins() {
  axios.get('http://localhost:5000/api/coins/fetch-and-store')
    .then(response => {
      console.log('API fetch-and-store success:', response.data);
    })
    .catch(error => {
      console.error('Error fetching and storing coins:', error);
    });
}

fetchAndStoreCoins();

setInterval(() => {
  fetchAndStoreCoins();
}, 5 * 60 * 1000);
startTelegramBot();
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
