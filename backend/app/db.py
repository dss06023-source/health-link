"""저장소와 가짜 데이터 시드. 사용자(계정)마다 기록을 나눠 저장한다.

DATABASE_URL(postgresql://…)이 있으면 Postgres(Neon 등)에 저장해 서버가 잠들거나 다시 배포돼도 남는다.
없으면 서버 안 SQLite 파일을 쓴다(개발·시험용). 두 경우 모두 같은 SQL(? 자리표시)로 다룬다.
"""

import json
import os
import sqlite3
from contextvars import ContextVar
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

DB_PATH = os.environ.get("HEALTH_ITDA_DB", os.path.join(os.path.dirname(__file__), "..", "data", "demo.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL
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
CREATE TABLE IF NOT EXISTS measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    measured_at TEXT NOT NULL,
    item_values TEXT NOT NULL,
    fasting INTEGER,
    note TEXT
);
"""

# 예전(사용자 1명) 표에 나중에 붙인 칸. 이미 있는 DB에도 init이 덧붙인다.
ADDED_COLUMNS = {
    "users": [("username", "TEXT"), ("password_hash", "TEXT"), ("is_guest", "INTEGER NOT NULL DEFAULT 0"),
              ("created_at", "TEXT")],
    "checkups": [("user_id", "INTEGER NOT NULL DEFAULT 1")],
    "supplements": [("user_id", "INTEGER NOT NULL DEFAULT 1")],
    "intake_logs": [("user_id", "INTEGER NOT NULL DEFAULT 1")],
    "measurements": [("user_id", "INTEGER NOT NULL DEFAULT 1")],
}
TABLES = ("users", "sessions", "checkups", "supplements", "intake_logs", "measurements")

# 지금 요청을 보낸 사용자. 로그인 확인(main.auth_guard)이 정하고, 모든 질의가 이 값으로 거른다.
current_user: ContextVar[int] = ContextVar("current_user")


def uid():
    return current_user.get()


DEMO_USER = {
    "name": "김건강",
    "birthYear": 1986,
    "gender": "M",
    "heightCm": 174,
    "lifestyle": {"smoking": "never", "drinkingPerWeek": 2, "drinksPerSession": 3, "exercisePerWeek": 1,
                  "lowSunlight": True, "sleepHours": 6.5, "diet": ["eatOut"]},
    "medications": ["아토르바스타틴"],
    "currentSupplements": [],
    "conditions": ["dyslipidemia"],
    "allergies": [],
    "customAllergies": [],
    "consent": {"sensitiveData": True, "agreedAt": "2024-10-20"},
    "address": {"sido": "서울특별시", "sigungu": "중구", "roadAddress": "서울특별시 중구 세종대로 110", "detailAddress": ""},
    "location": {"lat": 37.5665, "lng": 126.9780},
    "reminders": {
        "enabled": True,
        "times": {"morning": "08:00", "lunch": "12:30", "evening": "19:00", "bedtime": "22:00"},
        "snoozed": {},
    },
    "mydata": {"connected": False},
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


# 마이데이터(가상)로 가져오는 기록. 2024년 검진은 이미 있으므로 중복으로 건너뛴다.
MYDATA_CHECKUPS = [
    {"date": "2022-10-18", "institution": "가상내과의원", "values": {
        "sbp": 131, "dbp": 84, "fbs": 104, "tc": 219, "ldl": 141, "hdl": 46,
        "tg": 188, "ast": 35, "alt": 41, "ggt": 66, "hb": 15.0, "bmi": 25.1,
    }},
    {"date": "2024-10-15", "institution": "샘플건강검진센터", "values": CHECKUP_2024},
]
MYDATA_PRESCRIPTIONS = [
    {"name": "아토르바스타틴", "dispensedAt": "2026-09-30", "days": 90, "institution": "가상내과의원"},
    {"name": "암로디핀", "dispensedAt": "2026-09-30", "days": 90, "institution": "가상내과의원"},
]
MYDATA_PROVIDER = "건강정보 고속도로(가상)"


def today():
    override = os.environ.get("DEMO_TODAY")
    # 시연은 한국 시간 기준으로 날짜를 센다.
    return date.fromisoformat(override) if override else datetime.now(ZoneInfo("Asia/Seoul")).date()


class _Row(dict):
    """sqlite3.Row처럼 이름과 순서 둘 다로 꺼낼 수 있는 행."""

    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


class _Cursor:
    def __init__(self, cur, lastrowid=None):
        self._cur, self.lastrowid = cur, lastrowid

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def __iter__(self):
        return iter(self._cur)


class _PgConn:
    """psycopg 연결을 sqlite3 연결처럼 쓰게 감싼다. with 블록이 끝나면 커밋하고 닫는다."""

    def __init__(self, url):
        import psycopg

        self._conn = psycopg.connect(url, row_factory=lambda cur: lambda values: _Row(
            zip([c.name for c in cur.description], values)))

    def execute(self, sql, params=()):
        sql = sql.replace("?", "%s")
        is_insert = sql.lstrip().upper().startswith("INSERT")
        if is_insert:
            sql += " RETURNING id"
        cur = self._conn.execute(sql, params)
        return _Cursor(cur, cur.fetchone()["id"] if is_insert else None)

    def executescript(self, script):
        for statement in script.split(";"):
            if statement.strip():
                self._conn.execute(statement)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, *_):
        if exc_type is None:
            self._conn.commit()
        else:
            self._conn.rollback()
        self._conn.close()


def connect():
    url = os.environ.get("DATABASE_URL")
    if url:
        return _PgConn(url)
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _columns(conn, table):
    if isinstance(conn, sqlite3.Connection):
        return {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
    return {r["column_name"] for r in conn.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = ?", (table,))}


def init(reset=False):
    with connect() as conn:
        if reset:
            for table in TABLES:
                conn.execute(f"DROP TABLE IF EXISTS {table}")
        conn.executescript(SCHEMA if isinstance(conn, sqlite3.Connection)
                           else SCHEMA.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY"))
        for table, columns in ADDED_COLUMNS.items():
            have = _columns(conn, table)
            for name, kind in columns:
                if name not in have:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {kind}")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users (username)")
        # 예전 1번 사용자(계정 없음)의 기록은 아무도 볼 수 없으므로 정리한다.
        if conn.execute("SELECT 1 FROM users WHERE id = 1 AND username IS NULL").fetchone():
            delete_user(conn, 1)


def delete_user(conn, user_id):
    for table in ("intake_logs", "supplements", "checkups", "measurements"):
        conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def create_user(conn, username, password_hash, data, is_guest=False):
    """새 계정. users.id는 예전 표(자동 번호 없음)와 맞추려고 직접 매긴다."""
    user_id = (conn.execute("SELECT MAX(id) FROM users").fetchone()[0] or 0) + 1
    conn.execute(
        "INSERT INTO users (id, data, username, password_hash, is_guest, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, json.dumps(data, ensure_ascii=False), username, password_hash, int(is_guest),
         datetime.now(ZoneInfo("Asia/Seoul")).isoformat(timespec="seconds")),
    )
    return user_id


# 새로 가입한 사람의 처음 값. 시작 화면(onboarded=False)에서 채운다.
def new_user_data(name):
    return {
        **{k: v for k, v in DEMO_USER.items() if k in ("lifestyle", "reminders", "mydata", "location", "address")},
        "name": name, "birthYear": 1990, "gender": "M", "heightCm": None,
        "lifestyle": {"smoking": "never", "drinkingPerWeek": 0, "drinksPerSession": 0, "exercisePerWeek": 0,
                      "lowSunlight": False, "sleepHours": 7, "diet": []},
        "medications": [], "currentSupplements": [], "conditions": [], "allergies": [], "customAllergies": [],
        "consent": {"sensitiveData": False, "agreedAt": None},
        "onboarded": False,
    }


def seed(conn, user_id):
    """체험 계정에 가상 인물의 검진·복용·측정 기록을 채운다."""
    conn.execute("UPDATE users SET data = ? WHERE id = ?", (json.dumps(DEMO_USER, ensure_ascii=False), user_id))
    for table in ("intake_logs", "supplements", "checkups", "measurements"):
        conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
    conn.execute(
        "INSERT INTO checkups (user_id, date, source, status, file_name, item_values) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, "2024-10-15", "pdf", "confirmed", "2024_건강검진결과.pdf", json.dumps(CHECKUP_2024)),
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
            "INSERT INTO supplements (user_id, catalog_id, time_slots, started_at, source) VALUES (?, ?, ?, ?, ?)",
            (user_id, catalog_id, json.dumps(slots), started, source),
        )
        ids.append(cur.lastrowid)
    # 최근 60일 복용 기록. 정해진 패턴으로 약 85%를 먹은 것으로 만든다.
    end = today()
    for offset in range(60, 0, -1):
        day = end - timedelta(days=offset)
        for n, supplement_id in enumerate(ids):
            taken = (day.toordinal() * 7 + n * 3) % 20 >= 3
            conn.execute(
                "INSERT INTO intake_logs (user_id, date, time_slot, supplement_id, taken) VALUES (?, ?, ?, ?, ?)",
                (user_id, day.isoformat(), "morning", supplement_id, int(taken)),
            )
    seed_measurements(conn, end, user_id)


def seed_measurements(conn, end, user_id):
    """2025년 1월부터 매달, 최근 8주는 매주 가정 측정 기록을 만든다. 2024 검진값에서 2026 샘플 값 쪽으로 서서히 움직인다."""
    start = date(2025, 1, 15)
    days = []
    day = start
    while day < end - timedelta(days=56):
        days.append(day)
        day = date(day.year + (day.month == 12), day.month % 12 + 1, 15)
    days += [end - timedelta(days=d) for d in range(56, 0, -7)]
    span = (end - start).days or 1
    height_m = DEMO_USER["heightCm"] / 100
    for n, day in enumerate(days):
        t = (day - start).days / span
        wobble = ((n * 5) % 7 - 3) / 3  # -1~1 사이의 정해진 흔들림

        def lerp(a, b, spread):
            return round(a + (b - a) * t + wobble * spread, 1)

        at = f"{day.isoformat()}T07:30"
        rows = [
            ("bp", {"sbp": round(lerp(134, 126, 3)), "dbp": round(lerp(86, 82, 2))}, None),
            ("weight", {"weightKg": round(lerp(25.6, 24.4, 0.15) * height_m ** 2, 1)}, None),
        ]
        if n % 2 == 0:
            rows.append(("glucose", {"fbs": round(lerp(108, 101, 3))}, 1))
        for kind, values, fasting in rows:
            conn.execute(
                "INSERT INTO measurements (user_id, type, measured_at, item_values, fasting) VALUES (?, ?, ?, ?, ?)",
                (user_id, kind, at, json.dumps(values), fasting),
            )
