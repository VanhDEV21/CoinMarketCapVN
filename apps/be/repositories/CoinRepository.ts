import Coin from '../models/CoinModel';
import { ICoin } from '../interfaces/ICoin';

export class CoinRepository {
  
  async findTopCoins(limit: number = 200): Promise<ICoin[]> {
    return Coin.find()
      .sort({ version: -1})
      .sort({ cmc_rank: 1})
      .limit(limit);  
  }

  async findHistoryBySymbol(symbol: string): Promise<ICoin[] | null> {
    return Coin.find({ symbol: symbol })
      .select({ currentPrice: 1,volume24h: 1,marketCap: 1, timestamp: 1, version: 1, _id: 0 })
      .sort({ timestamp: -1 })
      .lean();
  }

 async aggregateOHLC(symbol: string, intervalMinutes = 60, limit?: number, to?: Date) {
  const sym = symbol;
  const intervalMs = intervalMinutes * 60_000;

  // lấy mốc cuối
  const lastDoc = await Coin.findOne({ symbol: sym }).sort({ timestamp: -1 }).select({ timestamp: 1 }).lean();
  if (!lastDoc) return [];
  const end = to ? to.getTime() : new Date(lastDoc.timestamp).getTime();

  let docs;
  if (!Number.isFinite(limit as number) || (limit as number) <= 0) {
    docs = await Coin.find({ symbol: sym })
      .sort({ timestamp: 1 })
      .select({ currentPrice: 1, volume24h: 1, timestamp: 1 })
      .lean();
  } else {
    const start = end - intervalMs * (limit as number) * 3;
    docs = await Coin.find({
      symbol: sym,
      timestamp: { $gte: new Date(start), $lte: new Date(end) },
    })
      .sort({ timestamp: 1 })
      .select({ currentPrice: 1, volume24h: 1, timestamp: 1 })
      .lean();
  }

  if (!docs.length) return [];
  const buckets = new Map<number, { o: number; h: number; l: number; c: number; vAgg: number; vCnt: number }>();
  for (const d of docs) {
    const ts = new Date(d.timestamp).getTime();
    const key = ts - (ts % intervalMs);
    const price = d.currentPrice;
    const vol24h = d.volume24h ?? 0;
    const b = buckets.get(key);
    if (!b) buckets.set(key, { o: price, h: price, l: price, c: price, vAgg: vol24h, vCnt: 1 });
    else { b.h = Math.max(b.h, price); b.l = Math.min(b.l, price); b.c = price; b.vAgg += vol24h; b.vCnt += 1; }
  }

  const candles = Array.from(buckets.entries()).sort((a,b)=>a[0]-b[0]).map(([key, b]) => ({
    t: new Date(key),
    open: b.o, high: b.h, low: b.l, close: b.c,
    volume: (b.vCnt ? (b.vAgg / b.vCnt) : 0) * (intervalMinutes / 1440),
  }));

  if (Number.isFinite(limit as number) && (limit as number) > 0) return candles.slice(-(limit as number));
  return candles;
}


  
}
