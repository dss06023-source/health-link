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
