import pytest


@pytest.fixture(autouse=True)
def _mock_ocr(monkeypatch):
    # 다른 API 테스트는 견본 결과지 값으로 돈다. 실제 인식은 test_ocr.py가 따로 본다.
    monkeypatch.setenv("HEALTH_ITDA_OCR", "mock")


@pytest.fixture(autouse=True)
def _no_public_api_keys(monkeypatch):
    # 테스트는 외부 API를 부르지 않는다. 실제 응답 모양은 test_public_api.py가 가짜 응답으로 본다.
    for name in ("DATA_GO_KR_KEY", "JUSO_API_KEY", "KAKAO_REST_API_KEY", "KAKAO_JS_KEY"):
        monkeypatch.delenv(name, raising=False)
    from app import public_api
    public_api._cache.clear()


@pytest.fixture(autouse=True)
def _postgres(monkeypatch):
    # TEST_DATABASE_URL을 주면 같은 시험을 Postgres로 돌린다. 시험마다 빈 DB에서 시작한다.
    url = __import__("os").environ.get("TEST_DATABASE_URL")
    if not url:
        monkeypatch.delenv("DATABASE_URL", raising=False)
        return
    monkeypatch.setenv("DATABASE_URL", url)
    import psycopg

    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("DROP TABLE IF EXISTS users, sessions, checkups, supplements, intake_logs, measurements")
