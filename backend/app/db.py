"""SQLite 저장소와 가짜 데이터 시드. 시연에는 가상 인물 1명만 쓴다."""

import json
import os
import sqlite3
from datetime import date, timedelta

DB_PATH = os.environ.get("HEALTH_ITDA_DB", os.path.join(os.path.dirname(__file__), "..", "data", "demo.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checkups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    file_name TEXT,
    item_values TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS supplements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_id TEXT NOT NULL,
    time_slots TEXT NOT NULL,
    paused INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS intake_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time_slot TEXT NOT NULL,
    supplement_id INTEGER NOT NULL,
    taken INTEGER NOT NULL,
    UNIQUE (date, time_slot, supplement_id)
);
"""

DEMO_USER = {
    "name": "김건강",
    "birthYear": 1986,
    "gender": "M",
    "heightCm": 174,
    "lifestyle": {"smoking": False, "drinkingPerWeek": 2, "exercisePerWeek": 1, "lowSunlight": True},
    "medications": ["아토르바스타틴"],
    "consent": {"sensitiveData": True, "agreedAt": "2024-10-20"},
    "location": {"lat": 37.5665, "lng": 126.9780},
}

CHECKUP_2024 = {
    "sbp": 134, "dbp": 86, "fbs": 108, "tc": 228, "ldl": 152, "hdl": 44,
    "tg": 210, "ast": 38, "alt": 48, "ggt": 72, "hb": 14.8, "bmi": 25.6,
}

# 모의 OCR이 돌려주는 올해 결과지 값
CHECKUP_2026_SAMPLE = {
    "sbp": 126, "dbp": 82, "fbs": 101, "tc": 205, "ldl": 128, "hdl": 47,
    "tg": 162, "ast": 31, "alt": 37, "ggt": 58, "hb": 14.9, "bmi": 24.4,
}


def today():
    override = os.environ.get("DEMO_TODAY")
    return date.fromisoformat(override) if override else date.today()


def connect():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init(reset=False):
    with connect() as conn:
        if reset:
            for table in ("users", "checkups", "supplements", "intake_logs"):
                conn.execute(f"DROP TABLE IF EXISTS {table}")
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            seed(conn)


def seed(conn):
    conn.execute("INSERT INTO users (id, data) VALUES (1, ?)", (json.dumps(DEMO_USER, ensure_ascii=False),))
    conn.execute(
        "INSERT INTO checkups (date, source, status, file_name, item_values) VALUES (?, ?, ?, ?, ?)",
        ("2024-10-15", "pdf", "confirmed", "2024_건강검진결과.pdf", json.dumps(CHECKUP_2024)),
    )
    plan = [
        ("omega3", ["morning"], "2024-11-01", "recommendation"),
        ("milk_thistle", ["morning"], "2024-11-01", "recommendation"),
        ("multivitamin", ["morning"], "2023-03-01", "manual"),
        ("vitamin_d", ["morning"], "2025-02-10", "manual"),
    ]
    ids = []
    for catalog_id, slots, started, source in plan:
        cur = conn.execute(
            "INSERT INTO supplements (catalog_id, time_slots, started_at, source) VALUES (?, ?, ?, ?)",
            (catalog_id, json.dumps(slots), started, source),
        )
        ids.append(cur.lastrowid)
    # 최근 60일 복용 기록. 정해진 패턴으로 약 85%를 먹은 것으로 만든다.
    end = today()
    for offset in range(60, 0, -1):
        day = end - timedelta(days=offset)
        for n, supplement_id in enumerate(ids):
            taken = (day.toordinal() * 7 + n * 3) % 20 >= 3
            conn.execute(
                "INSERT INTO intake_logs (date, time_slot, supplement_id, taken) VALUES (?, ?, ?, ?)",
                (day.isoformat(), "morning", supplement_id, int(taken)),
            )
