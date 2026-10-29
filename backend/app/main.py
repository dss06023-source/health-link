"""건강잇다 시연용 API 서버. 실행: uvicorn app.main:app --reload --port 8000"""

import json
import math
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import db, logic, measure, options
from . import reference as ref

TIME_SLOTS = ["morning", "lunch", "evening", "bedtime"]


@asynccontextmanager
async def lifespan(_app):
    db.init()
    yield


app = FastAPI(title="건강잇다 시연용 API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------- 공통 ----------

def load_user(conn):
    return json.loads(conn.execute("SELECT data FROM users WHERE id = 1").fetchone()["data"])


def checkup_row(row):
    return {
        "id": row["id"],
        "date": row["date"],
        "source": row["source"],
        "status": row["status"],
        "fileName": row["file_name"],
        "values": json.loads(row["item_values"]),
    }


def get_checkup(conn, checkup_id):
    row = conn.execute("SELECT * FROM checkups WHERE id = ?", (checkup_id,)).fetchone()
    if not row:
        raise HTTPException(404, "검진 결과를 찾을 수 없습니다.")
    return checkup_row(row)


def confirmed_checkups(conn):
    rows = conn.execute("SELECT * FROM checkups WHERE status = 'confirmed' ORDER BY date, id").fetchall()
    return [checkup_row(r) for r in rows]


def supplement_row(row):
    info = ref.SUPPLEMENTS[row["catalog_id"]]
    return {
        "id": row["id"],
        "supplementId": row["catalog_id"],
        "name": info["name"],
        "ingredients": info["ingredients"],
        "dose": info["dose"],
        "claim": info["claim"],
        "timeSlots": json.loads(row["time_slots"]),
        "paused": bool(row["paused"]),
        "startedAt": row["started_at"],
        "endedAt": row["ended_at"],
        "source": row["source"],
    }


def active_supplements(conn, include_paused=True):
    rows = conn.execute("SELECT * FROM supplements WHERE ended_at IS NULL ORDER BY id").fetchall()
    items = [supplement_row(r) for r in rows]
    return items if include_paused else [s for s in items if not s["paused"]]


# ---------- 1. 사용자·검진 알림 ----------

def checkup_notice(user, conn):
    year = db.today().year
    age = year - user["birthYear"]
    # 일반건강검진: 20세 이상, 2년 주기, 출생연도 짝·홀에 맞춰 대상 연도가 정해진다.
    is_target = age >= 20 and (user["birthYear"] % 2) == (year % 2)
    done = any(c["date"].startswith(str(year)) for c in confirmed_checkups(conn))
    next_year = year if is_target and not done else year + (1 if not is_target else 2)
    due = is_target and not done
    if due:
        message = f"{year}년 국가건강검진 대상자입니다. 아직 검진 기록이 없습니다. 연말 전에 받으세요."
    elif is_target:
        message = f"{year}년 검진 결과가 등록되었습니다. 다음 검진은 {next_year}년입니다."
    else:
        message = f"다음 국가건강검진은 {next_year}년입니다."
    return {"age": age, "isTargetThisYear": is_target, "nextCheckupYear": next_year, "checkupDue": due, "message": message}


class UserUpdate(BaseModel):
    name: Optional[str] = None
    birthYear: Optional[int] = None
    gender: Optional[str] = None
    heightCm: Optional[float] = None
    lifestyle: Optional[dict] = None
    medications: Optional[list[str]] = None
    currentSupplements: Optional[list[str]] = None
    conditions: Optional[list[str]] = None
    allergies: Optional[list[str]] = None
    customAllergies: Optional[list[str]] = None
    consent: Optional[dict] = None
    location: Optional[dict] = None


@app.get("/api/users/me")
def get_me():
    with db.connect() as conn:
        user = load_user(conn)
        checkups = confirmed_checkups(conn)
        return {
            **user,
            **checkup_notice(user, conn),
            "lastCheckupDate": checkups[-1]["date"] if checkups else None,
            "isDemoData": True,
        }


@app.put("/api/users/me")
def update_me(body: UserUpdate):
    if body.gender and body.gender not in ("M", "F"):
        raise HTTPException(422, "gender는 M 또는 F입니다.")
    errors = options.check_codes(body.currentSupplements, options.SUPPLEMENTS, "영양제")
    errors += options.check_codes(body.conditions, options.CONDITIONS, "질환")
    errors += options.check_codes(body.allergies, options.ALLERGIES, "알레르기")
    lifestyle = None
    if body.lifestyle is not None:
        bad, lifestyle = options.check_lifestyle(body.lifestyle)
        errors += bad
    if errors:
        raise HTTPException(422, "보기에 없는 값입니다. " + " / ".join(errors))
    # 보기에 없는 약은 '직접 입력'으로 저장하고, 상호작용 규칙이 없다고 알린다.
    unknown = [m for m in body.medications or [] if m not in ref.MEDICATIONS]
    with db.connect() as conn:
        user = load_user(conn)
        changes = body.model_dump(exclude_none=True)
        if lifestyle is not None:
            changes["lifestyle"] = {**user.get("lifestyle", {}), **lifestyle}
        user.update(changes)
        conn.execute("UPDATE users SET data = ? WHERE id = 1", (json.dumps(user, ensure_ascii=False),))
    result = get_me()
    if unknown:
        result["unknownMedications"] = unknown
    return result


@app.get("/api/options")
def profile_options():
    """개인정보 입력 화면의 보기. rules가 false인 보기는 저장만 하고 추천·경고에는 아직 쓰지 않는다."""
    return options.catalog()


@app.get("/api/medications")
def list_medications():
    """입력 화면의 약 보기. 예전 이름(마이데이터 처방명 등)은 목록에 없지만 저장·규칙에는 계속 쓰인다."""
    return [{"name": i["name"], "drugClass": i["drugClass"]}
            for g in ref.PROFILE_OPTIONS["medicationGroups"] for i in g["items"]]


CENTERS = [
    {"id": 1, "name": "가상내과의원", "address": "서울 중구 가상로 12", "lat": 37.5651, "lng": 126.9895, "phone": "02-000-0001"},
    {"id": 2, "name": "샘플건강검진센터", "address": "서울 종로구 예시길 5", "lat": 37.5720, "lng": 126.9794, "phone": "02-000-0002"},
    {"id": 3, "name": "데모가정의학과", "address": "서울 중구 테스트로 88", "lat": 37.5600, "lng": 126.9750, "phone": "02-000-0003"},
    {"id": 4, "name": "모의종합병원 검진센터", "address": "서울 용산구 시연대로 30", "lat": 37.5384, "lng": 126.9654, "phone": "02-000-0004"},
    {"id": 5, "name": "예시연세의원", "address": "서울 서대문구 견본로 7", "lat": 37.5600, "lng": 126.9410, "phone": "02-000-0005"},
]


def distance_km(lat1, lng1, lat2, lng2):
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


@app.get("/api/checkup-centers")
def checkup_centers(lat: Optional[float] = None, lng: Optional[float] = None, limit: int = 5):
    if lat is None or lng is None:
        with db.connect() as conn:
            loc = load_user(conn).get("location") or {"lat": 37.5665, "lng": 126.9780}
        lat, lng = loc["lat"], loc["lng"]
    centers = [
        dict(c, distanceKm=round(distance_km(lat, lng, c["lat"], c["lng"]), 2),
             bookingUrl="https://www.nhis.or.kr", isDemoData=True)
        for c in CENTERS
    ]
    return sorted(centers, key=lambda c: c["distanceKm"])[:limit]


# ---------- 2. 결과 연동(모의 OCR) ----------

@app.post("/api/checkups/upload")
async def upload_checkup(file: UploadFile = File(...)):
    """결과지 PDF·사진을 받아 모의 OCR 결과를 돌려준다. 파일 내용은 저장하지 않는다."""
    content_type = file.content_type or ""
    name = file.filename or "upload"
    if not (content_type.startswith("image/") or content_type == "application/pdf" or name.lower().endswith(".pdf")):
        raise HTTPException(415, "PDF 또는 이미지 파일만 올릴 수 있습니다.")
    await file.read()
    source = "pdf" if name.lower().endswith(".pdf") or content_type == "application/pdf" else "photo"
    values = dict(db.CHECKUP_2026_SAMPLE)
    with db.connect() as conn:
        cur = conn.execute(
            "INSERT INTO checkups (date, source, status, file_name, item_values) VALUES (?, ?, 'pending_review', ?, ?)",
            (db.today().isoformat(), source, name, json.dumps(values)),
        )
        checkup = get_checkup(conn, cur.lastrowid)
    # 사진은 인식 신뢰도가 낮은 항목을 표시해 사용자가 확인하게 한다.
    low_confidence = {"ggt", "hdl"} if source == "photo" else set()
    checkup["ocr"] = {
        "engine": "mock",
        "fields": [
            {"code": code, "name": ref.CHECKUP_ITEMS[code]["name"], "value": v, "unit": ref.CHECKUP_ITEMS[code]["unit"],
             "confidence": 0.72 if code in low_confidence else 0.98, "needsReview": code in low_confidence}
            for code, v in values.items()
        ],
        "message": "인식한 수치를 확인해 주세요. 틀린 값은 고친 뒤 확정하세요.",
    }
    return checkup


class CheckupUpdate(BaseModel):
    date: Optional[str] = None
    values: Optional[dict[str, float]] = None
    confirm: bool = False


@app.patch("/api/checkups/{checkup_id}")
def update_checkup(checkup_id: int, body: CheckupUpdate):
    """OCR 결과를 사용자가 고치거나 확정한다."""
    with db.connect() as conn:
        checkup = get_checkup(conn, checkup_id)
        values = checkup["values"]
        if body.values:
            bad = [c for c in body.values if c not in ref.CHECKUP_ITEMS]
            if bad:
                raise HTTPException(422, f"알 수 없는 항목: {', '.join(bad)}")
            values.update(body.values)
        if body.date:
            date.fromisoformat(body.date)
        conn.execute(
            "UPDATE checkups SET item_values = ?, date = ?, status = ? WHERE id = ?",
            (json.dumps(values), body.date or checkup["date"], "confirmed" if body.confirm else checkup["status"], checkup_id),
        )
    return get_checkup_detail(checkup_id)


@app.delete("/api/checkups/{checkup_id}")
def delete_checkup(checkup_id: int):
    with db.connect() as conn:
        get_checkup(conn, checkup_id)
        conn.execute("DELETE FROM checkups WHERE id = ?", (checkup_id,))
    return {"deleted": checkup_id}


@app.get("/api/checkups")
def list_checkups():
    with db.connect() as conn:
        user = load_user(conn)
        rows = conn.execute("SELECT * FROM checkups ORDER BY date DESC, id DESC").fetchall()
    result = []
    for row in rows:
        c = checkup_row(row)
        summary = logic.interpret(c.pop("values"), user["gender"])["summary"]
        result.append(dict(c, summary=summary))
    return result


# ---------- 3. 결과 해석 ----------

@app.get("/api/checkups/latest")
def latest_checkup():
    with db.connect() as conn:
        checkups = confirmed_checkups(conn)
    if not checkups:
        raise HTTPException(404, "확정된 검진 결과가 없습니다.")
    return get_checkup_detail(checkups[-1]["id"])


@app.get("/api/checkups/{checkup_id}")
def get_checkup_detail(checkup_id: int):
    with db.connect() as conn:
        user = load_user(conn)
        checkup = get_checkup(conn, checkup_id)
        history = [
            c for c in confirmed_checkups(conn)
            if (c["date"], c["id"]) <= (checkup["date"], checkup["id"])
        ]
    if checkup["status"] != "confirmed":
        history.append(checkup)
    detail = logic.interpret(checkup["values"], user["gender"], history)
    values = checkup.pop("values")
    return {**checkup, **detail, "values": values, "disclaimer": ref.DISCLAIMER}


# ---------- 4. 맞춤 추천 ----------

def resolve_checkup_id(conn, checkup_id):
    if checkup_id is not None:
        return checkup_id
    checkups = confirmed_checkups(conn)
    if not checkups:
        raise HTTPException(404, "확정된 검진 결과가 없습니다.")
    return checkups[-1]["id"]


@app.get("/api/recommendations")
def recommendations(checkupId: Optional[int] = None):
    with db.connect() as conn:
        user = load_user(conn)
        checkup = get_checkup(conn, resolve_checkup_id(conn, checkupId))
        active = [s["supplementId"] for s in active_supplements(conn)]
    # 입력 화면에서 '먹고 있다'고 고른 영양제도 중복 점검에 넣는다(규칙표에 있는 것만).
    active += [c for c in user.get("currentSupplements", []) if c in ref.SUPPLEMENTS and c not in active]
    result = logic.recommend(user, checkup["values"], active)
    return {"checkupId": checkup["id"], "checkupDate": checkup["date"], "medications": user.get("medications", []), **result}


# ---------- 5. 복용 관리 ----------

@app.get("/api/supplements/catalog")
def supplement_catalog():
    return [{"supplementId": cid, **info} for cid, info in ref.SUPPLEMENTS.items()]


@app.get("/api/supplements")
def list_supplements(includeEnded: bool = False):
    with db.connect() as conn:
        if includeEnded:
            return [supplement_row(r) for r in conn.execute("SELECT * FROM supplements ORDER BY id").fetchall()]
        return active_supplements(conn)


@app.get("/api/supplements/check")
def check_supplements():
    """복용 중인 구성의 중복 성분과 약물 상호작용 점검."""
    with db.connect() as conn:
        user = load_user(conn)
        active = active_supplements(conn, include_paused=False)
    ids = [s["supplementId"] for s in active]
    # 입력 화면에서 '먹고 있다'고 고른 영양제(규칙표 밖의 칼슘·비타민K 등 포함)도 약과의 상호작용을 본다.
    taking = ids + [c for c in user.get("currentSupplements", []) if c not in ids]
    meds = user.get("medications", [])
    classes = logic.medication_classes(meds)
    interactions = [
        dict(w, supplementId=cid) for cid in taking for w in logic.interaction_warnings(cid, classes, meds)
    ]
    duplicates = logic.ingredient_overlaps(ids)
    return {
        "supplements": ids,
        "duplicates": duplicates,
        "interactions": interactions,
        "ok": not duplicates and not interactions,
    }


class SupplementCreate(BaseModel):
    supplementId: str
    timeSlots: Optional[list[str]] = None
    source: str = "recommendation"


class SupplementUpdate(BaseModel):
    timeSlots: Optional[list[str]] = None
    paused: Optional[bool] = None


def check_slots(slots):
    bad = [s for s in slots or [] if s not in TIME_SLOTS]
    if bad:
        raise HTTPException(422, f"timeSlots는 {', '.join(TIME_SLOTS)} 중에서 고르세요.")


@app.post("/api/supplements", status_code=201)
def add_supplement(body: SupplementCreate):
    if body.supplementId not in ref.SUPPLEMENTS:
        raise HTTPException(404, "목록에 없는 영양제입니다.")
    check_slots(body.timeSlots)
    with db.connect() as conn:
        if any(s["supplementId"] == body.supplementId for s in active_supplements(conn)):
            raise HTTPException(409, "이미 복용 중인 영양제입니다.")
        slots = body.timeSlots or ref.SUPPLEMENTS[body.supplementId]["timeSlots"]
        cur = conn.execute(
            "INSERT INTO supplements (catalog_id, time_slots, started_at, source) VALUES (?, ?, ?, ?)",
            (body.supplementId, json.dumps(slots), db.today().isoformat(), body.source),
        )
        return supplement_row(conn.execute("SELECT * FROM supplements WHERE id = ?", (cur.lastrowid,)).fetchone())


def get_supplement_row(conn, sid):
    row = conn.execute("SELECT * FROM supplements WHERE id = ?", (sid,)).fetchone()
    if not row:
        raise HTTPException(404, "복용 목록에 없는 항목입니다.")
    return row


@app.patch("/api/supplements/{sid}")
def update_supplement(sid: int, body: SupplementUpdate):
    """복용 시간대 변경, 일시정지·재개."""
    check_slots(body.timeSlots)
    with db.connect() as conn:
        get_supplement_row(conn, sid)
        if body.timeSlots is not None:
            conn.execute("UPDATE supplements SET time_slots = ? WHERE id = ?", (json.dumps(body.timeSlots), sid))
        if body.paused is not None:
            conn.execute("UPDATE supplements SET paused = ? WHERE id = ?", (int(body.paused), sid))
        return supplement_row(get_supplement_row(conn, sid))


@app.delete("/api/supplements/{sid}")
def stop_supplement(sid: int):
    """복용 중단. 기록은 남긴다."""
    with db.connect() as conn:
        get_supplement_row(conn, sid)
        conn.execute("UPDATE supplements SET ended_at = ? WHERE id = ?", (db.today().isoformat(), sid))
        return supplement_row(get_supplement_row(conn, sid))


class IntakeLog(BaseModel):
    supplementId: int
    timeSlot: str
    taken: bool = True
    date: Optional[str] = None


def scheduled_on(supplements, day):
    """그날 먹어야 하는 (영양제, 시간대) 목록. 현재 구성 기준으로 계산한다."""
    iso = day.isoformat()
    return [
        (s, slot) for s in supplements
        if not s["paused"] and s["startedAt"] <= iso and (s["endedAt"] is None or s["endedAt"] > iso)
        for slot in s["timeSlots"]
    ]


@app.post("/api/intake-logs")
def log_intake(body: IntakeLog):
    check_slots([body.timeSlot])
    day = body.date or db.today().isoformat()
    date.fromisoformat(day)
    with db.connect() as conn:
        get_supplement_row(conn, body.supplementId)
        conn.execute(
            """INSERT INTO intake_logs (date, time_slot, supplement_id, taken) VALUES (?, ?, ?, ?)
               ON CONFLICT (date, time_slot, supplement_id) DO UPDATE SET taken = excluded.taken""",
            (day, body.timeSlot, body.supplementId, int(body.taken)),
        )
    return today_intake(day)


@app.get("/api/intake-logs/today")
def today_intake(day: Optional[str] = Query(None, alias="date")):
    """오늘(또는 지정일) 복용 체크 목록과 복용률."""
    target = date.fromisoformat(day) if day else db.today()
    with db.connect() as conn:
        supplements = active_supplements(conn)
        logs = {
            (r["supplement_id"], r["time_slot"]): bool(r["taken"])
            for r in conn.execute("SELECT * FROM intake_logs WHERE date = ?", (target.isoformat(),))
        }
    slots = [
        {"supplementId": s["id"], "name": s["name"], "timeSlot": slot, "taken": logs.get((s["id"], slot), False)}
        for s, slot in scheduled_on(supplements, target)
    ]
    slots.sort(key=lambda x: (TIME_SLOTS.index(x["timeSlot"]), x["supplementId"]))
    taken = sum(1 for s in slots if s["taken"])
    return {
        "date": target.isoformat(),
        "items": slots,
        "takenCount": taken,
        "scheduledCount": len(slots),
        "rate": round(taken / len(slots), 2) if slots else None,
    }


def intake_history(conn, start, end):
    supplements = [supplement_row(r) for r in conn.execute("SELECT * FROM supplements").fetchall()]
    rows = conn.execute(
        "SELECT * FROM intake_logs WHERE date BETWEEN ? AND ? ORDER BY date", (start.isoformat(), end.isoformat())
    ).fetchall()
    taken = {(r["date"], r["supplement_id"], r["time_slot"]) for r in rows if r["taken"]}
    first_log = rows[0]["date"] if rows else None
    daily = []
    day = start
    while day <= end:
        if first_log and day.isoformat() >= first_log:
            sched = scheduled_on(supplements, day)
            done = sum(1 for s, slot in sched if (day.isoformat(), s["id"], slot) in taken)
            daily.append({
                "date": day.isoformat(), "scheduled": len(sched), "taken": done,
                "rate": round(done / len(sched), 2) if sched else None,
            })
        day += timedelta(days=1)
    total_s = sum(d["scheduled"] for d in daily)
    total_t = sum(d["taken"] for d in daily)
    return {
        "logs": [
            {"date": r["date"], "timeSlot": r["time_slot"], "supplementId": r["supplement_id"], "taken": bool(r["taken"])}
            for r in rows
        ],
        "daily": daily,
        "recordedFrom": first_log,
        "rate": round(total_t / total_s, 2) if total_s else None,
    }


@app.get("/api/intake-logs")
def list_intake(from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = None):
    """기간별 복용 기록(달력용). 기본은 최근 30일."""
    end = date.fromisoformat(to) if to else db.today()
    start = date.fromisoformat(from_) if from_ else end - timedelta(days=29)
    with db.connect() as conn:
        return {"from": start.isoformat(), "to": end.isoformat(), **intake_history(conn, start, end)}


# ---------- 6. 변화 리포트 ----------

@app.get("/api/reports/compare")
def compare_report(from_: Optional[int] = Query(None, alias="from"), to: Optional[int] = None):
    """두 검진(기본: 확정된 최근 2건)을 비교한다. from·to는 검진 id."""
    with db.connect() as conn:
        user = load_user(conn)
        checkups = confirmed_checkups(conn)
        if from_ is None or to is None:
            if len(checkups) < 2:
                raise HTTPException(404, "비교하려면 확정된 검진 결과가 2건 이상 필요합니다.")
            before, after = checkups[-2], checkups[-1]
        else:
            before, after = get_checkup(conn, from_), get_checkup(conn, to)
        start, end = date.fromisoformat(before["date"]), date.fromisoformat(after["date"])
        intake = intake_history(conn, start, end)
        records = measure.load(conn, user.get("heightCm"), before["date"], after["date"])
        during = [
            supplement_row(r) for r in conn.execute(
                "SELECT * FROM supplements WHERE started_at <= ? AND (ended_at IS NULL OR ended_at >= ?)",
                (after["date"], before["date"]),
            ).fetchall()
        ]
    result = logic.compare(before, after, user["gender"])
    return {
        "from": {"id": before["id"], "date": before["date"]},
        "to": {"id": after["id"], "date": after["date"]},
        **result,
        "supplementsDuring": [
            {k: s[k] for k in ("id", "supplementId", "name", "startedAt", "endedAt")} for s in during
        ],
        "adherence": {"rate": intake["rate"], "recordedFrom": intake["recordedFrom"], "daily": intake["daily"]},
        "measurements": {"series": measure.series(records), "count": len(records), "note": measure.NOTE},
    }


# ---------- 시연 도구 ----------

@app.post("/api/demo/reset")
def demo_reset():
    """시연을 처음 상태로 되돌린다(가상 데이터 다시 생성)."""
    db.init(reset=True)
    return {"reset": True}


@app.get("/api/health")
def health():
    return {"ok": True}


# 마이데이터·복용 알림·중간 검사. 위의 도우미 함수를 쓰므로 맨 끝에서 붙인다.
from .features import router as features_router  # noqa: E402

app.include_router(features_router)
