import express from 'express';
import { WatchlistController } from '../controllers/WatchListController';
import { requireAuth } from '../middlewares/requireAuth';

const router = express.Router();
const ctrl = new WatchlistController();

// tất cả endpoint watchlist yêu cầu login
router.get('/get-watchlist',            requireAuth, ctrl.getWatchlist);
router.post('/add-watchlist',           requireAuth, ctrl.addToWatchlist);
router.delete('/:symbol',  requireAuth, ctrl.removeFromWatchlist);
// optional toggle
router.post('/toggle',  requireAuth, ctrl.toggleWatchlist);

export default router;
