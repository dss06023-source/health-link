"""회원가입·로그인. 아이디+비밀번호로 계정을 만들고, 로그인하면 세션 쿠키로 사용자를 구분한다.

- 비밀번호는 scrypt(무작위 소금)로 바꿔 저장하고 원문은 남기지 않는다.
- 세션 토큰은 쿠키(HttpOnly)로만 주고, DB에는 토큰의 해시만 둔다.
- '체험하기'는 비밀번호 없는 임시 계정에 가상 인물 기록을 채운다. 2일 지나면 지운다.
"""

import hashlib
import hmac
import json
import re
import secrets
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import db

router = APIRouter()

COOKIE = "itda_session"
SESSION_DAYS = 30
GUEST_DAYS = 2
USERNAME_RE = re.compile(r"^[a-z0-9_]{4,20}$")
KST = ZoneInfo("Asia/Seoul")

# 로그인 없이 부를 수 있는 API. 나머지 /api는 로그인한 사용자의 기록만 다룬다.
PUBLIC = ("/api/auth/", "/api/options", "/api/health", "/api/config", "/api/medications", "/api/drugs/search",
          "/api/address/search", "/api/geocode", "/api/supplements/catalog", "/api/measurements/types")


def now():
    return datetime.now(KST)


# ---------- 비밀번호·토큰 ----------

def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def check_password(password, stored):
    try:
        _, salt, digest = (stored or "").split("$")
    except ValueError:
        return False
    test = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1)
    return hmac.compare_digest(test.hex(), digest)


def _token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def session_user(token):
    """쿠키 토큰 → 사용자 id. 없거나 만료되면 None."""
    if not token:
        return None
    with db.connect() as conn:
        row = conn.execute("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?",
                           (_token_hash(token),)).fetchone()
    if not row or row["expires_at"] < now().isoformat():
        return None
    return row["user_id"]


def start_session(conn, response, request, user_id, days=SESSION_DAYS):
    token = secrets.token_urlsafe(32)
    conn.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                 (_token_hash(token), user_id, (now() + timedelta(days=days)).isoformat()))
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(COOKIE, token, max_age=days * 86400, httponly=True, samesite="lax", secure=secure, path="/")


# ---------- 요청마다 사용자 정하기 ----------

class AuthGuard:
    """/api 요청의 세션 쿠키로 사용자를 정해 db.current_user에 넣는다. 로그인이 필요한데 없으면 401."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if scope["type"] != "http" or not path.startswith("/api/") or path.startswith(PUBLIC):
            return await self.app(scope, receive, send)
        token = Request(scope).cookies.get(COOKIE)
        user_id = session_user(token)
        if user_id is None:
            return await JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)(scope, receive, send)
        reset = db.current_user.set(user_id)
        try:
            await self.app(scope, receive, send)
        finally:
            db.current_user.reset(reset)


# ---------- 로그인 실패 제한(서버 메모리, 아이디별 10분에 10번) ----------

_failures: dict = {}


def _too_many(username):
    recent = [t for t in _failures.get(username, []) if time.time() - t < 600]
    _failures[username] = recent
    return len(recent) >= 10


# ---------- API ----------

class Credentials(BaseModel):
    username: str
    password: str


def _account(conn, user_id):
    row = conn.execute("SELECT username, is_guest, data FROM users WHERE id = ?", (user_id,)).fetchone()
    data = json.loads(row["data"])
    return {"username": None if row["is_guest"] else row["username"], "isGuest": bool(row["is_guest"]),
            "name": data.get("name"), "onboarded": data.get("onboarded", True)}


@router.post("/api/auth/signup", status_code=201)
def signup(body: Credentials, request: Request, response: Response):
    username = body.username.strip().lower()
    if not USERNAME_RE.match(username) or username.startswith("guest_"):
        raise HTTPException(422, "아이디는 영문 소문자·숫자·밑줄로 4~20자입니다(guest_로 시작할 수 없음).")
    if len(body.password) < 8 or len(body.password) > 72:
        raise HTTPException(422, "비밀번호는 8~72자입니다.")
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            raise HTTPException(409, "이미 쓰이는 아이디입니다.")
        user_id = db.create_user(conn, username, hash_password(body.password), db.new_user_data(username))
        start_session(conn, response, request, user_id)
        return _account(conn, user_id)


@router.post("/api/auth/login")
def login(body: Credentials, request: Request, response: Response):
    username = body.username.strip().lower()
    if _too_many(username):
        raise HTTPException(429, "로그인 시도가 많습니다. 10분 뒤 다시 해 주십시오.")
    with db.connect() as conn:
        row = conn.execute("SELECT id, password_hash FROM users WHERE username = ? AND is_guest = 0",
                           (username,)).fetchone()
        if not row or not check_password(body.password, row["password_hash"]):
            _failures.setdefault(username, []).append(time.time())
            raise HTTPException(401, "아이디 또는 비밀번호가 맞지 않습니다.")
        _failures.pop(username, None)
        start_session(conn, response, request, row["id"])
        return _account(conn, row["id"])


@router.post("/api/auth/guest", status_code=201)
def guest(request: Request, response: Response):
    """로그인 없이 둘러보기: 가상 인물 기록이 든 임시 계정. 오래된 임시 계정은 이때 지운다."""
    with db.connect() as conn:
        cutoff = (now() - timedelta(days=GUEST_DAYS)).isoformat(timespec="seconds")
        for r in conn.execute("SELECT id FROM users WHERE is_guest = 1 AND created_at < ?", (cutoff,)).fetchall():
            db.delete_user(conn, r["id"])
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now().isoformat(),))
        user_id = db.create_user(conn, f"guest_{secrets.token_hex(6)}", None, {}, is_guest=True)
        db.seed(conn, user_id)
        start_session(conn, response, request, user_id, days=GUEST_DAYS)
        return _account(conn, user_id)


@router.get("/api/auth/me")
def me(request: Request):
    user_id = session_user(request.cookies.get(COOKIE))
    if user_id is None:
        raise HTTPException(401, "로그인이 필요합니다.")
    with db.connect() as conn:
        return _account(conn, user_id)


@router.post("/api/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        with db.connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
    response.delete_cookie(COOKIE, path="/")
    return {"loggedOut": True}


@router.delete("/api/auth/account")
def delete_account(request: Request, response: Response):
    """계정과 모든 기록을 지운다(되돌릴 수 없음)."""
    user_id = session_user(request.cookies.get(COOKIE))
    if user_id is None:
        raise HTTPException(401, "로그인이 필요합니다.")
    with db.connect() as conn:
        db.delete_user(conn, user_id)
    response.delete_cookie(COOKIE, path="/")
    return {"deleted": True}
