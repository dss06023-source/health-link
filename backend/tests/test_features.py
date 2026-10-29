import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DEMO_TODAY", "2026-10-28")
    from app import db
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    from app.main import app
    with TestClient(app) as c:
        c.post("/api/auth/guest")  # 가상 인물 기록이 든 체험 계정으로 시작
        yield c


# ---------- 마이데이터 ----------

def test_mydata_requires_consent(client):
    assert client.get("/api/mydata").json()["connected"] is False
    assert client.post("/api/mydata/sync").status_code == 409
    assert client.post("/api/mydata/connect", json={"agree": False}).status_code == 422


def test_mydata_sync_imports_once_and_skips_existing(client):
    client.post("/api/mydata/connect", json={"agree": True})
    r = client.post("/api/mydata/sync").json()
    assert [c["date"] for c in r["importedCheckups"]] == ["2022-10-18"]
    assert [c["date"] for c in r["skippedCheckups"]] == ["2024-10-15"]
    assert r["medications"] == ["아토르바스타틴"]
    amlodipine = next(p for p in r["prescriptions"] if p["name"] == "암로디핀")
    assert amlodipine["alreadyRegistered"] is False
    again = client.post("/api/mydata/sync").json()
    assert again["importedCheckups"] == []
    sources = [c["source"] for c in client.get("/api/checkups").json()]
    assert sources.count("mydata") == 1


def test_mydata_history_feeds_trend(client):
    client.post("/api/mydata/connect", json={"agree": True})
    client.post("/api/mydata/sync")
    sbp = next(i for i in client.get("/api/checkups/latest").json()["items"] if i["code"] == "sbp")
    assert [h["date"] for h in sbp["history"]] == ["2022-10-18", "2024-10-15"]


def test_mydata_apply_medications_and_scope(client):
    client.post("/api/mydata/connect", json={"agree": True, "scopes": ["prescriptions"]})
    r = client.post("/api/mydata/sync", json={"applyMedications": True}).json()
    assert r["importedCheckups"] == [] and "암로디핀" in r["medications"]
    assert "암로디핀" in client.get("/api/users/me").json()["medications"]
    client.delete("/api/mydata/connect")
    assert client.get("/api/mydata").json()["connected"] is False


# ---------- 복용 알림 ----------

def test_due_reminder_after_slot_time(client):
    assert client.get("/api/reminders/due", params={"at": "2026-10-28T07:59"}).json()["due"] == []
    r = client.get("/api/reminders/due", params={"at": "2026-10-28T08:30"}).json()
    assert r["due"][0]["timeSlot"] == "morning" and r["due"][0]["overdueMinutes"] == 30
    # 시연 인물의 비타민D는 아침이 붐벼 점심으로 나눠 두었다.
    assert len(r["due"][0]["items"]) == 3


def test_taken_items_leave_reminder(client):
    supplements = client.get("/api/supplements").json()
    for s in supplements:
        client.post("/api/intake-logs", json={"supplementId": s["id"], "timeSlot": s["timeSlots"][0]})
    assert client.get("/api/reminders/due", params={"at": "2026-10-28T09:00"}).json()["due"] == []


def test_snooze_and_settings(client):
    client.post("/api/reminders/snooze", json={"timeSlot": "morning", "minutes": 30, "at": "2026-10-28T08:10"})
    assert client.get("/api/reminders/due", params={"at": "2026-10-28T08:30"}).json()["due"] == []
    assert client.get("/api/reminders/due", params={"at": "2026-10-28T08:41"}).json()["due"]
    client.put("/api/reminders/settings", json={"times": {"morning": "10:00"}})
    r = client.get("/api/reminders/due", params={"at": "2026-10-28T09:00"}).json()
    assert r["due"] == [] and r["next"]["time"] == "10:00"
    client.put("/api/reminders/settings", json={"enabled": False})
    assert client.get("/api/reminders/due", params={"at": "2026-10-28T11:00"}).json()["due"] == []


def test_reminder_settings_validation(client):
    assert client.put("/api/reminders/settings", json={"times": {"morning": "25:00"}}).status_code == 422
    assert client.put("/api/reminders/settings", json={"times": {"noon": "12:00"}}).status_code == 422


# ---------- 중간 검사 ----------

def test_measurement_validation(client):
    assert client.post("/api/measurements", json={"type": "bp", "values": {"sbp": 120}}).status_code == 422
    assert client.post("/api/measurements", json={"type": "bp", "values": {"sbp": 400, "dbp": 80}}).status_code == 422
    assert client.post("/api/measurements", json={"type": "glucose", "values": {"fbs": 100}}).status_code == 422
    assert client.post("/api/measurements", json={"type": "temp", "values": {"t": 36}}).status_code == 422


