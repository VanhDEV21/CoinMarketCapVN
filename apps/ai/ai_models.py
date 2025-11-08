# apps/ai/ai_models.py
import numpy as np
import pandas as pd
from typing import Optional, Dict
from sklearn.ensemble import GradientBoostingRegressor

def _make_time_feats(ds: pd.Series) -> pd.DataFrame:
    # time features (chu kỳ ngày/tuần) giúp mô hình đỡ "mù" thời điểm
    ds = pd.to_datetime(ds, utc=True)
    h = ds.dt.hour + ds.dt.minute/60.0
    hour_sin = np.sin(2*np.pi*h/24)
    hour_cos = np.cos(2*np.pi*h/24)
    dow = ds.dt.weekday  # 0..6
    dow_sin = np.sin(2*np.pi*dow/7)
    dow_cos = np.cos(2*np.pi*dow/7)
    return pd.DataFrame({
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "dow_sin": dow_sin,
        "dow_cos": dow_cos
    }, index=ds.index)

def make_features(df: pd.DataFrame) -> pd.DataFrame:
    """df: đã có cột ds (datetime), y (price), rsi, macd, bb_pos"""
    X = _make_time_feats(df["ds"])
    y = df["y"].astype(float)

    # log-returns & độ biến động ngắn hạn
    ret1 = np.log(y / y.shift(1))
    X["ret1"]  = ret1
    X["ret3"]  = np.log(y / y.shift(3))
    X["ret6"]  = np.log(y / y.shift(6))
    X["ret12"] = np.log(y / y.shift(12))
    X["vol6"]  = ret1.rolling(6).std()
    X["vol12"] = ret1.rolling(12).std()
    X["vol24"] = ret1.rolling(24).std()

    # các chỉ báo kỹ thuật đã tính sẵn ở main.py
    for k in ["rsi", "macd", "bb_pos"]:
        if k in df.columns:
            X[k] = df[k].astype(float)

    # làm sạch
    X = X.replace([np.inf, -np.inf], np.nan).ffill().bfill().fillna(0.0)
    return X

def train_and_predict_kstep(df: pd.DataFrame, steps: int) -> Optional[Dict[str, float]]:
    """
    Dự báo trực tiếp k-step return:
      target = log(y(t+steps)/y(t))
    => yhat = y_now * exp(pred)
    CI ~ dựa trên std residual của tập validate (gọn & nhanh).
    """
    if df.empty or len(df) < max(120, steps + 60):
        return None

    X = make_features(df)
    y_price = df["y"].astype(float)
    # mục tiêu k-step:
    target = np.log(y_price.shift(-steps) / y_price)
    # bỏ phần đuôi không có label
    X = X.iloc[:-steps, :]
    target = target.iloc[:-steps]

    n = len(X)
    if n < 100:
        return None

    # split theo thời gian: 80% train / 20% val
    split = int(n * 0.8)
    X_train, y_train = X.iloc[:split], target.iloc[:split]
    X_val, y_val     = X.iloc[split:], target.iloc[split:]

    # mô hình nhẹ, nhanh
    model = GradientBoostingRegressor(
        n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.9, random_state=42
    )
    model.fit(X_train, y_train)

    # ước lượng noise từ residual validate để làm khoảng tin cậy
    if len(X_val) >= 10:
        val_pred = model.predict(X_val)
        resid = (y_val - val_pred)
        resid_std = float(np.nanstd(resid))
        resid_std = resid_std if np.isfinite(resid_std) and resid_std > 1e-6 else 0.01
    else:
        resid_std = 0.01

    # dự báo điểm gần nhất
    X_last = X.iloc[[-1]]
    r_k = float(model.predict(X_last)[0])  # dự báo log-return trong k step
    y_now = float(y_price.iloc[-1])

    yhat = y_now * np.exp(r_k)

    # khoảng tin cậy 95% ~ ±1.96*std (log-space)
    ci = 1.96 * resid_std
    yhat_lower = y_now * np.exp(r_k - ci)
    yhat_upper = y_now * np.exp(r_k + ci)

    # đảm bảo lower <= yhat <= upper
    lo = min(yhat, yhat_lower)
    hi = max(yhat, yhat_upper)
    return {"yhat": float(yhat), "yhat_lower": float(lo), "yhat_upper": float(hi)}
