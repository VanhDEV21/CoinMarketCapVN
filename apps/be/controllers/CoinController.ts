import { CoinService } from '../services/coinServices';
import coinRepo from '../repositories/CoinRepository';
import {Request, Response} from 'express';
import { getMarketsForSymbol } from "../services/marketService";
import { tfToMinutes, isValidTimeframe } from '../utils/tsToMinutes';
export class CoinController {
  private coinService: CoinService;
  constructor() {
    this.coinService = new CoinService();
  }

  public fetchAndStoreCoins = async (req: Request, res: Response) => {
    try {
      await this.coinService.fetchAndStoreCoins();
      console.log("API FETCH FROM CMC SUCCESS");
      res.status(200).json({ message: 'Coins fetched and stored successfully' });
    } catch (error) {
      console.error('Error fetching and storing coins:', error);
      res.status(500).json({ error: 'Error fetching and storing coins' });
    }
  };

  public getTopCoins = async (req: Request, res: Response) => {
    try {
      const topCoins = await this.coinService.getTopCoins();
      console.log("API GET TOP COINS SUCCESS");
      res.status(200).json(topCoins);
    } catch (error) {
      console.error('Error fetching top coins:', error);
      res.status(500).json({ error: 'Error fetching top coins' });
    }
  };

    public getHistoryBySymbol = async (req: Request, res: Response) => {
    try {
      const symbol = (req.params.symbol || '');
      const data = await this.coinService.getHistoryBySymbol(symbol);
      res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching coin history:', error);
      res.status(500).json({ error: 'Error fetching coin history' });
    }
  };
 async  getOHLC(req: Request, res: Response) {
  try {
    const symbol = String(req.params.symbol || req.query.symbol || '');
    if (!symbol) return res.status(400).json({ ok:false, message:'symbol required' });

    // mặc định vẫn là 1h để giữ hành vi cũ
    const tf = String(req.query.tf || '1h').toLowerCase();
    if (!isValidTimeframe(tf)) return res.status(400).json({ ok:false, message:'invalid tf' });
    const intervalMinutes = tfToMinutes(tf)!; // 5 | 10 | 15 | 30 | 60

    // (tuỳ chọn) hỗ trợ limit nếu FE truyền, còn không thì undefined = full như cũ
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const candles = await coinRepo.aggregateOHLC(symbol, intervalMinutes, limit, undefined);

    return res.json(candles.map(c => ({
      t: c.t, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume
    })));
  } catch (e:any) {
    console.error('getOHLC error:', e);
    return res.status(500).json({ ok:false, message: e?.message || 'server error' });
  }
}
  async getMarkets(req: Request, res: Response) {
  try {
    const symbol = String(req.params.symbol || "");
    const name = String((req.query.name as string) || "").trim();
    const limit = Number(req.query.limit || 50);
    const data = await getMarketsForSymbol(symbol, name, limit);
    return res.json({ error: false, data });
  } catch (e: any) {
    console.error("getMarkets error:", e?.message || e);
    return res.status(500).json({ error: true, message: "Failed to load markets" });
  }
}

}
