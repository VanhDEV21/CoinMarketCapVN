export interface ICoin {
  cmc_Id: number;
  name: string;
  symbol: string;
  slug: string;

  circulating_supply: number;
  total_supply: number;
  max_supply: number;
  fullyDilutedMarketCap: number;
  marketCapDominance: number;


  currentPrice: number;
  volume24h: number;
  volumeChange24h: number;
  percentChange1h: number;
  percentChange24h: number;
  percentChange7d: number;
  marketCap: number;
  percentChange5min: number;
  cmc_rank: number;
  timestamp?: Date;
  version?: number;
}
