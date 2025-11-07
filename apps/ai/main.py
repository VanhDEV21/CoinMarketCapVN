# main.py — AI phân tích & dự đoán coin (FastAPI)
# Mongo URI cố định như yêu cầu: mongodb://127.0.0.1:27017/coinmarketappCMC

from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from pymongo import MongoClient, ASCENDING

# ====== Cấu hình MongoDB (cố định) ======
MONGO_URI = "mongodb://127.0.0.1:27017/coinmarketappCMC"
DB_NAME = "coinmarketappCMC"
COINS_COLLECTION = "coins"
PRED_COLLECTION = "coin_predictions"

# Horizon (phút) -> số bước ~ assume 1 bản ghi ~5 phút
HORIZON_MAP = {"5m": 5, "1h": 60, "24h": 1440}

# ====== Kết nối Mongo & index ======
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
coins_col = db[COINS_COLLECTION]
pred_col = db[PRED_COLLECTION]

# upsert 1 bản ghi mới nhất cho mỗi (symbol,horizon)
pred_col.create_index([("symbol", ASCENDING), ("horizon", ASCENDING)], unique=True)
pred_col.create_index([("createdAt", ASCENDING)])  # có thể set TTL sau nếu thích

app = FastAPI(title="Coin AI (analysis+forecast)", version="1.0.0")


# ====== Chỉ báo kỹ thuật (nhẹ, không lib nặng) ======
def ema(series: np.ndarray, span: int) -> np.ndarray:
    if len(series) == 0:
        return np.array([])
    alpha = 2 / (span + 1)
    out = np.zeros_like(series, dtype=float)
    out[0] = series[0]
    for i in range(1, len(series)):
        out[i] = alpha * series[i] + (1 - alpha) * out[i - 1]
    return out

def rsi(series: np.ndarray, period: int = 14) -> np.ndarray:
    if len(series) < period + 1:
        return np.full_like(series, np.nan, dtype=float)
    deltas = np.diff(series)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    avg_gain = np.zeros_like(series, dtype=float)
    avg_loss = np.zeros_like(series, dtype=float)
    avg_gain[period] = gains[:period].mean()
    avg_loss[period] = losses[:period].mean()
    for i in range(period + 1, len(series)):
        avg_gain[i] = (avg_gain[i - 1] * (period - 1) + gains[i - 1]) / period
        avg_loss[i] = (avg_loss[i - 1] * (period - 1) + losses[i - 1]) / period
    rs = np.divide(avg_gain, avg_loss, out=np.zeros_like(avg_gain), where=avg_loss != 0)
    vals = 100 - (100 / (1 + rs))
    vals[:period] = np.nan
    return vals

def macd_line(series: np.ndarray, fast: int = 12, slow: int = 26) -> np.ndarray:
    if len(series) == 0:
        return np.array([])
    e_fast = ema(series, fast)
    e_slow = ema(series, slow)
    return e_fast - e_slow

def bollinger_position(series: np.ndarray, window: int = 20, n_std: float = 2.0) -> np.ndarray:
    if len(series) < window:
        return np.full_like(series, np.nan, dtype=float)
    s = pd.Series(series)
    ma = s.rolling(window).mean()
    sd = s.rolling(window).std(ddof=0)
    upper = ma + n_std * sd
    lower = ma - n_std * sd
    pos = (s - lower) / (upper - lower + 1e-9)
    return pos.to_numpy()


# ====== Load dữ liệu coin từ Mongo (30 ngày gần nhất) ======
def load_series(symbol: str, days: int = 30) -> pd.DataFrame:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    cur = coins_col.find(
        {"symbol": symbol, "timestamp": {"$gte": since}},
        {
            "_id": 0,
            "timestamp": 1,
            "currentPrice": 1,
            "volume24h": 1,
            "percentChange1h": 1,
            "percentChange24h": 1,
            "percentChange7d": 1,
            "marketCap": 1,
            "cmc_rank": 1,
        },
    ).sort("timestamp", 1)
    rows = list(cur)
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df.rename(columns={"timestamp": "ds", "currentPrice": "y"}, inplace=True)
    df["ds"] = pd.to_datetime(df["ds"], utc=True)

    # tính chỉ báo
    y = df["y"].to_numpy(dtype=float)
    df["rsi"] = rsi(y, 14)
    df["macd"] = macd_line(y, 12, 26)
    df["bb_pos"] = bollinger_position(y, 20, 2.0)
    return df


