"""추가 기능: 마이데이터 가상 연동, 시간대별 복용 알림, 중간 검사(가정 측정) 기록과 리포트.

main.py 맨 아래에서 이 라우터를 붙인다. main의 도우미 함수를 쓰므로 main이 먼저 정의된 뒤에 불러와야 한다.
"""

import json
import os
import re
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from . import db, measure
from . import reference as ref
from .logic import STATUS_RANK
from .main import (
    TIME_SLOTS, active_supplements, confirmed_checkups, get_checkup, intake_history,
    load_user, scheduled_on,
)

router = APIRouter()

SLOT_LABELS = {"morning": "아침", "lunch": "점심", "evening": "저녁", "bedtime": "자기 전"}
KST = ZoneInfo("Asia/Seoul")


def save_user(conn, user):
    conn.execute("UPDATE users SET data = ? WHERE id = 1", (json.dumps(user, ensure_ascii=False),))


# ---------- 마이데이터(가상) ----------

def mydata_state(user):
    state = {"connected": False, **user.get("mydata", {})}
    return {**state, "provider": db.MYDATA_PROVIDER, "isDemoData": True}


@router.get("/api/mydata")
def mydata_status():
    with db.connect() as conn:
        return mydata_state(load_user(conn))


class MydataConnect(BaseModel):
    agree: bool
    scopes: list[str] = ["checkups", "prescriptions"]


@router.post("/api/mydata/connect")
def mydata_connect(body: MydataConnect):
    """전송요구 동의(가상). 실제 인증·전송은 하지 않는다."""
    if not body.agree:
        raise HTTPException(422, "건강정보 전송에 동의해야 연동할 수 있습니다.")
    bad = [s for s in body.scopes if s not in ("checkups", "prescriptions")]
    if bad or not body.scopes:
        raise HTTPException(422, "scopes는 checkups, prescriptions 중에서 고르십시오.")
    with db.connect() as conn:
        user = load_user(conn)
        user["mydata"] = {
            "connected": True,
            "scopes": body.scopes,
            "connectedAt": db.today().isoformat(),
            "lastSyncAt": None,
        }
        save_user(conn, user)
        return mydata_state(user)


@router.delete("/api/mydata/connect")
def mydata_disconnect():
    """연동 해제. 이미 가져온 기록은 남는다."""
    with db.connect() as conn:
        user = load_user(conn)
        user["mydata"] = {"connected": False}
        save_user(conn, user)
        return mydata_state(user)


class MydataSync(BaseModel):
    applyMedications: bool = False


@router.post("/api/mydata/sync")
def mydata_sync(body: MydataSync = MydataSync()):
    """가상 기록을 가져온다. 같은 날짜 검진은 건너뛰고, 처방 약은 applyMedications일 때만 복용 약에 추가한다."""
    with db.connect() as conn:
        user = load_user(conn)
        state = user.get("mydata", {})
        if not state.get("connected"):
            raise HTTPException(409, "먼저 마이데이터 연동에 동의해 주십시오.")
        imported, skipped, prescriptions = [], [], []
        if "checkups" in state["scopes"]:
            existing = {c["date"] for c in confirmed_checkups(conn)}
            for record in db.MYDATA_CHECKUPS:
                if record["date"] in existing:
                    skipped.append({"date": record["date"], "reason": "이미 등록된 검진입니다."})
                    continue
                cur = conn.execute(
                    "INSERT INTO checkups (date, source, status, file_name, item_values) VALUES (?, 'mydata', 'confirmed', ?, ?)",
                    (record["date"], f"마이데이터 · {record['institution']}", json.dumps(record["values"])),
                )
                imported.append({"id": cur.lastrowid, "date": record["date"], "institution": record["institution"]})
        if "prescriptions" in state["scopes"]:
            meds = user.get("medications", [])
            for p in db.MYDATA_PRESCRIPTIONS:
                registered = p["name"] in meds
                if body.applyMedications and not registered:
                    meds.append(p["name"])
                prescriptions.append({**p, "drugClass": ref.MEDICATIONS.get(p["name"]), "alreadyRegistered": registered})
            user["medications"] = meds
        state["lastSyncAt"] = db.today().isoformat()
        user["mydata"] = state
        save_user(conn, user)
    new_meds = [p["name"] for p in prescriptions if not p["alreadyRegistered"]]
    message = f"검진 {len(imported)}건을 가져왔습니다."
    if new_meds:
        message += (
            f" 복용 약 목록에 추가: {', '.join(new_meds)}." if body.applyMedications
            else f" 처방 기록에 복용 약 목록에 없는 약이 있습니다({', '.join(new_meds)}). 추가하면 추천 경고에 반영됩니다."
        )
    return {
        **mydata_state(user),
        "importedCheckups": imported,
        "skippedCheckups": skipped,
        "prescriptions": prescriptions,
        "medications": user.get("medications", []),
        "message": message,
    }


