import { Request, Response } from 'express';
import {
  listNetworks,
  listDexesByNetwork,
  getDefaultBitcoinNetworkId,
  listDexesByNetworkWithStats,
} from '../services/DEXService';

export default class DEXController {
  static async getNetworks(_req: Request, res: Response) {
    try {
      const data = await listNetworks();
      return res.json({ ok: true, data });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || 'INTERNAL_ERROR' });
    }
  }

  // GET /api/dex/list?network=xxx
static async getDexes(req: Request, res: Response) {
  try {
    const network = (req.query.network as string) || "arbitrum";
    const data = await listDexesByNetworkWithStats(network);
    return res.json({ ok: true, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

}
