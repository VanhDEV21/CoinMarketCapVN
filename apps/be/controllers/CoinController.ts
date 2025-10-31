import { CoinService } from '../services/coinServices';
import {Request, Response} from 'express';
import { getMarketsForSymbol } from "../services/marketService";

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
    public getOHLC = async (req: Request, res: Response) => {
      try {
        const symbol = req.params.symbol;
        const tf = (req.query.tf as string) || req.query.interval || '60';
        let limit: number | undefined;
        if (req.query.limit === undefined) {
          limit = undefined;
        } else {
          const raw = String(req.query.limit).toLowerCase();
          if (raw === 'all') limit = undefined;
          else {
            const n = Number(raw);
            limit = Number.isFinite(n) && n > 0 ? n : undefined; // giá trị xấu => ALL
          }
        }

        const data = await this.coinService.getOHLCFromExistingData(symbol, tf as string, limit);
        res.status(200).json(data);
      } catch (error) {
        console.error('Error fetching OHLC:', error);
        res.status(500).json({ error: 'Error fetching OHLC data' });
      }
  };
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
