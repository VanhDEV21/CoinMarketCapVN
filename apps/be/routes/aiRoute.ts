// apps/be/routes/aiRoutes.ts
import { Router } from "express";
import { getPrediction } from "../services/aiClient";

const router = Router();

router.get("/predict/:symbol", async (req, res) => {
  try {
    const symbol = String(req.params.symbol || "");
    const h = (String(req.query.h || "1h") as "5m" | "1h" | "24h");
    if (!symbol) return res.status(400).json({ ok: false, error: "Missing symbol" });

    const data = await getPrediction(symbol, h);
    return res.json(data);
  } catch (err: any) {
    const status = err?.response?.status || 500;
    const msg = err?.response?.data || err?.message || "AI request failed";
    return res.status(status).json({ ok: false, error: msg });
  }
});

export default router;
