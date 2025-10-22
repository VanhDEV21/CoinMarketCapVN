import Coin from '../models/CoinModel';
import { ICoin } from '../interfaces/ICoin';

export class CoinRepository {
  async findCoinInfoBySymbolSlugId(symbol: string, slug: string, id: number): Promise<ICoin | null> {
    return Coin.findOne({ symbol: symbol, slug: slug, id: id });
  }
  
  async findTopCoins(limit: number = 100): Promise<ICoin[]> {
    return Coin.find()
      .sort({ version: -1})
      .sort({ cmc_rank: 1})
      .limit(limit);  
  }
}
