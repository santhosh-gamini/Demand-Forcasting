"""DemandForecast AI - Backend API. Run: uvicorn app:app --reload  ->  http://127.0.0.1:8000"""
import io, os, secrets
from pathlib import Path
import numpy as np, pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Header
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_squared_error
from xgboost import XGBRegressor

app = FastAPI(title="DemandForecast AI")
TOKENS, S, HISTORY = set(), {}, []
FEATS = ["course_id", "dept_id", "t", "term_id", "capacity",
         "enr_lag1", "enr_lag2", "sec_lag1", "enr_roll3"]
TERMS = ["Spring", "Summer", "Fall"]

def auth(a):
    if (a or "").replace("Bearer ", "") not in TOKENS:
        raise HTTPException(401, "Login required")

# ---------- Module 1: login (admin / admin) ----------
class Login(BaseModel):
    username: str
    password: str

@app.post("/api/login")
def login(b: Login):
    if (b.username, b.password) != ("admin", "admin"):
        raise HTTPException(401, "Invalid credentials")
    t = secrets.token_hex(16); TOKENS.add(t); return {"token": t}

# ---------- Module 2: load & process dataset ----------
def synthetic(seed=7):
    r = np.random.default_rng(seed); rows = []
    depts = ["CS", "MATH", "PHY", "ENG", "BIO", "ECON"]
    for c in range(24):
        d, base, cap = depts[c % 6], r.integers(60, 400), int(r.choice([30, 35, 40]))
        growth = r.normal(0.012, 0.01)
        for t in range(30):                      # 2016-2025, 3 terms/yr
            term = TERMS[t % 3]
            season = {"Spring": 1.0, "Summer": 0.45, "Fall": 1.15}[term]
            enr = max(10, base * (1 + growth) ** t * season * r.normal(1, 0.05))
            rows.append(dict(course=f"{d}{100 + c * 7}", dept=d, year=2016 + t // 3,
                             term=term, t=t, capacity=cap, enrollment=round(enr),
                             sections=int(np.ceil(enr / cap))))
    return pd.DataFrame(rows)

def features(df):
    df = df.sort_values(["course", "t"]).copy()
    df["course_id"] = df["course"].astype("category").cat.codes
    df["dept_id"] = df["dept"].astype("category").cat.codes
    df["term_id"] = df["term"].map({k: i for i, k in enumerate(TERMS)})
    g = df.groupby("course")
    df["enr_lag1"], df["enr_lag2"] = g.enrollment.shift(1), g.enrollment.shift(2)
    df["sec_lag1"] = g.sections.shift(1)
    df["enr_roll3"] = g.enrollment.transform(lambda s: s.shift(1).rolling(3).mean())
    return df.dropna()

@app.post("/api/dataset/synthetic")
def gen(authorization: str = Header(None)):
    auth(authorization); S.clear(); S["raw"] = synthetic(); return info()

@app.post("/api/dataset/upload")
async def upload(file: UploadFile = File(...), authorization: str = Header(None)):
    auth(authorization)
    df = pd.read_csv(io.BytesIO(await file.read()))
    need = {"course", "dept", "year", "term", "t", "capacity", "enrollment", "sections"}
    if need - set(df.columns): raise HTTPException(400, f"Missing columns: {sorted(need - set(df.columns))}")
    S.clear(); S["raw"] = df; return info()

def info():
    df = S["raw"]
    return {
        "rows": int(len(df)),
        "courses": int(df.course.nunique()),
        "preview": df.head(8).to_dict("records"),
        "by_dept": df.groupby("dept").sections.mean().round(2).to_dict(),
        "by_term": df.groupby("term").sections.mean().round(2).to_dict(),
        "depts": sorted(df.dept.unique().tolist()),
        "years": [int(df.year.min()), int(df.year.max())]
    }

@app.post("/api/process")
def process(authorization: str = Header(None)):
    auth(authorization)
    if "raw" not in S: raise HTTPException(400, "Load a dataset first")
    f = features(S["raw"]); S["feat"] = f
    sc = MinMaxScaler().fit(f[FEATS]); S["scaler"] = sc
    X, y = sc.transform(f[FEATS]), f["sections"].values
    S["split"] = train_test_split(X, y, test_size=0.2, shuffle=True, random_state=42)  # shuffle + 80/20
    S["models"], S["metrics"] = {}, {}
    return {"train": len(S["split"][0]), "test": len(S["split"][1])}

# ---------- Modules 3-6: models ----------
def build(name):
    if name == "rf": return RandomForestRegressor(300, random_state=42, n_jobs=-1)
    if name == "gb": return GradientBoostingRegressor(n_estimators=300, learning_rate=0.05, random_state=42)
    if name == "xgb": return XGBRegressor(n_estimators=500, learning_rate=0.05, max_depth=5, subsample=0.9)
    if name == "lstm":
        try:
            from tensorflow import keras
            m = keras.Sequential([keras.layers.Input((1, len(FEATS))), keras.layers.LSTM(48),
                                  keras.layers.Dense(1)])
            m.compile("adam", "mse"); return m
        except ImportError:
            return MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=800, random_state=42)  # fallback
    raise HTTPException(404, "Unknown model")