# ====== Forecast nhẹ: drift trên log-return + khoảng tin cậy theo volatility ======
def ewma_forecast(last_price: float, returns: np.ndarray, steps: int) -> float:
    if returns.size == 0:
        return last_price
    # drift ~ trung bình returns 12h gần nhất (nếu mỗi điểm ~5 phút -> 144 điểm)
    mu = np.nanmean(returns[-144:]) if returns.size >= 144 else np.nanmean(returns)
    return float(last_price * np.exp(mu * steps))

def forecast_symbol(df: pd.DataFrame, horizon_minutes: int) -> Optional[Dict[str, float]]:
    if df.empty:
        return None
    steps = max(1, round(horizon_minutes / 5))  # ~5 phút/điểm (xấp xỉ)

    y = df["y"].to_numpy(dtype=float)
    if len(y) < 30:  # tối thiểu vài chục điểm để có ý nghĩa
        return None

    # log-returns ổn định hơn
    ret = np.diff(np.log(y + 1e-9))
    yhat = ewma_forecast(y[-1], ret, steps)

    # volatility ~ độ lệch chuẩn returns 1 ngày (~288 điểm)
    vol = float(np.nanstd(ret[-288:])) if ret.size >= 10 else float(np.nanstd(ret))
    ci = 1.96 * vol * np.sqrt(steps)
    yhat_lower = float(y[-1] * np.exp(-ci))
    yhat_upper = float(y[-1] * np.exp(ci))

    # clamp cho dễ nhìn
    yhat_lower = min(yhat, yhat_lower)
    yhat_upper = max(yhat, yhat_upper)

    return {"yhat": yhat, "yhat_lower": yhat_lower, "yhat_upper": yhat_upper}

def confidence_from_interval(yhat: float, lo: float, hi: float) -> float:
    if yhat <= 0:
        return 0.5
    width = hi - lo
    return float(max(0.0, min(1.0, 1.0 - width / (yhat + 1e-9))))


# ====== Lưu kết quả dự báo (upsert theo (symbol,horizon)) ======
def upsert_prediction(symbol: str, horizon: str, base_ts: datetime, fc: Dict[str, float], features: Dict[str, float]):
    pred_col.replace_one(
        {"symbol": symbol, "horizon": horizon},
        {
            "symbol": symbol,
            "horizon": horizon,
            "t0": base_ts,
            "yhat": fc["yhat"],
            "yhat_lower": fc["yhat_lower"],
            "yhat_upper": fc["yhat_upper"],
            "features": features,
            "confidence": confidence_from_interval(fc["yhat"], fc["yhat_lower"], fc["yhat_upper"]),
            "model": "light-ewma:v1",
            "createdAt": datetime.now(timezone.utc),
        },
        upsert=True,
    )


# ====== API ======
@app.get("/health")
def health():
    return {"ok": True, "service": "coin_ai", "time": datetime.now(timezone.utc).isoformat()}

@app.get("/predict/{symbol}")
def predict(symbol: str, h: str = "1h"):
    horizon_minutes = HORIZON_MAP.get(h, 60)

    # 1) load dữ liệu
    df = load_series(symbol, days=30)
    if df.empty:
        return JSONResponse(
            {"ok": False, "symbol": symbol, "horizon": h, "yhat": 0.0, "yhat_lower": 0.0, "yhat_upper": 0.0, "features": {}},
            status_code=200,
        )

    # 2) forecast
    fc = forecast_symbol(df, horizon_minutes)
    if not fc:
        return JSONResponse(
            {"ok": False, "symbol": symbol, "horizon": h, "yhat": 0.0, "yhat_lower": 0.0, "yhat_upper": 0.0, "features": {}},
            status_code=200,
        )

    # 3) lấy features cuối kỳ để trả về
    features: Dict[str, float] = {}
    for k in ["rsi", "macd", "bb_pos"]:
        v = df[k].iloc[-1] if k in df.columns else np.nan
        if not np.isnan(v):
            features[k] = float(v)

    # 4) upsert kết quả cho (symbol,horizon)
    base_ts = df["ds"].iloc[-1].to_pydatetime()
    upsert_prediction(symbol, h, base_ts, fc, features)

    # 5) trả JSON
    payload = {"ok": True, "symbol": symbol, "horizon": h, **fc, "features": features}
    return JSONResponse(payload, status_code=200)

@app.get("/batch")
def batch(symbols: str = Query(..., description="CSV, e.g. BTC,ETH"), h: str = "1h"):
    syms = [s.strip() for s in symbols.split(",") if s.strip()]
    items = []
    for s in syms[:50]:
        # tái sử dụng logic predict
        resp = predict(s, h)
        # JSONResponse => lấy body
        if hasattr(resp, "body"):
            import json as _json
            items.append(_json.loads(resp.body))
        else:
            items.append(resp)
    return {"ok": True, "count": len(items), "items": items}