# ---------- 복용 알림 ----------

def now_kst(at):
    if at:
        try:
            return datetime.fromisoformat(at).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(422, "at은 YYYY-MM-DDTHH:MM 형식입니다.")
    override = os.environ.get("DEMO_NOW")
    if override:
        return datetime.fromisoformat(override)
    now = datetime.now(KST).replace(tzinfo=None)
    # DEMO_TODAY로 날짜를 고정한 시연에서는 시각만 실제 시각을 쓴다.
    return datetime.combine(db.today(), now.time()).replace(second=0, microsecond=0)


def reminder_settings(user):
    base = db.DEMO_USER["reminders"]
    saved = user.get("reminders", {})
    return {
        "enabled": saved.get("enabled", base["enabled"]),
        "times": {**base["times"], **saved.get("times", {})},
        "snoozed": saved.get("snoozed", {}),
    }


@router.get("/api/reminders/settings")
def get_reminder_settings():
    with db.connect() as conn:
        settings = reminder_settings(load_user(conn))
    settings.pop("snoozed")
    return settings


class ReminderSettings(BaseModel):
    enabled: Optional[bool] = None
    times: Optional[dict[str, str]] = None


@router.put("/api/reminders/settings")
def put_reminder_settings(body: ReminderSettings):
    for slot, value in (body.times or {}).items():
        if slot not in TIME_SLOTS:
            raise HTTPException(422, f"시간대는 {', '.join(TIME_SLOTS)} 중에서 고르십시오.")
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
            raise HTTPException(422, "알림 시각은 HH:MM(24시간) 형식입니다.")
    with db.connect() as conn:
        user = load_user(conn)
        settings = reminder_settings(user)
        if body.enabled is not None:
            settings["enabled"] = body.enabled
        settings["times"].update(body.times or {})
        user["reminders"] = settings
        save_user(conn, user)
    return get_reminder_settings()


