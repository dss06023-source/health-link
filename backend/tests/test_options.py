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


def test_options_list_and_rule_flags(client):
    o = client.get("/api/options").json()
    groups = {g["id"]: g for g in o["medicationGroups"]}
    assert len(groups) == 8
    assert len(o["supplements"]) == 31
    items = {i["name"]: i for g in groups.values() for i in g["items"]}
    assert items["와파린"]["rules"] is True
    assert items["항우울제"]["rules"] is True
    assert items["기타 고지혈증약"]["rules"] is True
    sups = {s["id"]: s["rules"] for s in o["supplements"]}
    assert sups["omega3"] is True and sups["vitamin_k"] is True and sups["vitamin_c"] is True
    conds = {c["value"]: c["rules"] for c in o["conditions"]}
    assert conds == {"hypertension": False, "diabetes": True, "dyslipidemia": True,
                     "liver": True, "kidney": True, "thyroid": False}
    assert {f["key"] for f in o["lifestyle"]} >= {"smoking", "sleepHours", "diet", "pregnant"}


def test_group_items_feed_interaction_rules(client):
    client.put("/api/users/me", json={"medications": ["기타 항응고제"]})
    warnings = client.get("/api/supplements/check").json()["interactions"]
    assert any(w["supplementId"] == "omega3" and "항응고" in w["message"] for w in warnings)


def test_medication_list_is_screen_options_only(client):
    names = [m["name"] for m in client.get("/api/medications").json()]
    assert "스타틴" in names and "클로피도그렐" in names and "아토르바스타틴" not in names


def test_legacy_medication_names_still_have_rules(client):
    me = client.put("/api/users/me", json={"medications": ["아토르바스타틴"]}).json()
    assert "unknownMedications" not in me


def test_profile_saves_new_fields(client):
    r = client.put("/api/users/me", json={
        "medications": ["항우울제", "처음 보는 약"],
        "currentSupplements": ["vitamin_c", "omega3"],
        "conditions": ["kidney"],
        "allergies": ["soy"],
        "customAllergies": ["복숭아"],
        "lifestyle": {"smoking": "past", "sleepHours": 7, "diet": ["salty", "noDairy"]},
    })
    assert r.status_code == 200
    me = r.json()
    assert me["unknownMedications"] == ["처음 보는 약"]
    assert me["conditions"] == ["kidney"] and me["customAllergies"] == ["복숭아"]
    # 바꾸지 않은 생활습관 값은 남는다.
    assert me["lifestyle"]["lowSunlight"] is True and me["lifestyle"]["smoking"] == "past"


def test_profile_rejects_values_outside_options(client):
    for body in ({"conditions": ["cancer"]}, {"allergies": ["peanut"]}, {"currentSupplements": ["unknown"]},
                 {"lifestyle": {"smoking": "sometimes"}}, {"lifestyle": {"sleepHours": 30}},
                 {"lifestyle": {"diet": ["keto"]}}, {"lifestyle": {"pregnant": "yes"}}):
        assert client.put("/api/users/me", json=body).status_code == 422, body


def test_legacy_smoking_boolean_is_converted(client):
    me = client.put("/api/users/me", json={"lifestyle": {"smoking": True}}).json()
    assert me["lifestyle"]["smoking"] == "current"


def test_selected_supplement_counts_as_already_taking(client):
    client.put("/api/users/me", json={"currentSupplements": ["vitamin_d"]})
    recs = client.get("/api/recommendations").json()["recommendations"]
    vd = next(r for r in recs if r["supplementId"] == "vitamin_d")
    assert vd["alreadyTaking"] is True


def test_breastfeeding_excludes_avoided_supplement(client):
    client.put("/api/users/me", json={"gender": "F", "lifestyle": {"breastfeeding": True}})
    body = client.get("/api/recommendations").json()
    assert "coq10" not in [r["supplementId"] for r in body["recommendations"]]
    assert "수유 중" in next(e for e in body["excluded"] if e["supplementId"] == "coq10")["message"]


def _interactions(client, meds):
    client.put("/api/users/me", json={"medications": meds})
    body = client.get("/api/recommendations").json()
    return [w for w in body["warnings"] if w["type"] == "interaction"]


def test_antiplatelet_gets_omega3_but_not_coq10_warning(client):
    found = {w["supplementId"] for w in _interactions(client, ["클로피도그렐"])}
    assert "omega3" in found and "coq10" not in found


def test_anticoagulant_gets_coq10_warning(client):
    found = {w["supplementId"] for w in _interactions(client, ["와파린"])}
    assert {"omega3", "coq10"} <= found


def test_same_message_from_two_classes_is_merged(client):
    omega = [w for w in _interactions(client, ["와파린", "아스피린"]) if w["supplementId"] == "omega3"
             and "출혈" in w["message"]]
    assert len(omega) == 1 and set(omega[0]["drugs"]) == {"와파린", "아스피린"}


def test_taken_supplement_gets_drug_warning(client):
    client.put("/api/users/me", json={"medications": ["와파린", "레보티록신"], "currentSupplements": ["vitamin_k", "calcium"]})
    warnings = client.get("/api/supplements/check").json()["interactions"]
    by_id = {w["supplementId"]: w for w in warnings}
    assert "비타민K" in by_id["vitamin_k"]["message"]
    assert by_id["calcium"]["hours"] == 4


def test_diagnosed_liver_disease_excludes_red_yeast_rice(client):
    client.put("/api/users/me", json={"medications": [], "conditions": ["liver"]})
    r = client.get("/api/recommendations").json()
    excluded = {e["supplementId"]: e["message"] for e in r["excluded"]}
    assert "간 질환" in excluded["red_yeast_rice"]
