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


def test_pdf_fits_two_pages_and_reads_cleanly(app):
    survey = {"products": [{"name": "OO 오메가3 1000", "perDay": "2캡슐"}, {"name": "OO 마그네슘", "perDay": "1정"}],
              "timing": "약은 아침 식후", "otc": ["진통제"], "symptoms": ["속쓰림"], "procedure": "endoscopy",
              "caffeine": 3, "shiftWork": True, "question": "오메가3를 저녁으로 옮겨도 되나요?"}
    with TestClient(app) as c:
        c.post("/api/auth/guest")
        pid = c.post("/api/consult/checkout", json={"method": "card", "amount": 1900, "survey": survey}).json()["purchaseId"]
        with pdfplumber.open(io.BytesIO(c.get(f"/api/consult/{pid}/pdf").content)) as pdf:
            pages = len(pdf.pages)
            text = "".join(p.extract_text() for p in pdf.pages).replace("\n", "")
        assert pages <= 2
        # 아래·위가 같은 섭취량은 한 숫자로, 섭취량이 없는 영양제는 빈칸 대신 안내를 쓴다.
        assert "130~130" not in text and "실리마린 130mg" in text and "성분마다 따로 정해짐" in text
        # 오래된 검진은 시점을 알린다(시연 검진일 2024-10-15, 작성일 2026-10-28).
        assert "약 2년 앞섭니다" in text
        # 직접 적은 질문이 질문 목록 맨 앞에 온다.
        questions = text.split("여쭤볼 질문", 1)[1]
        assert questions.index("직접 적은 질문") < questions.index("함께 먹어도 되는지")
        # 출처를 확인하지 못한 규칙(식물스테롤×스타틴 등)은 원문 대조표에 싣지 않는다.
        assert "콜레스테롤 약을 대신하지" not in text and "식물스테롤을 아토르바스타틴" not in text


def test_allergies_go_into_pdf_with_notice_basis(app):
    # 고시 3. 2-29(포스파티딜세린 원재료 대두 레시틴)·2-30·2-31·2-49(게·새우). 알레르기는 한글 이름으로 싣는다.
    with TestClient(app) as c:
        c.post("/api/auth/guest")
        assert c.put("/api/users/me", json={"allergies": ["shellfish", "soy"], "customAllergies": ["땅콩"]}).status_code == 200
        pid = c.post("/api/consult/checkout", json={"method": "card", "amount": 1900}).json()["purchaseId"]
        with pdfplumber.open(io.BytesIO(c.get(f"/api/consult/{pid}/pdf").content)) as pdf:
            text = "".join(p.extract_text() for p in pdf.pages).replace("\n", "")
        assert "shellfish" not in text and "갑각류, 대두, 땅콩" in text
        flat = text.replace(" ", "")
        assert "알레르기:갑각류" in flat and "알레르기:대두" in flat and "2-49" in flat and "2-29" in flat
        assert "땅콩 알레르기가 있는데" in text and "갑각류 알레르기가 있는데" in text
        # 출처 없는 직접 입력 알레르기는 대조표에 싣지 않고 질문으로만 남긴다.
        assert "알레르기:땅콩" not in flat
