import { Request, Response } from "express";
import { fetchCexFromGecko } from "../services/CEXService";

export async function getCexList(req: Request, res: Response) {
  try {
    const minTrust = Number(req.query.minTrust ?? 8);
    const rows = await fetchCexFromGecko(minTrust);
    res.json({ minTrust, count: rows.length, rows });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch exchanges" });
  }
}
