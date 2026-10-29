import pytest


@pytest.fixture(autouse=True)
def _mock_ocr(monkeypatch):
    # 다른 API 테스트는 견본 결과지 값으로 돈다. 실제 인식은 test_ocr.py가 따로 본다.
    monkeypatch.setenv("HEALTH_ITDA_OCR", "mock")