def test_weight_becomes_bmi_and_postprandial_glucose_is_not_judged(client):
    w = client.post("/api/measurements", json={"type": "weight", "values": {"weightKg": 75.7}, "measuredAt": "2026-10-28T07:00"}).json()
    assert w["codes"] == {"bmi": 25.0}
    g = client.post("/api/measurements", json={"type": "glucose", "values": {"fbs": 150}, "fasting": False}).json()
    assert g["codes"] == {} and g["judged"] == []


def test_interim_report_against_latest_checkup(client):
    r = client.get("/api/reports/interim").json()
    assert r["baseline"]["date"] == "2024-10-15"
    sbp = next(i for i in r["items"] if i["code"] == "sbp")
    assert sbp["checkupValue"] == 134 and sbp["recentAverage"] < 134 and sbp["trend"] == "improved"
    assert "참고용" in r["note"] and "효과를 뜻하지 않습니다" in r["note"]


def test_interim_report_without_measurements(client):
    checkup = client.post("/api/checkups/upload", files={"file": ("a.pdf", b"%PDF", "application/pdf")}).json()
    client.patch(f"/api/checkups/{checkup['id']}", json={"confirm": True, "date": "2026-10-28"})
    r = client.get("/api/reports/interim").json()
    assert r["summary"]["measurementCount"] == 0 and "기록이 없습니다" in r["summary"]["headline"]
    client.post("/api/measurements", json={"type": "bp", "values": {"sbp": 118, "dbp": 76}, "measuredAt": "2026-10-28T20:00"})
    r = client.get("/api/reports/interim").json()
    sbp = next(i for i in r["items"] if i["code"] == "sbp")
    assert sbp["recentStatus"] == "normal" and sbp["trend"] == "improved"


def test_compare_report_includes_home_measurements(client):
    checkup = client.post("/api/checkups/upload", files={"file": ("a.pdf", b"%PDF", "application/pdf")}).json()
    client.patch(f"/api/checkups/{checkup['id']}", json={"confirm": True})
    m = client.get("/api/reports/compare").json()["measurements"]
    assert m["count"] > 0 and len(m["series"]["sbp"]) > 10


def test_delete_measurement(client):
    mid = client.get("/api/measurements", params={"type": "bp"}).json()[0]["id"]
    client.delete(f"/api/measurements/{mid}")
    assert client.delete(f"/api/measurements/{mid}").status_code == 404


def test_reset_restores_feature_state(client):
    client.post("/api/mydata/connect", json={"agree": True})
    client.post("/api/measurements", json={"type": "waist", "values": {"waist": 88}})
    client.post("/api/demo/reset")
    assert client.get("/api/mydata").json()["connected"] is False
    assert client.get("/api/measurements", params={"type": "waist"}).json() == []


# ---------- 시간대 나누기 ----------

def test_crowded_morning_moves_flexible_supplement(client):
    # 시연 인물은 아침에 셋(오메가-3·밀크씨슬·종합비타민), 점심에 비타민D가 있다.
    lutein = client.post("/api/supplements", json={"supplementId": "lutein"}).json()
    assert lutein["timeSlots"] == ["evening"] and lutein["recommendedSlots"] == ["morning"]
    assert lutein["slotNote"].startswith("아침에 먹을 것이 많아 저녁으로")
    # 시간을 옮기면 안 되는 철분(공복)은 붐벼도 아침에 둔다.
    iron = client.post("/api/supplements", json={"supplementId": "iron"}).json()
    assert iron["timeSlots"] == ["morning"] and iron["slotNote"] is None


def test_user_chosen_slot_is_kept(client):
    s = client.post("/api/supplements", json={"supplementId": "coq10", "timeSlots": ["morning"]}).json()
    assert s["timeSlots"] == ["morning"] and s["slotNote"] is None


def test_many_supplements_allow_four_per_slot(client):
    # 시연 인물(아침 3·점심 1)에 저녁 고정인 홍국·칼슘을 더해 6개.
    for cid in ("red_yeast_rice", "calcium"):
        client.post("/api/supplements", json={"supplementId": cid})
    # 7개째부터는 한 시간대에 4개까지라 코엔자임Q10은 아침에 남는다.
    assert client.post("/api/supplements", json={"supplementId": "coq10"}).json()["timeSlots"] == ["morning"]
    # 아침이 4개가 되면 다음 것은 덜 붐비는 점심(1개)으로 간다.
    assert client.post("/api/supplements", json={"supplementId": "lutein"}).json()["timeSlots"] == ["lunch"]
