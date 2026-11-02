"""건강잇다 시연용 API 서버. 실행: uvicorn app.main:app --reload --port 8000"""

import json
import math
import os
import re
import threading
from collections import Counter
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Optional
from urllib.parse import quote

from starlette.concurrency import run_in_threadpool
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import checkup_schedule as sched
from . import auth, consult, db, logic, measure, ocr, options, public_api, regions
from . import reference as ref

TIME_SLOTS = ["morning", "lunch", "evening", "bedtime"]
KST = ZoneInfo("Asia/Seoul")


@asynccontextmanager
async def lifespan(_app):
    db.init()
    # 사진 인식 모델은 읽는 데 무료 서버에서 1분 가까이 걸려, 켜지자마자 뒤에서 미리 올린다.
    threading.Thread(target=ocr.warm_up, daemon=True).start()
    yield
    db.close_pools()


app = FastAPI(title="건강잇다 시연용 API", version="0.1.0", lifespan=lifespan)
app.add_middleware(auth.AuthGuard)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router)
app.include_router(consult.router)


# ---------- 공통 ----------

def load_user(conn):
    return json.loads(conn.execute("SELECT data FROM users WHERE id = ?", (db.uid(),)).fetchone()["data"])


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
    row = conn.execute("SELECT * FROM checkups WHERE id = ? AND user_id = ?", (checkup_id, db.uid())).fetchone()
    if not row:
        raise HTTPException(404, "검진 결과를 찾을 수 없습니다.")
    return checkup_row(row)


def confirmed_checkups(conn):
    rows = conn.execute("SELECT * FROM checkups WHERE status = 'confirmed' AND user_id = ? ORDER BY date, id",
                        (db.uid(),)).fetchall()
    return [checkup_row(r) for r in rows]


SLOT_LABELS = {"morning": "아침", "lunch": "점심", "evening": "저녁", "bedtime": "자기 전"}


def slot_note(info, slots):
    """권장 시간대가 붐벼 altSlots로 옮겨 둔 경우의 안내."""
    if slots == info["timeSlots"] or not set(slots) <= set(info.get("altSlots", [])):
        return None
    return ref.SLOT_BALANCE["note"].format(**{"from": SLOT_LABELS[info["timeSlots"][0]], "to": SLOT_LABELS[slots[0]]})


def default_slots(conn, catalog_id):
    """복용 관리에 넣을 때의 시간대. 권장 시간대가 한도만큼 차 있으면 altSlots 중 덜 붐비는 곳으로 옮긴다.
    한도는 먹는 영양제가 많으면(새로 넣는 것 포함 manyFrom개 이상) maxPerSlotMany, 아니면 maxPerSlot."""
    info = ref.SUPPLEMENTS[catalog_id]
    slots, alts = info["timeSlots"], info.get("altSlots", [])
    if len(slots) != 1 or not alts:
        return slots
    active = active_supplements(conn, include_paused=False)
    rule = ref.SLOT_BALANCE
    limit = rule["maxPerSlotMany"] if len(active) + 1 >= rule["manyFrom"] else rule["maxPerSlot"]
    counts = Counter(slot for s in active for slot in s["timeSlots"])
    if counts[slots[0]] < limit:
        return slots
    best = min(alts, key=lambda slot: (counts[slot], alts.index(slot)))
    return [best] if counts[best] < counts[slots[0]] else slots


def supplement_row(row):
    info = ref.SUPPLEMENTS[row["catalog_id"]]
    slots = json.loads(row["time_slots"])
    return {
        "id": row["id"],
        "supplementId": row["catalog_id"],
        "name": info["name"],
        "ingredients": info["ingredients"],
        "dose": info["dose"],
        "claim": info["claim"],
        "timeSlots": slots,
        "recommendedSlots": info["timeSlots"],  # 권장 시간대와 그 이유(사용자가 시간대를 바꿀 때 보여 준다)
        "altSlots": info.get("altSlots", []),  # 붐빌 때 옮겨도 되는 시간대. 여기로 옮길 때는 다시 묻지 않는다.
        "timingReason": info["timingReason"],
        "slotNote": slot_note(info, slots),
        "paused": bool(row["paused"]),
        "startedAt": row["started_at"],
        "endedAt": row["ended_at"],
        "source": row["source"],
    }


