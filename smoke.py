from fastapi.testclient import TestClient
from app import app
c=TestClient(app); t=c.post("/api/login",json={"username":"admin","password":"admin"}).json()["token"]; H={"Authorization":t}
print(c.post("/api/dataset/synthetic",headers=H).json()["rows"], c.post("/api/process",headers=H).json())
for m in ["rf","gb","lstm","xgb"]:
    r=c.post(f"/api/train/{m}",headers=H).json(); print(m,r["r2"],r["rmse"])
print(c.post("/api/forecast",headers=H,json={"course":"CS100","horizon":3}).json()["forecast"])