def fit_predict(name, m, Xtr, ytr, Xte):
    if name == "lstm" and hasattr(m, "predict") and m.__class__.__module__.startswith("keras"):
        m.fit(Xtr[:, None, :], ytr, epochs=60, batch_size=16, verbose=0)
        return m.predict(Xte[:, None, :], verbose=0).ravel()
    m.fit(Xtr, ytr); return m.predict(Xte)

@app.post("/api/train/{name}")
def train(name: str, authorization: str = Header(None)):
    auth(authorization)
    if "split" not in S: raise HTTPException(400, "Process the dataset first")
    Xtr, Xte, ytr, yte = S["split"]; m = build(name)
    p = np.round(fit_predict(name, m, Xtr, ytr, Xte)).clip(1)
    
    is_fallback = False
    engine_name = name.upper()
    if name == "lstm":
        if not (hasattr(m, "__class__") and m.__class__.__module__.startswith("keras")):
            is_fallback = True
            engine_name = "MLPRegressor (Scikit-Learn Neural Network Fallback)"
        else:
            engine_name = "TensorFlow Keras LSTM"
    elif name == "rf":
        engine_name = "Random Forest Regressor (300 Trees)"
    elif name == "gb":
        engine_name = "Gradient Boosting Regressor (300 Trees, LR=0.05)"
    elif name == "xgb":
        engine_name = "XGBoost Regressor (500 Trees, Depth=5)"

    res = {
        "model": name,
        "r2": round(float(r2_score(yte, p)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(yte, p))), 4),
        "true": yte[:80].tolist(),
        "pred": p[:80].tolist(),
        "is_fallback": is_fallback,
        "engine_name": engine_name
    }
    S["models"][name] = m
    S["metrics"][name] = {
        "r2": res["r2"],
        "rmse": res["rmse"],
        "is_fallback": is_fallback,
        "engine_name": engine_name
    }
    return res

@app.get("/api/compare")
def compare(authorization: str = Header(None)):
    auth(authorization); return S.get("metrics", {})

# ---------- Module 7: forecast with XGBoost ----------
@app.get("/api/courses")
def courses(authorization: str = Header(None)):
    auth(authorization); return sorted(S["raw"].course.unique().tolist()) if "raw" in S else []

class Fc(BaseModel):
    course: str
    horizon: int = 3

@app.post("/api/forecast")
def forecast(b: Fc, authorization: str = Header(None)):
    auth(authorization)
    if "xgb" not in S.get("models", {}): raise HTTPException(400, "Run XGBoost first")
    f = S["feat"]; h = S["raw"][S["raw"].course == b.course].sort_values("t")
    if h.empty: raise HTTPException(404, "Unknown course")
    ids = f[f.course == b.course].iloc[-1]; enr, sec = list(h.enrollment), list(h.sections)
    slope = np.polyfit(range(min(9, len(enr))), enr[-9:], 1)[0]   # recent enrollment trend
    t, out = int(h.t.max()), []
    for _ in range(max(1, min(b.horizon, 12))):
        t += 1
        row = [ids.course_id, ids.dept_id, t, t % 3, h.capacity.iloc[-1], enr[-1], enr[-2], sec[-1],
               np.mean(enr[-3:])]
        yhat = float(S["models"]["xgb"].predict(S["scaler"].transform(pd.DataFrame([row], columns=FEATS)))[0])
        s = max(1, int(round(yhat)))
        enr.append(enr[-1] + slope); sec.append(s)
        out.append({"semester": f"{2016 + t // 3} {TERMS[t % 3]}", "sections": s})
    HISTORY.append({"course": b.course, "forecast": out})
    return {"course": b.course, "forecast": out,
            "history": [{"t": int(a), "sections": int(c)} for a, c in zip(h.t[-12:], h.sections[-12:])]}

@app.get("/api/history")
def history(authorization: str = Header(None)):
    auth(authorization); return HISTORY[::-1]

@app.get("/api/status")
def status(authorization: str = Header(None)):
    auth(authorization)
    has_raw = "raw" in S
    has_split = "split" in S
    trained = list(S.get("models", {}).keys())
    return {
        "dataset_loaded": has_raw,
        "rows": int(len(S["raw"])) if has_raw else 0,
        "courses": int(S["raw"].course.nunique()) if has_raw else 0,
        "split_ready": has_split,
        "train_rows": int(len(S["split"][0])) if has_split else 0,
        "test_rows": int(len(S["split"][1])) if has_split else 0,
        "trained_models": trained,
        "metrics": S.get("metrics", {}),
        "history_count": len(HISTORY)
    }

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

@app.get("/")
def home():
    return FileResponse(STATIC_DIR / "index.html")

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