def active_supplements(conn, include_paused=True):
    rows = conn.execute("SELECT * FROM supplements WHERE ended_at IS NULL AND user_id = ? ORDER BY id",
                        (db.uid(),)).fetchall()
    items = [supplement_row(r) for r in rows]
    return items if include_paused else [s for s in items if not s["paused"]]


# 내 정보의 '먹고 있는 영양제'와 복용 관리 목록은 하나다. 둘 다에 있는 영양제(종합비타민·비타민D 등)는
# 복용 관리 목록이 기준이고, 복용 관리에 넣을 수 없는 보기(유산균·루테인 등)만 사용자 정보에 따로 저장한다.
SYNCED_SUPPLEMENTS = options.SUPPLEMENTS & set(ref.SUPPLEMENTS)


def extra_supplements(user):
    """사용자 정보에만 저장된 영양제(복용 관리에 넣을 수 없는 보기)."""
    return [c for c in user.get("currentSupplements", []) if c not in SYNCED_SUPPLEMENTS]


def current_supplements(user, conn):
    taking = [s["supplementId"] for s in active_supplements(conn) if s["supplementId"] in SYNCED_SUPPLEMENTS]
    return list(dict.fromkeys(taking)) + [c for c in extra_supplements(user) if c not in taking]


def sync_supplements(conn, wanted):
    """내 정보에서 고른 영양제에 맞춰 복용 관리 목록을 바꾼다. 뺀 것은 중단(기록은 남김), 새로 고른 것은 추가.
    약·질환과 부딪히는 영양제도 사용자가 먹고 있다고 했으므로 넣는다(경고는 추천·복용 관리 화면에서 보여 준다)."""
    active = {s["supplementId"]: s for s in active_supplements(conn)}
    for cid, s in active.items():
        if cid in SYNCED_SUPPLEMENTS and cid not in wanted:
            conn.execute("UPDATE supplements SET ended_at = ? WHERE id = ?", (db.today().isoformat(), s["id"]))
    for cid in wanted:
        if cid in SYNCED_SUPPLEMENTS and cid not in active:
            conn.execute(
                "INSERT INTO supplements (user_id, catalog_id, time_slots, started_at, source) VALUES (?, ?, ?, ?, 'manual')",
                (db.uid(), cid, json.dumps(default_slots(conn, cid)), db.today().isoformat()),
            )


# ---------- 1. 사용자·검진 알림 ----------

def checkup_notice(user, conn):
    year = db.today().year
    age = year - user["birthYear"]
    # 일반건강검진: 20세 이상, 2년 주기, 출생연도 짝·홀에 맞춰 대상 연도가 정해진다.
    # 예외 두 가지는 앱이 알 수 없어 사용자가 고른다. 비사무직 직장가입자는 매년 대상이고,
    # 전년도 미수검 추가 등록 등으로 공단 조회 결과가 다르면 그 해에 한해 공단 결과를 따른다.
    # 성·연령별 검사, 암검진, 확진검사는 checkup_schedule.py(공단 검진대상조회 안내문 기준)에서 계산한다.
    parity = age >= 20 and (user["birthYear"] % 2) == (year % 2)
    yearly = user.get("jobType") == "nonOffice"
    if user.get("confirmedTargetYear") == year:
        reason = "confirmed"
    elif yearly and age >= 20:
        reason = "nonOffice"
    else:
        reason = "parity" if parity else None
    is_target = reason is not None
    done = any(c["date"].startswith(str(year)) for c in confirmed_checkups(conn))
    if is_target and not done:
        next_year = year
    elif yearly:
        next_year = year + 1
    else:
        next_year = year + (2 if parity else 1)
    due = is_target and not done
    notes = []
    if done:
        notes.append(sched.S["notes"]["overLimit"])
    elif not is_target and age >= 20 and not any(c["date"].startswith(str(year - 1)) for c in confirmed_checkups(conn)):
        notes.append(sched.S["notes"]["missedLastYear"])
        if user.get("jobType") in ("office", "nonOffice"):
            notes.append(sched.S["notes"]["missedWorker"])
    if due:
        why = {"confirmed": " (공단 조회 결과)", "nonOffice": " (비사무직은 매년 대상)"}.get(reason, "")
        message = f"{year}년 국가건강검진 대상자입니다{why}. 아직 검진 기록이 없습니다. 연말 전에 받으십시오."
    elif is_target:
        message = f"{year}년 검진 결과가 등록되었습니다. 다음 검진은 {next_year}년입니다."
    else:
        message = f"다음 국가건강검진은 {next_year}년입니다."
    return {"age": age, "isTargetThisYear": is_target, "targetReason": reason, "nextCheckupYear": next_year,
            "checkupDue": due, "message": message,
            "checkupItems": sched.age_items(age, user.get("gender", "M")) if is_target else [],
            "cancerScreenings": sched.cancers(user, year),
            "confirmTest": sched.confirm_test(confirmed_checkups(conn), user.get("gender", "M"), db.today()),
            "notes": notes}


