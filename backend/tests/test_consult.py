import io

import pdfplumber
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("DEMO_TODAY", "2026-10-28")
    from app import auth, db
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    auth._failures.clear()
    from app.main import app
    return app


def test_first_purchase_is_discounted_and_price_is_checked(app):
    with TestClient(app) as c:
        c.post("/api/auth/guest")
        offer = c.get("/api/consult/offer").json()
        assert offer["firstPurchase"] is True and offer["amount"] == 1900 and offer["price"] == 2900
        assert c.post("/api/consult/checkout", json={"method": "bitcoin", "amount": 1900}).status_code == 422
        first = c.post("/api/consult/checkout", json={"method": "card", "amount": 1900})
        assert first.status_code == 201 and first.json()["amount"] == 1900
        offer = c.get("/api/consult/offer").json()
        assert offer["firstPurchase"] is False and offer["amount"] == 2900 and len(offer["purchases"]) == 1
        # 화면이 옛 금액(첫 구매가)을 보내면 다시 확인하게 한다.
        assert c.post("/api/consult/checkout", json={"method": "card", "amount": 1900}).status_code == 409
        assert c.post("/api/consult/checkout", json={"method": "toss", "amount": 2900}).json()["amount"] == 2900


def test_pdf_lists_sources_and_questions_without_verdicts(app):
    with TestClient(app) as c:
        c.post("/api/auth/guest")
        pid = c.post("/api/consult/checkout", json={"method": "card", "amount": 1900}).json()["purchaseId"]
        r = c.get(f"/api/consult/{pid}/pdf")
        assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
        assert "filename*=UTF-8''" in r.headers["content-disposition"]
        with pdfplumber.open(io.BytesIO(r.content)) as pdf:
            text = "".join(p.extract_text() for p in pdf.pages).replace("\n", "")
        assert "상담 준비 자료" in text and "아토르바스타틴" in text and "원문 대조표" in text
        assert "식약처 고시" in text and "여쭤볼 질문" in text
        # 화면용 판단 문구(추천에서 뺐습니다)는 넣지 않는다.
        assert "추천에서 뺐" not in text


def test_purchase_needs_checkup_and_belongs_to_buyer(app):
    with TestClient(app) as a, TestClient(app) as b:
        a.post("/api/auth/guest")
        pid = a.post("/api/consult/checkout", json={"method": "card", "amount": 1900}).json()["purchaseId"]
        b.post("/api/auth/signup", json={"username": "bob_2", "password": "password2"})
        assert b.get(f"/api/consult/{pid}/pdf").status_code == 404
        assert b.post("/api/consult/checkout", json={"method": "card", "amount": 1900}).status_code == 400


def test_survey_answers_go_into_pdf_as_questions(app):
    survey = {"products": [{"name": "OO 오메가3 1000", "perDay": "2캡슐"}, {"name": " ", "perDay": ""}],
              "timing": "약은 아침 식후, 영양제는 저녁", "otc": ["진통제"], "symptoms": ["속쓰림"],
              "procedure": "endoscopy", "procedureNote": "11월 말", "caffeine": 4, "shiftWork": True,
              "question": "오메가3를 저녁으로 옮겨도 되나요?"}
    with TestClient(app) as c:
        c.post("/api/auth/guest")
        offer = c.get("/api/consult/offer").json()
        assert "진통제" in offer["survey"]["otc"] and "임신 중" in offer["survey"]["pregnancy"].values()
        bad = {**survey, "symptoms": ["두통이 심함"]}
        assert c.post("/api/consult/checkout", json={"method": "card", "amount": 1900, "survey": bad}).status_code == 422
        pid = c.post("/api/consult/checkout", json={"method": "card", "amount": 1900, "survey": survey}).json()["purchaseId"]
        with pdfplumber.open(io.BytesIO(c.get(f"/api/consult/{pid}/pdf").content)) as pdf:
            text = "".join(p.extract_text() for p in pdf.pages).replace("\n", "")
        assert "OO 오메가3 1000" in text and "하루 2캡슐" in text and "약은 아침 식후" in text
        assert "가끔 먹는 진통제를" in text and "속쓰림이" in text and "내시경(11월 말)" in text
        assert "하루 4잔" in text and "교대근무" in text and "오메가3를 저녁으로 옮겨도 되나요?" in text
