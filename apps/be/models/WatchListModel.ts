import { model, Schema } from "mongoose";
import { IWatchItem } from "../interfaces/IwatchItem";
import { IWatchlist } from "../interfaces/IWatchList";

const WatchItemSchema = new Schema<IWatchItem>({
  symbol: { type: String, required: true, uppercase: true, trim: true },
  addedAt: { type: Date, default: Date.now },
});

const WatchlistSchema = new Schema<IWatchlist>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true, unique: true },
  items: { type: [WatchItemSchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

WatchlistSchema.index({ userId: 1 }); // tối ưu query theo user

export default model<IWatchlist>('Watchlist', WatchlistSchema, 'user_watchlists');