class UserUpdate(BaseModel):
    name: Optional[str] = None
    birthYear: Optional[int] = None
    gender: Optional[str] = None
    heightCm: Optional[float] = None  # 체질량지수 계산에 쓴다
    weightKg: Optional[float] = None  # 바꾸면 체중 측정 기록으로도 남긴다
    jobType: Optional[str] = None  # office·nonOffice·other
    confirmedTargetYear: Optional[int] = None  # 공단 조회에서 대상자로 나온 해. 0이면 지운다.
    # 암검진 대상 판정에 쓰는 값. 0이면 지운다.
    liverHighRisk: Optional[bool] = None  # B·C형 간염, 만성 간질환, 간경변
    packYears: Optional[float] = None  # 흡연 갑년(하루 갑 수 × 햇수)
    cancerSpecialCase: Optional[list[str]] = None  # 암 산정특례 중인 암(stomach 등)
    colonoscopyYear: Optional[int] = None  # 마지막 대장내시경 연도
    lifestyle: Optional[dict] = None
    medications: Optional[list[str]] = None
    currentSupplements: Optional[list[str]] = None
    conditions: Optional[list[str]] = None
    allergies: Optional[list[str]] = None
    customAllergies: Optional[list[str]] = None
    consent: Optional[dict] = None
    location: Optional[dict] = None
    # 사는 곳: {sido, sigungu, roadAddress, detailAddress, zipCode, lat, lng}. 좌표는 서버가 채운다.
    address: Optional[dict] = None


ADDRESS_FIELDS = ("sigungu", "roadAddress", "detailAddress", "zipCode")


def clean_address(a):
    """사는 곳 입력을 확인한다. 시·도는 목록에 있어야 하고, 나머지는 짧은 글자만 받는다."""
    if a.get("sido") not in regions.SIDO_CENTERS:
        raise HTTPException(422, "sido는 " + ", ".join(regions.SIDO_CENTERS) + " 중 하나입니다.")
    out = {"sido": a["sido"]}
    for key in ADDRESS_FIELDS:
        v = a.get(key)
        if v is not None and (not isinstance(v, str) or len(v) > 120):
            raise HTTPException(422, f"{key}는 120자 이하 글자입니다.")
        out[key] = (v or "").strip()
    try:
        lat, lng = float(a["lat"]), float(a["lng"])
        if 33 <= lat <= 39 and 124 <= lng <= 132:  # 한국 범위
            out["lat"], out["lng"] = lat, lng
    except (KeyError, TypeError, ValueError):
        pass
    return out


