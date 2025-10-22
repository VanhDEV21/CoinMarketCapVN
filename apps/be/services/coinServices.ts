import axios from 'axios';
import { CoinRepository } from '../repositories/CoinRepository';
import { ICoin } from '../interfaces/ICoin';
import Coin from '../models/CoinModel';

const API_KEY = '73feb218-7d95-459b-a40b-5f726d5c9c01';
export class CoinService {
  private coinRepo: CoinRepository;

  constructor() {
    this.coinRepo = new CoinRepository();

  }
  
  async fetchAndStoreCoins(): Promise<void> {
    try {

      const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest', {
        headers: {
          'X-CMC_PRO_API_KEY': API_KEY,  
          'Accept': 'application/json',
        },
        params: {
          limit: 200,
          convert: 'USD',
          sort: 'market_cap',
        },
      });

      const coinsData = response.data.data;
      if (coinsData.length === 0) {
        console.log('No coin data found!');
        return;
      }
      const lastRecord = await Coin.findOne().sort({ version: -1 }); 
       const newVersion = (lastRecord && !isNaN(lastRecord.version)) ? lastRecord.version + 1 : 1;
      for (const coin of coinsData) {
        const {
          id,
          name,
          symbol,
          slug,
          cmc_rank,
          circulating_supply,
          total_supply,
          max_supply,
          quote: { USD },
        } = coin;

        const currentPrice = USD.price;
        const volume24h = USD.volume_24h;
        const percentChange1h = USD.percent_change_1h;
        const percentChange24h = USD.percent_change_24h;
        const percentChange7d = USD.percent_change_7d;
        const fullyDilutedMarketCap = USD.fully_diluted_market_cap;
        const marketCapDominance = USD.market_cap_dominance;
        const marketCap = USD.market_cap;
        const volumeChange24h = USD.volume_change_24h;
        const previousCoin = await Coin.findOne({ symbol }).sort({ version: -1 }).skip(1);
        let percentChange5min = 0;
        if (previousCoin) {
          const previousPrice = previousCoin.currentPrice;
          percentChange5min = ((currentPrice - previousPrice) / previousPrice) * 100; 
        }

        const coinData: ICoin = {
          cmc_Id: id,
          name,
          symbol,
          slug,
          circulating_supply,
          total_supply,
          max_supply,
          currentPrice,
          volume24h,
          percentChange5min,
          percentChange1h,
          percentChange24h,
          percentChange7d,
          marketCap,
          fullyDilutedMarketCap,
          marketCapDominance,
          volumeChange24h,
          cmc_rank,
          timestamp: new Date(),
          version: newVersion
        };
        const newCoin = new Coin(coinData);
        await newCoin.save();
         console.log(`Coin ${symbol} saved successfully with version ${newVersion}`);
      }
    } catch (error) {
      console.error('Error fetching/saving coin data:', error);
    }
  }
  async getTopCoins(): Promise<ICoin[]> {
    try {
      const topCoins = await this.coinRepo.findTopCoins(100);
      return topCoins;
    } catch (error) {
      console.error('Error fetching top coins:', error);
      throw error; 
    }
  }

  async getHistoryBySymbol(symbol: string, count = 2016) {
    const take = Math.min(Number(count) || 2016, 10000);

    const docs = await Coin.find({ symbol: symbol })
      .select({ currentPrice: 1, timestamp: 1, version: 1, _id: 0 })
      .sort({ timestamp: -1 })
      .limit(take)             
      .lean();

    docs.reverse();

    return docs.map(d => ({
      t: d.timestamp,
      price: d.currentPrice,
      version: d.version,
    }));
  }

}