@router.get("/api/reminders/due")
def due_reminders(at: Optional[str] = None):
    """지금(또는 at 시각) 보내야 할 복용 알림. 화면은 1분마다 불러 알림을 띄우면 된다."""
    now = now_kst(at)
    day = now.date()
    with db.connect() as conn:
        settings = reminder_settings(load_user(conn))
        supplements = active_supplements(conn)
        taken = {
            (r["supplement_id"], r["time_slot"])
            for r in conn.execute("SELECT * FROM intake_logs WHERE date = ? AND taken = 1", (day.isoformat(),))
        }
    by_slot = {}
    for s, slot in scheduled_on(supplements, day):
        if (s["id"], slot) not in taken:
            by_slot.setdefault(slot, []).append({"supplementId": s["id"], "name": s["name"]})
    due, upcoming = [], []
    for slot in TIME_SLOTS:
        if slot not in by_slot:
            continue
        hh, mm = map(int, settings["times"][slot].split(":"))
        slot_at = datetime.combine(day, datetime.min.time()).replace(hour=hh, minute=mm)
        items = by_slot[slot]
        names = ", ".join(i["name"] for i in items[:2]) + (f" 외 {len(items) - 2}개" if len(items) > 2 else "")
        entry = {"timeSlot": slot, "label": SLOT_LABELS[slot], "time": settings["times"][slot], "items": items}
        snoozed_until = settings["snoozed"].get(f"{day.isoformat()}:{slot}")
        if slot_at <= now and not (snoozed_until and now < datetime.fromisoformat(snoozed_until)):
            due.append({
                **entry,
                "overdueMinutes": int((now - slot_at).total_seconds() // 60),
                "message": f"{SLOT_LABELS[slot]} 복용 시간입니다: {names}",
            })
        elif slot_at > now:
            upcoming.append(entry)
    return {
        "now": now.isoformat(timespec="minutes"),
        "enabled": settings["enabled"],
        "due": due if settings["enabled"] else [],
        "next": upcoming[0] if upcoming and settings["enabled"] else None,
    }


class Snooze(BaseModel):
    timeSlot: str
    minutes: int = 30
    at: Optional[str] = None


@router.post("/api/reminders/snooze")
def snooze_reminder(body: Snooze):
    """알림 미루기. 기본 30분."""
    if body.timeSlot not in TIME_SLOTS:
        raise HTTPException(422, f"시간대는 {', '.join(TIME_SLOTS)} 중에서 고르십시오.")
    if not 5 <= body.minutes <= 240:
        raise HTTPException(422, "미루기는 5분에서 240분 사이로 정하십시오.")
    now = now_kst(body.at)
    until = now + timedelta(minutes=body.minutes)
    with db.connect() as conn:
        user = load_user(conn)
        settings = reminder_settings(user)
        today = now.date().isoformat()
        # 지난 날짜의 미루기 기록은 정리한다.
        settings["snoozed"] = {k: v for k, v in settings["snoozed"].items() if k.startswith(today)}
        settings["snoozed"][f"{today}:{body.timeSlot}"] = until.isoformat(timespec="minutes")
        user["reminders"] = settings
        save_user(conn, user)
    return {"timeSlot": body.timeSlot, "snoozedUntil": until.isoformat(timespec="minutes")}


# ---------- 중간 검사(가정 측정) ----------

class MeasurementIn(BaseModel):
    type: str
    values: dict[str, float]
    measuredAt: Optional[str] = None
    fasting: Optional[bool] = None
    note: Optional[str] = None


@router.get("/api/measurements/types")
def measurement_types():
    return [
        {"type": k, "label": v["label"], "fields": {f: {"min": lo, "max": hi} for f, (lo, hi) in v["fields"].items()}}
        for k, v in measure.MEASUREMENT_TYPES.items()
    ]


@router.post("/api/measurements", status_code=201)
def add_measurement(body: MeasurementIn):
    spec = measure.MEASUREMENT_TYPES.get(body.type)
    if not spec:
        raise HTTPException(422, f"type은 {', '.join(measure.MEASUREMENT_TYPES)} 중에서 고르십시오.")
    if set(body.values) != set(spec["fields"]):
        raise HTTPException(422, f"{spec['label']}은(는) {', '.join(spec['fields'])} 값을 입력하십시오.")
    for field, (lo, hi) in spec["fields"].items():
        if not lo <= body.values[field] <= hi:
            raise HTTPException(422, f"{field} 값은 {lo}~{hi} 사이여야 합니다.")
    if body.type == "glucose" and body.fasting is None:
        raise HTTPException(422, "혈당은 공복 여부(fasting)를 함께 입력하십시오.")
    measured_at = body.measuredAt or now_kst(None).isoformat(timespec="minutes")
    try:
        datetime.fromisoformat(measured_at)
    except ValueError:
        raise HTTPException(422, "measuredAt은 YYYY-MM-DDTHH:MM 형식입니다.")
    fasting = None if body.type != "glucose" else int(body.fasting)
    with db.connect() as conn:
        cur = conn.execute(
            "INSERT INTO measurements (type, measured_at, item_values, fasting, note) VALUES (?, ?, ?, ?, ?)",
            (body.type, measured_at, json.dumps(body.values), fasting, body.note),
        )
        row = conn.execute("SELECT * FROM measurements WHERE id = ?", (cur.lastrowid,)).fetchone()
        user = load_user(conn)
    result = measure.row_to_dict(row, user.get("heightCm"))
    result["judged"] = [ref.describe(code, v, user["gender"]) for code, v in result["codes"].items()]
    return result


@router.get("/api/measurements")
def list_measurements(
    from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = None, type: Optional[str] = None,
):
    with db.connect() as conn:
        user = load_user(conn)
        return measure.load(conn, user.get("heightCm"), from_, to, type)


@router.delete("/api/measurements/{mid}")
def delete_measurement(mid: int):
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM measurements WHERE id = ?", (mid,)).fetchone():
            raise HTTPException(404, "측정 기록을 찾을 수 없습니다.")
        conn.execute("DELETE FROM measurements WHERE id = ?", (mid,))
    return {"deleted": mid}


def trend_between(code, before, after, gender):
    b, a = ref.describe(code, before, gender), ref.describe(code, after, gender)
    rank_change = STATUS_RANK[a["status"]] - STATUS_RANK[b["status"]]
    diff = round(after - before, 1)
    if rank_change:
        return ("improved" if rank_change < 0 else "worsened"), b, a, diff
    if b["status"] != ref.NORMAL and diff:
        toward = diff < 0 if b["direction"] == "high" else diff > 0
        return ("improved" if toward else "worsened"), b, a, diff
    return "same", b, a, diff


@router.get("/api/reports/interim")
def interim_report(baselineId: Optional[int] = None, days: int = 30):
    """다음 검진 전 중간 점검: 기준 검진 이후 가정 측정의 최근 평균을 검진 값과 비교한다."""
    with db.connect() as conn:
        user = load_user(conn)
        if baselineId is not None:
            baseline = get_checkup(conn, baselineId)
        else:
            checkups = confirmed_checkups(conn)
            if not checkups:
                raise HTTPException(404, "기준이 될 확정된 검진 결과가 없습니다.")
            baseline = checkups[-1]
        today = db.today()
        records = measure.load(conn, user.get("heightCm"), start=baseline["date"])
        intake = intake_history(conn, date.fromisoformat(baseline["date"]), today)
    window_start = (today - timedelta(days=days - 1)).isoformat()
    items = []
    for code, points in measure.series(records).items():
        recent = [p["value"] for p in points if p["date"] >= window_start] or [p["value"] for p in points[-3:]]
        entry = {
            "code": code, "name": ref.CHECKUP_ITEMS[code]["name"], "unit": ref.CHECKUP_ITEMS[code]["unit"],
            "checkupValue": baseline["values"].get(code), "count": len(points), "points": points,
            "recentAverage": None, "recentStatus": None, "trend": None, "change": None,
        }
        if recent:
            avg = round(sum(recent) / len(recent), 1)
            entry["recentAverage"] = avg
            entry["recentStatus"] = ref.judge(code, avg, user["gender"])
            if entry["checkupValue"] is not None:
                entry["trend"], _, _, entry["change"] = trend_between(code, entry["checkupValue"], avg, user["gender"])
        items.append(entry)
    measured = [i for i in items if i["count"]]
    counts = {t: sum(1 for i in measured if i["trend"] == t) for t in ("improved", "same", "worsened")}
    if measured:
        headline = f"검진 이후 가정 측정 {len(records)}건. 기준치에 가까워진 항목 {counts['improved']}개, 멀어진 항목 {counts['worsened']}개입니다."
    else:
        headline = "검진 이후 가정 측정 기록이 없습니다. 혈압·혈당·체중을 재서 입력하면 다음 검진 전에 변화를 볼 수 있습니다."
    return {
        "baseline": {"id": baseline["id"], "date": baseline["date"]},
        "windowDays": days,
        "items": items,
        "summary": {**counts, "measurementCount": len(records), "headline": headline},
        "adherence": {"rate": intake["rate"], "recordedFrom": intake["recordedFrom"]},
        "note": measure.NOTE,
    }