def locate(address):
    """검진기관 찾기 기준 좌표. 고른 주소의 좌표 → 도로명주소 → 시·군·구 → 시·도 대표 좌표 순."""
    if "lat" in address:
        return {"lat": address["lat"], "lng": address["lng"]}
    for query in (address["roadAddress"], f'{address["sido"]} {address["sigungu"]}'.strip()):
        found = public_api.geocode(query) if query and query != address["sido"] else None
        if found:
            return {"lat": found["lat"], "lng": found["lng"]}
    lat, lng = regions.SIDO_CENTERS[address["sido"]]
    return {"lat": lat, "lng": lng}


@app.get("/api/users/me")
def get_me():
    with db.connect() as conn:
        user = load_user(conn)
        checkups = confirmed_checkups(conn)
        return {
            **user,
            "currentSupplements": current_supplements(user, conn),
            **checkup_notice(user, conn),
            "lastCheckupDate": checkups[-1]["date"] if checkups else None,
            "isDemoData": True,
        }


@app.put("/api/users/me")
def update_me(body: UserUpdate):
    if body.gender and body.gender not in ("M", "F"):
        raise HTTPException(422, "gender는 M 또는 F입니다.")
    if body.jobType and body.jobType not in ("office", "nonOffice", "other"):
        raise HTTPException(422, "jobType은 office, nonOffice, other 중 하나입니다.")
    bad_cancer = [c for c in body.cancerSpecialCase or [] if c not in sched.CANCER_IDS]
    if bad_cancer:
        raise HTTPException(422, "cancerSpecialCase는 " + ", ".join(sched.CANCER_IDS) + " 중에서 고릅니다.")
    errors = options.check_codes(body.currentSupplements, options.SUPPLEMENTS, "영양제")
    errors += options.check_codes(body.conditions, options.CONDITIONS, "질환")
    errors += options.check_codes(body.allergies, options.ALLERGIES, "알레르기")
    lifestyle = None
    if body.lifestyle is not None:
        bad, lifestyle = options.check_lifestyle(body.lifestyle)
        errors += bad
    if errors:
        raise HTTPException(422, "보기에 없는 값입니다. " + " / ".join(errors))
    if body.heightCm is not None and not 100 <= body.heightCm <= 230:
        raise HTTPException(422, "키는 100~230cm 사이로 입력해 주십시오.")
    if body.weightKg is not None and not 20 <= body.weightKg <= 300:
        raise HTTPException(422, "몸무게는 20~300kg 사이로 입력해 주십시오.")
    address = clean_address(body.address) if body.address is not None else None
    # 보기에 없는 약은 '직접 입력'으로 저장하고, 상호작용 규칙이 없다고 알린다.
    unknown = [m for m in body.medications or [] if m not in ref.MEDICATIONS]
    with db.connect() as conn:
        user = load_user(conn)
        changes = body.model_dump(exclude_none=True)
        for key in ("confirmedTargetYear", "colonoscopyYear", "packYears"):
            if changes.get(key) == 0:
                changes[key] = None
        if lifestyle is not None:
            changes["lifestyle"] = {**user.get("lifestyle", {}), **lifestyle}
        if body.weightKg is not None and body.weightKg != user.get("weightKg"):
            conn.execute(
                "INSERT INTO measurements (user_id, type, measured_at, item_values, fasting, note) VALUES (?, 'weight', ?, ?, NULL, ?)",
                (db.uid(), datetime.now(KST).strftime("%Y-%m-%dT%H:%M"), json.dumps({"weightKg": body.weightKg}), "내 정보에서 입력"),
            )
        if address is not None:
            changes["address"] = address
            changes["location"] = locate(address)
        if body.currentSupplements is not None:
            sync_supplements(conn, body.currentSupplements)
            changes["currentSupplements"] = [c for c in body.currentSupplements if c not in SYNCED_SUPPLEMENTS]
        user.update(changes, onboarded=True)
        conn.execute("UPDATE users SET data = ? WHERE id = ?", (json.dumps(user, ensure_ascii=False), db.uid()))
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


DEFAULT_LOCATION = {"lat": 37.5665, "lng": 126.9780}  # 서울시청
BOOKING_URL = "https://www.nhis.or.kr"


