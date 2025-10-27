import Coin from '../models/CoinModel';
import { ICoin } from '../interfaces/ICoin';

export class CoinRepository {
  // async findCoinInfoBySymbolSlugId(symbol: string, slug: string, id: number): Promise<ICoin | null> {
  //   return Coin.findOne({ symbol: symbol, slug: slug, id: id });
  // }
  
  async findTopCoins(limit: number = 100): Promise<ICoin[]> {
    return Coin.find()
      .sort({ version: -1})
      .sort({ cmc_rank: 1})
      .limit(limit);  
  }

  async findHistoryBySymbol(symbol: string, count:number): Promise<ICoin[] | null> {
    return Coin.find({ symbol: symbol })
      .select({ currentPrice: 1,volume24h: 1, timestamp: 1, version: 1, _id: 0 })
      .sort({ timestamp: -1 })
      .limit(count)
      .lean();
  }

  async aggregateOHLC(
    symbol: string,
    intervalMinutes = 60,
    limit = 100,
    to?: Date
  ) {
    const sym = symbol.toUpperCase();
    const intervalMs = intervalMinutes * 60 * 1000;

    // lấy timestamp mới nhất để xác định cửa sổ query
    const lastDoc = await Coin.findOne({ symbol: sym })
      .sort({ timestamp: -1 })
      .select({ timestamp: 1 })
      .lean();

    if (!lastDoc) return [];

    const end = to ? to.getTime() : new Date(lastDoc.timestamp).getTime();
    const start = end - intervalMs * limit * 3; // query rộng hơn ~3x để đủ dữ liệu gom nhóm

    const docs = await Coin.find({
      symbol: sym,
      timestamp: { $gte: new Date(start), $lte: new Date(end) },
    })
      .sort({ timestamp: 1 })
      .select({ currentPrice: 1, volume24h: 1, timestamp: 1 })
      .lean();

    if (!docs.length) return [];

    const buckets = new Map<number, {
      o: number; h: number; l: number; c: number; // price
      vAgg: number; vCnt: number;                 // volume proxy
      firstTs: number; lastTs: number;
    }>();

    for (const d of docs) {
      const ts = new Date(d.timestamp).getTime();
      const key = ts - (ts % intervalMs); // ✅ align về mốc thời gian chuẩn

      const cur = buckets.get(key);
      const price = d.currentPrice;
      const vol24h = d.volume24h ?? 0;

      if (!cur) {
        buckets.set(key, {
          o: price,
          h: price,
          l: price,
          c: price,
          vAgg: vol24h,
          vCnt: 1,
          firstTs: ts,
          lastTs: ts,
        });
      } else {
        cur.h = Math.max(cur.h, price);
        cur.l = Math.min(cur.l, price);
        cur.c = price;
        cur.vAgg += vol24h;
        cur.vCnt += 1;
        cur.lastTs = ts;
      }
    }

    // map → array + sort + cắt limit cuối
    const candles = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([key, b]) => {
        // proxy volume: average 24h volume scaled by interval
        const avgVol24h = b.vCnt ? (b.vAgg / b.vCnt) : 0;
        const volProxy = avgVol24h * (intervalMinutes / 1440);
        return {
          t: new Date(key),
          open: b.o,
          high: b.h,
          low:  b.l,
          close: b.c,
          volume: volProxy, // proxy
        };
      });

    return candles.slice(-limit);
  }


}
