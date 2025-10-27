import { Types } from "mongoose";
import { IWatchItem } from "./IwatchItem";

export interface IWatchlist extends Document {
  userId: Types.ObjectId;
  items: IWatchItem[];
  updatedAt: Date;
}