def user_location():
    with db.connect() as conn:
        return load_user(conn).get("location") or DEFAULT_LOCATION


@app.get("/api/checkup-centers")
def checkup_centers(lat: Optional[float] = None, lng: Optional[float] = None, limit: int = 5):
    """건보공단 검진기관 API로 같은 시군구 기관을 찾는다. 키가 없거나 실패하면 가상 목록."""
    if lat is None or lng is None:
        loc = user_location()
        lat, lng = loc["lat"], loc["lng"]
    found = public_api.checkup_centers(lat, lng)
    if found:
        centers = [dict(c, tags=[t for t in [c["kind"], *c["exams"]] if t and t != "일반"], bookingUrl=BOOKING_URL,
                        isDemoData=False, source="nhis") for c in found]
    else:
        centers = [dict(c, tags=[], bookingUrl=BOOKING_URL, isDemoData=True, source="demo") for c in CENTERS]
    for c in centers:
        c["distanceKm"] = round(distance_km(lat, lng, c["lat"], c["lng"]), 2)
    return sorted(centers, key=lambda c: c["distanceKm"])[:limit]


@app.get("/api/checkup-centers/place")
def checkup_center_place(name: str, lat: float, lng: float):
    """검진기관 상세 화면용. 카카오 장소 검색으로 전화·카카오맵 링크를 더한다. 못 찾으면 found=False."""
    found = public_api.place(name, lat, lng)
    return dict(found or {}, found=bool(found), mapLink=f"https://map.kakao.com/link/map/{quote(name)},{lat},{lng}",
                routeLink=f"https://map.kakao.com/link/to/{quote(name)},{lat},{lng}")


@app.get("/api/config")
def client_config():
    """화면이 쓰는 공개 설정. 비밀 키는 넣지 않는다."""
    return {"kakaoJsKey": public_api.kakao_js_key()}


# 식약처 분류 번호 → 이 앱의 약 계열. 성분 이름이 보기와 겹치면 그쪽을 먼저 쓴다.
DRUG_CLASS_BY_CODE = {
    "214": "antihypertensive", "396": "antidiabetic", "333": "anticoagulant",
    "243": "thyroid", "232": "acid_suppressant", "113": "anticonvulsant",
}


def match_option(drug):
    """검색한 약이 입력 화면의 어느 보기에 해당하는지 추정한다(성분 이름 → 분류 번호 순)."""
    text = " ".join([drug.get("name") or "", *drug.get("ingredients", [])])
    for name, drug_class in ref.MEDICATIONS.items():
        if len(name) >= 3 and not name.startswith("기타") and name in text:
            return {"name": name, "drugClass": drug_class, "by": "ingredient"}
    if "스타틴" in text:
        return {"name": "스타틴", "drugClass": "statin", "by": "ingredient"}
    code = (re.match(r"\[(\d{3})\]", drug.get("className") or "") or [None, None])[1]
    drug_class = DRUG_CLASS_BY_CODE.get(code)
    if drug_class:
        # 같은 계열 보기가 여럿이면 '기타 …' 보기를 고른다(아마릴을 메트포르민으로 적지 않도록).
        names = [i["name"] for g in ref.PROFILE_OPTIONS["medicationGroups"] for i in g["items"]
                 if i["drugClass"] == drug_class]
        option = next((n for n in names if n.startswith("기타")), names[0] if names else None)
        return {"name": option, "drugClass": drug_class, "by": "class"}
    return None


@app.get("/api/drugs/search")
def search_drugs(q: str = Query(..., min_length=1), limit: int = Query(10, ge=1, le=30)):
    """약 이름 검색. 식약처 e약은요(쉬운 설명)와 DUR 품목(전문의약품·금기 종류)을 합친다.
    키가 없거나 실패하면 입력 화면의 약 보기에서 찾는다."""
    found = public_api.search_drugs(q.strip(), limit)
    if found is None:
        items = [{"itemSeq": None, "name": i["name"], "company": None, "kind": None, "className": None,
                  "ingredients": [], "durTypes": [], "guide": None,
                  "matchedOption": {"name": i["name"], "drugClass": i["drugClass"], "by": "option"}}
                 for g in ref.PROFILE_OPTIONS["medicationGroups"] for i in g["items"] if q.strip() in i["name"]]
        return {"source": "demo", "isDemoData": True, "items": items[:limit]}
    return {"source": "mfds", "isDemoData": False,
            "items": [dict(d, matchedOption=match_option(d)) for d in found]}


