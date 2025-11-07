// apps/be/services/aiClient.ts
import axios from "axios";
import { AIPrediction, Horizon } from "../interfaces/IAIPrediction";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8001";



export async function getPrediction(symbol: string, horizon: Horizon = "1h") {
  const url = `${AI_SERVICE_URL}/predict/${encodeURIComponent(symbol)}?h=${horizon}`;
  const { data } = await axios.get(url, { timeout: 10_000 });
  return data as AIPrediction;
}
