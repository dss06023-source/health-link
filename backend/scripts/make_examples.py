"""docs/api-examples.json 생성: 실제 API 응답을 그대로 저장한다(프론트 모의 데이터용)."""
import json, sys
from fastapi.testclient import TestClient
from app.main import app

out = {}
with TestClient(app) as c:
    c.post("/api/demo/reset")
    def put(key, r):
        out[key] = {"status": r.status_code, "body": r.json()}
    put("GET /api/users/me", c.get("/api/users/me"))
    put("GET /api/checkup-centers", c.get("/api/checkup-centers"))
    put("GET /api/medications", c.get("/api/medications"))
    put("GET /api/recommendations (2024 검진)", c.get("/api/recommendations"))
    put("GET /api/supplements", c.get("/api/supplements"))
    put("GET /api/supplements/check", c.get("/api/supplements/check"))
    put("GET /api/intake-logs/today", c.get("/api/intake-logs/today"))
    put("GET /api/intake-logs?from=2026-10-22&to=2026-10-28", c.get("/api/intake-logs", params={"from": "2026-10-22", "to": "2026-10-28"}))
    r = c.post("/api/checkups/upload", files={"file": ("2026_건강검진결과.jpg", b"x", "image/jpeg")})
    put("POST /api/checkups/upload (사진)", r)
    cid = r.json()["id"]
    put(f"PATCH /api/checkups/{cid} {{confirm:true}}", c.patch(f"/api/checkups/{cid}", json={"confirm": True}))
    put("GET /api/checkups", c.get("/api/checkups"))
    put("GET /api/recommendations (2026 검진)", c.get("/api/recommendations"))
    put("GET /api/reports/compare", c.get("/api/reports/compare"))
    c.post("/api/demo/reset")
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