DEMO_ADDRESSES = [
    {"roadAddress": "서울특별시 중구 세종대로 110 (태평로1가)", "jibunAddress": "서울특별시 중구 태평로1가 31",
     "zipCode": "04524", "buildingName": "서울특별시청", "regionCode": "1114010300",
     "lat": 37.5665, "lng": 126.9780},
    {"roadAddress": "서울특별시 마포구 월드컵북로 400", "jibunAddress": "서울특별시 마포구 상암동 1601",
     "zipCode": "03925", "buildingName": None, "regionCode": "1144012700", "lat": 37.5794, "lng": 126.8895},
]


@app.get("/api/address/search")
def search_address(q: str = Query(..., min_length=2), limit: int = Query(10, ge=1, le=30)):
    """도로명주소 검색(행정안전부). 키가 없거나 실패하면 시연용 주소 두 개 중에서 찾는다."""
    found = public_api.search_address(q.strip(), limit)
    source = "juso"
    if found is None:
        found, source = public_api.search_address_kakao(q.strip(), limit), "kakao"
    if found is None:
        words = q.split()
        items = [a for a in DEMO_ADDRESSES if all(w in a["roadAddress"] + a["jibunAddress"] for w in words)]
        return {"source": "demo", "isDemoData": True, "items": items or DEMO_ADDRESSES}
    return {"source": source, "isDemoData": False, "items": found}


@app.get("/api/geocode")
def geocode(address: str = Query(..., min_length=2)):
    """주소를 좌표로(카카오 로컬). 키가 없거나 실패하면 시연용 주소면 그 좌표, 아니면 서울시청 좌표."""
    found = public_api.geocode(address.strip())
    if found:
        return {**found, "source": "kakao", "isDemoData": False}
    demo = next((a for a in DEMO_ADDRESSES if address.strip() in (a["roadAddress"], a["jibunAddress"])), None)
    point = demo or {"roadAddress": None, **DEFAULT_LOCATION}
    return {"address": point["roadAddress"], "lat": point["lat"], "lng": point["lng"],
            "source": "demo", "isDemoData": True}


# ---------- 2. 결과 연동(OCR) ----------

MAX_UPLOAD_FILES = 4  # 공단 결과통보서가 보통 4장이다.


