import { Request, Response } from 'express';
import { listNetworks, listDexesByNetwork } from '../services/DEXService';
import { getDexPools } from '../services/DexPoolsService';

export default class DEXController {
  static async getNetworks(_req: Request, res: Response) {
    try {
      const data = await listNetworks();
      res.json({ ok: true, data });
    } catch (e:any) {
      res.status(500).json({ ok:false, error: e?.message || 'INTERNAL_ERROR' });
    }
  }

  static async getDexes(req: Request, res: Response) {
    try {
      const network = String(req.query.network || 'bitcoin');
      const limit = Math.min(Number(req.query.limit || 20), 50);
      const rows = await listDexesByNetwork(network);
      res.json({ ok: true, data: rows.slice(0, limit) });
    } catch (e:any) {
      res.status(500).json({ ok:false, error: e?.message || 'INTERNAL_ERROR' });
    }
  }

  static async getPools(req: Request, res: Response) {
    try {
      const network = String(req.query.network || 'eth');
      const dex = String(req.query.dex || '');
      const limit = Math.min(Number(req.query.limit || 20), 50);
      if (!dex) return res.status(400).json({ ok:false, error:'dex is required' });

      const pools = await getDexPools(network, dex);
      res.json({ ok: true, data: pools.data.slice(0, limit) });
    } catch (e:any) {
      res.status(500).json({ ok:false, error: e?.message || 'INTERNAL_ERROR' });
    }
  }
}
