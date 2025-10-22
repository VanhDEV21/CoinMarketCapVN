import mongoose, { Schema } from 'mongoose';
import { ICoin } from '../interfaces/ICoin';
const coinSchema = new Schema<ICoin>({
  cmc_Id: { type: Number, required: true },
  name: { type: String, required: true },
  symbol: { type: String, required: true },
  slug: { type: String, required: true },
  circulating_supply: { type: Number, required: false, default: null },
  total_supply: { type: Number, required: false, default: null },
  max_supply: { type: Number, required: false, default: null },
  fullyDilutedMarketCap: { type: Number, default: null },
  marketCapDominance: { type: Number, default: null },
  currentPrice: { type: Number, required: true },
  volume24h: { type: Number, required: true },
  volumeChange24h: { type: Number, required: true },
  percentChange1h: { type: Number, required: true },
  percentChange24h: { type: Number, required: true },
  percentChange7d: { type: Number, required: true },
  marketCap: { type: Number, required: true },
  percentChange5min: { type: Number, required: false, default: 0 },
  cmc_rank: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  version: {type: Number, required: true},
});
const Coin = mongoose.model<ICoin>('Coin', coinSchema);

export default Coin;