@app.post("/api/checkups/upload")
async def upload_checkup(file: Optional[UploadFile] = File(None), files: Optional[list[UploadFile]] = File(None)):
    """결과지 PDF·사진에서 검진 수치를 읽는다. 파일 내용은 저장하지 않는다.

    한 번에 최대 4개(file 또는 files로). 여러 장이면 장마다 읽고 합친다. 같은 항목이 두 장에서 나오면
    더 확실하게 읽은 값을 쓴다.
    글자가 든 PDF는 글자를 바로 읽고, 사진·스캔 PDF는 무료 공개 OCR로 읽는다(app/ocr.py).
    OCR 모델이 설치되지 않은 서버에서는 예전처럼 견본 값을 돌려준다(engine: mock).
    """
    uploads = ([file] if file else []) + (files or [])
    if not uploads:
        raise HTTPException(422, "결과지 파일을 골라 주십시오.")
    if len(uploads) > MAX_UPLOAD_FILES:
        raise HTTPException(422, f"결과지는 한 번에 {MAX_UPLOAD_FILES}장까지 올릴 수 있습니다.")
    pages = []
    for up in uploads:
        content_type = up.content_type or ""
        name = up.filename or "upload"
        is_pdf = name.lower().endswith(".pdf") or content_type == "application/pdf"
        if not (content_type.startswith("image/") or is_pdf):
            raise HTTPException(415, f"{name}: PDF 또는 이미지 파일만 올릴 수 있습니다.")
        pages.append((name, is_pdf, await up.read()))
    source = "pdf" if all(is_pdf for _, is_pdf, _ in pages) else "photo"
    names_units = {code: (item["name"], item["unit"]) for code, item in ref.CHECKUP_ITEMS.items()}
    found, engines, dates = {}, [], []
    try:
        for name, is_pdf, data in pages:
            try:
                # 읽는 동안에도 다른 요청(Render 상태 확인 5초 제한)에 답하도록 별도 스레드에서 돌린다.
                page_found, engine, page_date = await run_in_threadpool(ocr.read_with_date, data, is_pdf, db.today())
            except ocr.OCRUnavailable:
                raise
            except Exception:
                raise HTTPException(422, f"{name}: 파일을 열지 못했습니다. 다른 사진이나 PDF로 다시 올려 주십시오.")
            engines.append(engine)
            if page_date:
                dates.append(page_date)
            for code, (value, score) in page_found.items():
                if code not in found or score > found[code][1]:
                    found[code] = (value, score)
        engine = "+".join(dict.fromkeys(engines))
    except ocr.OCRUnavailable:
        engine = "mock"
    name = ", ".join(n for n, _, _ in pages)
    if engine == "mock":
        found = {code: (v, 0.98) for code, v in db.CHECKUP_2026_SAMPLE.items()}
        message = "사진 인식 모델이 없는 서버라 견본 값을 보여 줍니다. 실제 결과지 값과 다릅니다."
    elif not found:
        raise HTTPException(422, "결과지에서 검진 수치를 찾지 못했습니다. 밝은 곳에서 표 전체가 반듯하게 나오도록 다시 찍거나 PDF를 올려 주십시오.")
    else:
        message = "인식한 수치를 확인해 주십시오. 틀린 값은 고친 뒤 확정하십시오."
    # 결과지에 적힌 검진일을 쓴다(변화 리포트가 날짜로 비교한다). 못 읽으면 올린 날.
    exam_date = min(dates) if dates else db.today()
    fields = ocr.fields(found, names_units)
    values = {f["code"]: f["value"] for f in fields}
    with db.connect() as conn:
        cur = conn.execute(
            "INSERT INTO checkups (user_id, date, source, status, file_name, item_values) VALUES (?, ?, ?, 'pending_review', ?, ?)",
            (db.uid(), exam_date.isoformat(), source, name, json.dumps(values)),
        )
        checkup = get_checkup(conn, cur.lastrowid)
    checkup["ocr"] = {
        "engine": engine,
        "fields": fields,
        "missing": [{"code": c, "name": n, "unit": u} for c, (n, u) in names_units.items() if c not in values],
        "message": message,
        "files": len(pages),
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
            "UPDATE checkups SET item_values = ?, date = ?, status = ? WHERE id = ? AND user_id = ?",
            (json.dumps(values), body.date or checkup["date"], "confirmed" if body.confirm else checkup["status"], checkup_id,
             db.uid()),
        )
    return get_checkup_detail(checkup_id)


@app.delete("/api/checkups/{checkup_id}")
def delete_checkup(checkup_id: int):
    with db.connect() as conn:
        get_checkup(conn, checkup_id)
        conn.execute("DELETE FROM checkups WHERE id = ? AND user_id = ?", (checkup_id, db.uid()))
    return {"deleted": checkup_id}


@app.get("/api/checkups")
def list_checkups():
    with db.connect() as conn:
        user = load_user(conn)
        rows = conn.execute("SELECT * FROM checkups WHERE user_id = ? ORDER BY date DESC, id DESC", (db.uid(),)).fetchall()
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
    active += [c for c in extra_supplements(user) if c in ref.SUPPLEMENTS and c not in active]
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
            return [supplement_row(r) for r in conn.execute("SELECT * FROM supplements WHERE user_id = ? ORDER BY id",
                                                                 (db.uid(),)).fetchall()]
        return active_supplements(conn)


