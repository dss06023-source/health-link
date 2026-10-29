import pytest


@pytest.fixture(autouse=True)
def _mock_ocr(monkeypatch):
    # 다른 API 테스트는 견본 결과지 값으로 돈다. 실제 인식은 test_ocr.py가 따로 본다.
    monkeypatch.setenv("HEALTH_ITDA_OCR", "mock")


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
        conn.execute("DROP TABLE IF EXISTS users, checkups, supplements, intake_logs, measurements")
