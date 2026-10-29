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
    # 추가 기능: 복용 알림, 중간 검사 (마이데이터는 검진 id가 바뀌지 않도록 맨 뒤에)
    put("GET /api/reminders/settings", c.get("/api/reminders/settings"))
    put("GET /api/reminders/due?at=2026-10-28T08:30", c.get("/api/reminders/due", params={"at": "2026-10-28T08:30"}))
    put("POST /api/reminders/snooze", c.post("/api/reminders/snooze", json={"timeSlot": "morning", "minutes": 30, "at": "2026-10-28T08:30"}))
    put("GET /api/measurements/types", c.get("/api/measurements/types"))
    put("GET /api/measurements?from=2026-10-01", c.get("/api/measurements", params={"from": "2026-10-01"}))
    put("POST /api/measurements (혈압)", c.post("/api/measurements", json={"type": "bp", "values": {"sbp": 124, "dbp": 80}, "measuredAt": "2026-10-28T07:30"}))
    put("GET /api/reports/interim", c.get("/api/reports/interim"))
    r = c.post("/api/checkups/upload", files={"file": ("2026_건강검진결과.jpg", b"x", "image/jpeg")})
    put("POST /api/checkups/upload (사진)", r)
    cid = r.json()["id"]
    put(f"PATCH /api/checkups/{cid} {{confirm:true}}", c.patch(f"/api/checkups/{cid}", json={"confirm": True}))
    put("GET /api/checkups", c.get("/api/checkups"))
    put("GET /api/recommendations (2026 검진)", c.get("/api/recommendations"))
    put("GET /api/reports/compare", c.get("/api/reports/compare"))
    put("GET /api/mydata", c.get("/api/mydata"))
    put("POST /api/mydata/connect", c.post("/api/mydata/connect", json={"agree": True}))
    put("POST /api/mydata/sync", c.post("/api/mydata/sync", json={}))
    c.post("/api/demo/reset")
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