@app.get("/api/supplements/check")
def check_supplements():
    """복용 중인 구성의 중복 성분과 약물 상호작용 점검."""
    with db.connect() as conn:
        user = load_user(conn)
        active = active_supplements(conn, include_paused=False)
    ids = [s["supplementId"] for s in active]
    # 입력 화면에서 '먹고 있다'고 고른 영양제(규칙표 밖의 칼슘·비타민K 등 포함)도 약과의 상호작용을 본다.
    taking = ids + [c for c in extra_supplements(user) if c not in ids]
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
        raise HTTPException(422, f"timeSlots는 {', '.join(TIME_SLOTS)} 중에서 고르십시오.")


@app.post("/api/supplements", status_code=201)
def add_supplement(body: SupplementCreate):
    if body.supplementId not in ref.SUPPLEMENTS:
        raise HTTPException(404, "목록에 없는 영양제입니다.")
    check_slots(body.timeSlots)
    with db.connect() as conn:
        if any(s["supplementId"] == body.supplementId for s in active_supplements(conn)):
            raise HTTPException(409, "이미 복용 중인 영양제입니다.")
        slots = body.timeSlots or default_slots(conn, body.supplementId)
        cur = conn.execute(
            "INSERT INTO supplements (user_id, catalog_id, time_slots, started_at, source) VALUES (?, ?, ?, ?, ?)",
            (db.uid(), body.supplementId, json.dumps(slots), db.today().isoformat(), body.source),
        )
        return supplement_row(conn.execute("SELECT * FROM supplements WHERE id = ?", (cur.lastrowid,)).fetchone())


def get_supplement_row(conn, sid):
    row = conn.execute("SELECT * FROM supplements WHERE id = ? AND user_id = ?", (sid, db.uid())).fetchone()
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
            """INSERT INTO intake_logs (user_id, date, time_slot, supplement_id, taken) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (date, time_slot, supplement_id) DO UPDATE SET taken = excluded.taken""",
            (db.uid(), day, body.timeSlot, body.supplementId, int(body.taken)),
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
            for r in conn.execute("SELECT * FROM intake_logs WHERE date = ? AND user_id = ?",
                                  (target.isoformat(), db.uid()))
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
    supplements = [supplement_row(r) for r in conn.execute("SELECT * FROM supplements WHERE user_id = ?", (db.uid(),)).fetchall()]
    rows = conn.execute(
        "SELECT * FROM intake_logs WHERE date BETWEEN ? AND ? AND user_id = ? ORDER BY date",
        (start.isoformat(), end.isoformat(), db.uid()),
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
                "SELECT * FROM supplements WHERE started_at <= ? AND (ended_at IS NULL OR ended_at >= ?) AND user_id = ?",
                (after["date"], before["date"], db.uid()),
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
    """체험 계정을 처음 상태(가상 인물 기록)로 되돌린다. 가입한 계정의 기록은 지우지 않는다."""
    with db.connect() as conn:
        if not conn.execute("SELECT is_guest FROM users WHERE id = ?", (db.uid(),)).fetchone()["is_guest"]:
            raise HTTPException(403, "시연 초기화는 체험 계정에서만 쓸 수 있습니다.")
        db.seed(conn, db.uid())
    return {"reset": True}


@app.get("/api/health")
def health():
    # 어떤 외부 키가 서버에 들어 있는지만 보인다(값은 내보내지 않는다).
    return {"ok": True, "publicApis": public_api.configured()}


# 마이데이터·복용 알림·중간 검사. 위의 도우미 함수를 쓰므로 맨 끝에서 붙인다.
from .features import router as features_router  # noqa: E402

app.include_router(features_router)


# 배포할 때는 빌드한 화면(frontend/dist)을 같은 주소에서 내보낸다. API 경로를 모두 붙인 뒤에 마운트해야 한다.
_frontend = os.environ.get("FRONTEND_DIST")
if _frontend and Path(_frontend).is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=_frontend, html=True), name="frontend")
