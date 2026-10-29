import json
import sqlite3

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


def test_api_needs_login_but_public_lists_do_not(app):
    with TestClient(app) as c:
        assert c.get("/api/users/me").status_code == 401
        assert c.get("/api/supplements").status_code == 401
        assert c.get("/api/options").status_code == 200
        assert c.get("/api/health").status_code == 200


def test_two_accounts_do_not_see_each_others_data(app):
    with TestClient(app) as a, TestClient(app) as b:
        assert a.post("/api/auth/signup", json={"username": "alice", "password": "password1"}).json()["onboarded"] is False
        b.post("/api/auth/signup", json={"username": "bob_2", "password": "password2"})
        a.put("/api/users/me", json={"name": "앨리스", "address": {"sido": "부산광역시", "sigungu": "해운대구"}})
        s = a.post("/api/supplements", json={"supplementId": "iron"}).json()
        a.post("/api/measurements", json={"type": "bp", "values": {"sbp": 120, "dbp": 80}})
        me_b = b.get("/api/users/me").json()
        assert me_b["name"] == "bob_2" and me_b["onboarded"] is False
        assert b.get("/api/supplements").json() == [] and b.get("/api/measurements").json() == []
        # 남의 기록 번호로 고치거나 지울 수 없다.
        assert b.patch(f"/api/supplements/{s['id']}", json={"paused": True}).status_code == 404
        assert b.post("/api/intake-logs", json={"supplementId": s["id"], "timeSlot": "morning"}).status_code == 404
        assert a.get("/api/users/me").json()["onboarded"] is True


def test_login_logout_and_wrong_password(app):
    with TestClient(app) as c:
        c.post("/api/auth/signup", json={"username": "carol", "password": "password3"})
        c.post("/api/auth/logout")
        assert c.get("/api/users/me").status_code == 401
        assert c.post("/api/auth/login", json={"username": "carol", "password": "wrong-pass"}).status_code == 401
        assert c.post("/api/auth/login", json={"username": "Carol", "password": "password3"}).json()["username"] == "carol"
        assert c.get("/api/users/me").status_code == 200


def test_signup_rules_and_duplicate(app):
    with TestClient(app) as c:
        assert c.post("/api/auth/signup", json={"username": "ab", "password": "password1"}).status_code == 422
        assert c.post("/api/auth/signup", json={"username": "guest_x1", "password": "password1"}).status_code == 422
        assert c.post("/api/auth/signup", json={"username": "dave", "password": "short"}).status_code == 422
        assert c.post("/api/auth/signup", json={"username": "dave", "password": "password1"}).status_code == 201
        assert c.post("/api/auth/signup", json={"username": "dave", "password": "password1"}).status_code == 409


def test_password_is_not_stored_and_login_attempts_are_limited(app, tmp_path):
    with TestClient(app) as c:
        c.post("/api/auth/signup", json={"username": "erin", "password": "password4"})
        for _ in range(10):
            c.post("/api/auth/login", json={"username": "erin", "password": "nope-nope"})
        assert c.post("/api/auth/login", json={"username": "erin", "password": "password4"}).status_code == 429
    from app import db
    with db.connect() as conn:
        stored = conn.execute("SELECT password_hash FROM users WHERE username = 'erin'").fetchone()[0]
    assert "password4" not in stored and stored.startswith("scrypt$")


def test_guest_has_demo_data_and_reset_only_for_guest(app):
    with TestClient(app) as g, TestClient(app) as u:
        assert g.post("/api/auth/guest").json()["isGuest"] is True
        assert g.get("/api/users/me").json()["name"] == "김건강"
        assert len(g.get("/api/supplements").json()) == 4
        assert g.post("/api/demo/reset").status_code == 200
        u.post("/api/auth/signup", json={"username": "frank", "password": "password5"})
        assert u.post("/api/demo/reset").status_code == 403


def test_delete_account_removes_everything(app):
    with TestClient(app) as c:
        c.post("/api/auth/signup", json={"username": "gina", "password": "password6"})
        c.post("/api/supplements", json={"supplementId": "iron"})
        assert c.delete("/api/auth/account").json() == {"deleted": True}
        assert c.get("/api/users/me").status_code == 401
        assert c.post("/api/auth/login", json={"username": "gina", "password": "password6"}).status_code == 401


@pytest.mark.skipif(bool(__import__("os").environ.get("TEST_DATABASE_URL")), reason="SQLite 파일로 옛 DB를 만든다")
def test_old_single_user_db_is_upgraded(app, tmp_path):
    # 계정 기능 전의 DB(사용자 1명, user_id 칸 없음)에서 서버가 올라와도 동작한다.
    conn = sqlite3.connect(tmp_path / "test.db")
    conn.executescript("""
        CREATE TABLE users (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE supplements (id INTEGER PRIMARY KEY AUTOINCREMENT, catalog_id TEXT NOT NULL, time_slots TEXT NOT NULL,
            paused INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, ended_at TEXT, source TEXT NOT NULL);
    """)
    conn.execute("INSERT INTO users VALUES (1, ?)", (json.dumps({"name": "옛사람"}),))
    conn.execute("INSERT INTO supplements (catalog_id, time_slots, started_at, source) VALUES ('iron', '[\"morning\"]', '2026-01-01', 'manual')")
    conn.commit(); conn.close()
    with TestClient(app) as c:
        c.post("/api/auth/signup", json={"username": "henry", "password": "password7"})
        assert c.get("/api/supplements").json() == []
        assert c.get("/api/users/me").json()["name"] == "henry"


def test_new_account_can_upload_and_get_recommendations(app):
    with TestClient(app) as c:
        c.post("/api/auth/signup", json={"username": "ivan", "password": "password8"})
        c.put("/api/users/me", json={"name": "이반", "birthYear": 1980, "gender": "M"})
        up = c.post("/api/checkups/upload", files={"file": ("a.jpg", b"fake", "image/jpeg")})
        assert up.status_code == 200, up.text
        c.patch(f"/api/checkups/{up.json()['id']}", json={"confirm": True})
        assert c.get("/api/recommendations").status_code == 200
        assert len(c.get("/api/checkups").json()) == 1


def test_height_and_weight_make_bmi(app):
    with TestClient(app) as c:
        c.post("/api/auth/signup", json={"username": "jane", "password": "password9"})
        assert c.put("/api/users/me", json={"heightCm": 99}).status_code == 422
        me = c.put("/api/users/me", json={"heightCm": 165, "weightKg": 60}).json()
        assert me["heightCm"] == 165 and me["weightKg"] == 60
        weights = c.get("/api/measurements").json()
        assert len(weights) == 1 and weights[0]["codes"] == {"bmi": 22.0}
        c.put("/api/users/me", json={"weightKg": 60})  # 같은 값이면 기록을 더 남기지 않는다
        assert len(c.get("/api/measurements").json()) == 1
