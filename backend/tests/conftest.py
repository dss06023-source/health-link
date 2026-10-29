import pytest


@pytest.fixture(autouse=True)
def _mock_ocr(monkeypatch):
    # 다른 API 테스트는 견본 결과지 값으로 돈다. 실제 인식은 test_ocr.py가 따로 본다.
    monkeypatch.setenv("HEALTH_ITDA_OCR", "mock")


@pytest.fixture(autouse=True)
def _no_public_api_keys(monkeypatch):
    # 테스트는 외부 API를 부르지 않는다. 실제 응답 모양은 test_public_api.py가 가짜 응답으로 본다.
    for name in ("DATA_GO_KR_KEY", "JUSO_API_KEY", "KAKAO_REST_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    from app import public_api
    public_api._cache.clear()
