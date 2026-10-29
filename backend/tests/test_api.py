import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DEMO_TODAY", "2026-10-28")
    from app import db
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    from app.main import app
    with TestClient(app) as c:
        yield c


def upload_and_confirm(client, **changes):
    checkup = client.post("/api/checkups/upload", files={"file": ("결과.pdf", b"%PDF", "application/pdf")}).json()
    assert checkup["status"] == "pending_review"
    return client.patch(f"/api/checkups/{checkup['id']}", json={"confirm": True, **changes}).json()


def test_checkup_notice_switches_off_after_upload(client):
    me = client.get("/api/users/me").json()
    assert me["checkupDue"] is True and me["nextCheckupYear"] == 2026
    upload_and_confirm(client)
    me = client.get("/api/users/me").json()
    assert me["checkupDue"] is False and me["nextCheckupYear"] == 2028


def test_odd_birth_year_is_not_target_in_even_year(client):
    me = client.put("/api/users/me", json={"birthYear": 1985}).json()
    assert me["isTargetThisYear"] is False and me["nextCheckupYear"] == 2027


def test_upload_rejects_other_files(client):
    r = client.post("/api/checkups/upload", files={"file": ("a.txt", b"x", "text/plain")})
    assert r.status_code == 415


def test_photo_upload_flags_low_confidence_fields(client):
    checkup = client.post("/api/checkups/upload", files={"file": ("a.jpg", b"x", "image/jpeg")}).json()
    flagged = {f["code"] for f in checkup["ocr"]["fields"] if f["needsReview"]}
    assert flagged == {"ggt", "hdl"}


def test_user_edit_changes_interpretation(client):
    detail = upload_and_confirm(client, values={"fbs": 130})
    fbs = next(i for i in detail["items"] if i["code"] == "fbs")
    assert fbs["status"] == "danger" and fbs["consultDoctor"] is True
    assert "의사 상담" in fbs["explanation"]
    assert [h["value"] for h in fbs["history"]] == [108, 130]


def test_interpretation_has_no_disease_words(client):
    detail = client.get("/api/checkups/latest").json()
    text = " ".join(i["explanation"] for i in detail["items"]) + detail["summary"]["headline"]
    for word in ("당뇨", "고혈압", "간질환", "위험군"):
        assert word not in text


def test_recommendation_excludes_statin_conflict_and_liver_caution(client):
    r = client.get("/api/recommendations").json()
    excluded = {e["supplementId"] for e in r["excluded"]}
    # 홍국: 스타틴 복용, 가르시니아·녹차추출물: ALT가 기준치 밖
    assert excluded == {"red_yeast_rice", "garcinia", "green_tea"}
    ids = [x["supplementId"] for x in r["recommendations"]]
    assert "banaba" in ids and "omega3" in ids
    vit_d = next(x for x in r["recommendations"] if x["supplementId"] == "vitamin_d")
    assert vit_d["alreadyTaking"] and "duplicate" in {w["type"] for w in vit_d["warnings"]}


def test_recommendation_is_deterministic(client):
    assert client.get("/api/recommendations").json() == client.get("/api/recommendations").json()


def test_interaction_warning_when_medication_added(client):
    client.put("/api/users/me", json={"medications": ["아토르바스타틴", "와파린"]})
    r = client.get("/api/recommendations").json()
    omega = next(x for x in r["recommendations"] if x["supplementId"] == "omega3")
    assert omega["warnings"][0]["drugs"] == ["와파린"]
    check = client.get("/api/supplements/check").json()
    assert check["interactions"][0]["supplementId"] == "omega3"


def test_supplement_add_pause_and_intake(client):
    s = client.post("/api/supplements", json={"supplementId": "banaba"}).json()
    assert client.post("/api/supplements", json={"supplementId": "banaba"}).status_code == 409
    today = client.get("/api/intake-logs/today").json()
    assert today["scheduledCount"] == 5 and today["rate"] == 0
    today = client.post("/api/intake-logs", json={"supplementId": s["id"], "timeSlot": "morning"}).json()
    assert today["takenCount"] == 1
    client.patch(f"/api/supplements/{s['id']}", json={"paused": True})
    assert client.get("/api/intake-logs/today").json()["scheduledCount"] == 4
    client.delete(f"/api/supplements/{s['id']}")
    assert all(x["id"] != s["id"] for x in client.get("/api/supplements").json())


def test_duplicate_over_upper_limit(client):
    client.post("/api/supplements", json={"supplementId": "iron"})
    check = client.get("/api/supplements/check").json()
    iron = next(d for d in check["duplicates"] if d["ingredient"] == "철")
    assert iron["total"] == "20mg" and iron["level"] == "info"


def test_intake_history_rate(client):
    h = client.get("/api/intake-logs").json()
    assert len(h["daily"]) == 30 and 0.7 < h["rate"] < 0.95


def test_compare_report(client):
    assert client.get("/api/reports/compare").status_code == 404
    upload_and_confirm(client)
    r = client.get("/api/reports/compare").json()
    ldl = next(i for i in r["items"] if i["code"] == "ldl")
    assert (ldl["beforeStatus"], ldl["afterStatus"], ldl["trend"]) == ("caution", "normal", "improved")
    # HDL 44→47(정상B 안에서 기준치 쪽으로), BMI 25.6→24.4(정상B→정상A)까지 10개
    assert r["summary"]["improved"] == 10
    assert "효과를 뜻하지 않습니다" in r["note"]
    assert r["adherence"]["rate"] is not None


def test_demo_reset(client):
    upload_and_confirm(client)
    client.post("/api/demo/reset")
    assert len(client.get("/api/checkups").json()) == 1
