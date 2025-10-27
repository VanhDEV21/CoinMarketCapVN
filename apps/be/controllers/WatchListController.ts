import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Watchlist from '../models/WatchListModel';

export class WatchlistController {
  /** GET /api/watchlist */
  public getWatchlist = async (req: Request, res: Response) => {
    try {
      const uid = (req as any).auth?.uid;
      const userId = new mongoose.Types.ObjectId(uid);
      const wl = await Watchlist.findOne({ userId }).lean();
      return res.json({ items: wl?.items || [] });
    } catch (e: any) {
      console.error('getWatchlist error:', e);
      return res.status(500).json({ error: true, message: e.message || 'Internal error' });
    }
  };

  /** POST /api/watchlist  body: { symbol } */
public addToWatchlist = async (req: Request, res: Response) => {
  try {
    const uid = (req as any).auth?.uid;
    if (!uid) return res.status(401).json({ error: true, message: 'Login required' });

    const symbolRaw = String(req.body?.symbol || '').trim();
    if (!symbolRaw) return res.status(400).json({ error: true, message: 'Missing symbol' });

    const userId = new mongoose.Types.ObjectId(uid);

    const wl = await Watchlist.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: { userId },                
        $set: { updatedAt: new Date() },
        $addToSet: { items: { symbol: symbolRaw, addedAt: new Date() } },
      },
      { new: true, upsert: true }
    );

    return res.json({ ok: true, items: wl?.items || [] });
  } catch (e: any) {
    console.error('addToWatchlist error:', e);
    return res.status(500).json({ error: true, message: e.message || 'Internal error' });
  }
};


  /** DELETE /api/watchlist/:symbol */
  public removeFromWatchlist = async (req: Request, res: Response) => {
    try {
      const uid = (req as any).auth?.uid;
      const symbolRaw = String(req.params.symbol || '').toUpperCase().trim();
      if (!symbolRaw) return res.status(400).json({ error: true, message: 'Missing symbol' });

      const userId = new mongoose.Types.ObjectId(uid);
      const wl = await Watchlist.findOneAndUpdate(
        { userId },
        { $pull: { items: { symbol: symbolRaw } }, $set: { updatedAt: new Date() } },
        { new: true }
      );
      return res.json({ ok: true, items: wl?.items || [] });
    } catch (e: any) {
      console.error('removeFromWatchlist error:', e);
      return res.status(500).json({ error: true, message: e.message || 'Internal error' });
    }
  };

  /** (optional) POST /api/watchlist/toggle  body: { symbol } */
  public toggleWatchlist = async (req: Request, res: Response) => {
    try {
      const uid = (req as any).auth?.uid;
      const symbolRaw = String(req.body?.symbol || '').toUpperCase().trim();
      if (!symbolRaw) return res.status(400).json({ error: true, message: 'Missing symbol' });

      const userId = new mongoose.Types.ObjectId(uid);
      const wl = await Watchlist.findOne({ userId });
      if (!wl) {
        const created = await Watchlist.create({ userId, items: [{ symbol: symbolRaw, addedAt: new Date() }], updatedAt: new Date() });
        return res.json({ ok: true, items: created.items });
      }
      const exists = wl.items.some(i => i.symbol === symbolRaw);
      wl.items = exists ? wl.items.filter(i => i.symbol !== symbolRaw)
                        : [...wl.items, { symbol: symbolRaw, addedAt: new Date() }];
      wl.updatedAt = new Date();
      await wl.save();
      return res.json({ ok: true, items: wl.items });
    } catch (e: any) {
      console.error('toggleWatchlist error:', e);
      return res.status(500).json({ error: true, message: e.message || 'Internal error' });
    }
  };
}
