export interface AIPrediction {
  ok: boolean;
  symbol: string;
  horizon: Horizon;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
  features?: Record<string, number>;
}

export type Horizon = "5m" | "1h" | "24h";