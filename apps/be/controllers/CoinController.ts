import { CoinService } from '../services/coinServices';
import {Request, Response} from 'express';


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
      const data = await this.coinService.getHistoryBySymbol(symbol, 2016);
      res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching coin history:', error);
      res.status(500).json({ error: 'Error fetching coin history' });
    }
  };
}
