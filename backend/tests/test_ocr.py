from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import ocr
from scripts.make_sample_sheet import EXPECTED

FIXTURES = Path(__file__).parent / "fixtures"
needs_model = pytest.mark.skipif(not ocr.available(), reason="OCR 모델 없음 (python -m scripts.get_ocr_models)")


@pytest.fixture(autouse=True)
def _real_ocr(monkeypatch):
    monkeypatch.delenv("HEALTH_ITDA_OCR", raising=False)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DEMO_TODAY", "2026-10-28")
    from app import db
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    from app.main import app
    with TestClient(app) as c:
        yield c


def values(found):
    return {k: v for k, (v, _) in found.items()}


def test_parse_takes_first_number_after_item_name():
    rows = [
        [("고혈압", 1.0), ("혈압(최고/최저)(mmHg)", 1.0), ("126/82", 1.0), ("120/80미만", 1.0)],
        [("이상지질혈증", 1.0), ("총콜레스테롤(mg/dL)", 1.0), ("205", 1.0), ("200미만", 1.0)],
        [("HDL-콜레스테롤(mg/dL)", 1.0), ("47", 0.7), ("60이상", 1.0)],
        [("AST(SGOT)(U/L)", 1.0), ("31", 1.0), ("40 이하", 1.0)],
    ]
    found = ocr.parse_rows(rows)
    assert values(found) == {"sbp": 126, "dbp": 82, "tc": 205, "hdl": 47, "ast": 31}
    assert found["hdl"][1] == 0.7


def test_parse_guesses_misread_name_but_asks_review():
    found = ocr.parse_rows([[("당뇨병", 1.0), ("공복협당(mg/dL)", 0.95), ("101", 1.0), ("100 미만", 1.0)]])
    assert values(found) == {"fbs": 101} and found["fbs"][1] < ocr.REVIEW_SCORE


def test_parse_skips_row_without_result():
    assert ocr.parse_rows([[("허리둘레(cm)", 1.0), ("-", 1.0)]]) == {}


def test_out_of_range_value_needs_review():
    names = {"fbs": ("공복혈당", "mg/dL")}
    assert ocr.fields({"fbs": (1010.0, 1.0)}, names)[0]["needsReview"] is True


def test_text_pdf_is_read_without_ocr():
    found, engine = ocr.read((FIXTURES / "sample_sheet.pdf").read_bytes(), True)
    assert engine == "pdf-text" and values(found) == EXPECTED


@needs_model
@pytest.mark.parametrize("name", ["sample_sheet.png", "sample_sheet_tilted.png"])
def test_photo_is_read_with_ocr(name):
    found, engine = ocr.read((FIXTURES / name).read_bytes(), False)
    assert engine == "ocr" and values(found) == EXPECTED


def test_upload_pdf_returns_read_values(client):
    r = client.post("/api/checkups/upload",
                    files={"file": ("결과.pdf", (FIXTURES / "sample_sheet.pdf").read_bytes(), "application/pdf")})
    body = r.json()
    assert body["ocr"]["engine"] == "pdf-text" and body["ocr"]["missing"] == []
    assert body["values"]["tc"] == 205 and body["values"]["egfr"] == 92


def test_upload_unreadable_pdf_is_rejected(client):
    r = client.post("/api/checkups/upload", files={"file": ("결과.pdf", b"%PDF", "application/pdf")})
    assert r.status_code == 422


# 공식 양식(별지 제6호서식)은 결과 칸이 이름보다 조금 어긋나 있고, 줄마다 '(수축기 140 이상 …)' 같은 안내 숫자가 있다.
def test_official_form_pdf_reads_all_values():
    found, engine = ocr.read((FIXTURES / "official_sheet.pdf").read_bytes(), True)
    assert engine == "pdf-text" and values(found) == EXPECTED


@needs_model
def test_official_form_photo_reads_all_values():
    found, engine = ocr.read((FIXTURES / "official_sheet_p2.jpg").read_bytes(), False)
    assert engine == "ocr" and values(found) == EXPECTED


def test_reference_numbers_are_not_results():
    # (x0, y, h, text, score, x1)
    items = [
        (90, 163, 9, "(수축기/이완기)", 1.0, 155), (325, 168, 9, "(수축기", 1.0, 357), (361, 168, 9, "140", 1.0, 375),
        (379, 168, 9, "이상", 1.0, 397), (160, 196, 10, "혈색소(g/dL)", 1.0, 214), (325, 191, 9, "남13-16.5", 1.0, 368),
        (160, 220, 10, "공복혈당(mg/dL)", 1.0, 228), (330, 220, 9, "100미만", 1.0, 362),
        (60, 300, 10, "혈압", 1.0, 80), (90, 300, 10, "120/80미만", 1.0, 140),
    ]
    assert ocr.parse_items(items) == {}


def test_blood_pressure_with_scattered_digits():
    items = [(166 + 6 * i, 157, 10, d, 1.0, 171 + 6 * i) for i, d in enumerate("126")]
    items += [(188, 157, 10, "/", 1.0, 193), (200, 157, 10, "8", 1.0, 205), (206, 157, 10, "2", 1.0, 211),
              (223, 157, 10, "mmHg", 1.0, 243)]
    assert values(ocr.parse_items(items)) == {"sbp": 126, "dbp": 82}
