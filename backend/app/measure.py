"""가정 측정(중간 검사) 기록을 검진 항목 코드로 풀어 주는 도우미."""

import json

from . import reference as ref

# 측정 종류 → 입력 필드와 허용 범위
MEASUREMENT_TYPES = {
    "bp": {"label": "혈압", "fields": {"sbp": (60, 250), "dbp": (30, 150)}},
    "glucose": {"label": "혈당", "fields": {"fbs": (30, 600)}},
    "weight": {"label": "체중", "fields": {"weightKg": (20, 300)}},
    "waist": {"label": "허리둘레", "fields": {"waist": (40, 200)}},
}

# 가정에서 잴 수 있고 검진 항목과 비교할 수 있는 코드
MEASURABLE_CODES = ["sbp", "dbp", "fbs", "bmi", "waist"]

NOTE = "가정 측정값은 측정 기기·시간·자세가 검진과 달라 참고용입니다. 영양제의 효과를 뜻하지 않습니다."


def row_to_dict(row, height_cm):
    values = json.loads(row["item_values"])
    return {
        "id": row["id"],
        "type": row["type"],
        "measuredAt": row["measured_at"],
        "values": values,
        "fasting": None if row["fasting"] is None else bool(row["fasting"]),
        "note": row["note"],
        "codes": to_codes(row["type"], values, row["fasting"], height_cm),
    }


def to_codes(kind, values, fasting, height_cm):
    """측정값을 검진 항목 코드 값으로 바꾼다. 식후 혈당은 공복혈당 기준과 비교하지 않는다."""
    if kind == "weight":
        if not height_cm:
            return {}
        return {"bmi": round(values["weightKg"] / (height_cm / 100) ** 2, 1)}
    if kind == "glucose" and not fasting:
        return {}
    return {k: v for k, v in values.items() if k in ref.CHECKUP_ITEMS}


def load(conn, height_cm, start=None, end=None, kind=None):
    """기간(날짜 문자열, 양끝 포함) 안의 측정 기록을 오래된 순으로."""
    sql, args = "SELECT * FROM measurements WHERE 1=1", []
    if start:
        sql += " AND substr(measured_at, 1, 10) >= ?"
        args.append(start)
    if end:
        sql += " AND substr(measured_at, 1, 10) <= ?"
        args.append(end)
    if kind:
        sql += " AND type = ?"
        args.append(kind)
    rows = conn.execute(sql + " ORDER BY measured_at, id", args).fetchall()
    return [row_to_dict(r, height_cm) for r in rows]


def series(measurements):
    """항목 코드별 [{date, value}] 묶음."""
    out = {code: [] for code in MEASURABLE_CODES}
    for m in measurements:
        for code, value in m["codes"].items():
            if code in out:
                out[code].append({"date": m["measuredAt"][:10], "value": value})
    return out
