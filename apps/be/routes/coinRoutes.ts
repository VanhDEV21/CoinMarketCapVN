// backend/src/routes/coinRoutes.ts
import express from 'express';
import {CoinController} from '../controllers/CoinController';

const router = express.Router();
const coinController = new CoinController();

router.get('/fetch-and-store', coinController.fetchAndStoreCoins);

router.get('/top-coins', coinController.getTopCoins);

router.get('/history/:symbol', coinController.getHistoryBySymbol);

router.get('/ohlc/:symbol', coinController.getOHLC);

router.get('/ohlc', coinController.getOHLC);

router.get('/markets/:symbol', coinController.getMarkets);


export default router;
