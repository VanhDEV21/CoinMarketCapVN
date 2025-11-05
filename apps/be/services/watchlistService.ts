import Watchlist from '../models/WatchListModel';

export async function getWatchlistForUser(userId: number) {
  try {
    const watchlist = await Watchlist.findOne({ userId }).lean();
    return watchlist ? watchlist.items : [];
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    return [];
  }
}
