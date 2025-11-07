// services/pruneByVersion.ts
import Coin from '../models/CoinModel';

const KEEP_VERSIONS = 30 * 24 * 12; 

export async function pruneOldByVersion() {
  // Lấy version mới nhất và cũ nhất để biết biên độ
  const newest = await Coin.findOne().sort({ version: -1 }).select({ version: 1 }).lean();
  const oldest = await Coin.findOne().sort({ version: 1 }).select({ version: 1 }).lean();

  if (!newest?.version || !oldest?.version) {
    return { deleted: 0, reason: 'no-data' };
  }

  const span = newest.version - oldest.version + 1; 


  if (span <= KEEP_VERSIONS) {
    return { deleted: 0, reason: 'below-threshold', span, keep: KEEP_VERSIONS };
  }

  const threshold = newest.version - KEEP_VERSIONS;

  // Xoá toàn bộ bản ghi cũ hơn threshold
  const res = await Coin.deleteMany({ version: { $lt: threshold } });
  return { deleted: res.deletedCount || 0, threshold, newest: newest.version, span, keep: KEEP_VERSIONS };
}
