"""국가건강검진 대상 판정: 일반검진, 성·연령별 검사, 암검진, 확진검사.

기준은 seed/checkup_schedule.json(국민건강보험공단 검진대상조회 안내문)에 있다. 프론트(frontend/src/data/rules.ts)가 같은 파일 사본으로
같은 규칙을 계산하므로, 규칙을 바꾸면 두 곳을 함께 고친다. 나이는 검진연도 - 출생연도(연 나이)다.
"""

import json
from datetime import date
from pathlib import Path

from . import reference as ref

S = json.loads((Path(__file__).parent / "seed" / "checkup_schedule.json").read_text(encoding="utf-8"))
CANCER_IDS = [c["id"] for c in S["cancers"]]


def _age_hit(rule, age, sex):
    if rule.get("sex") and rule["sex"] != sex:
        return False
    if "ages" in rule:
        return age in rule["ages"]
    if "bands" in rule:
        return any(lo <= age <= hi for lo, hi in rule["bands"])
    return age >= rule["from"] and age <= rule.get("to", 200) and (age - rule["from"]) % rule["every"] == 0


def age_items(age, sex):
    """올해 일반검진에 더해지는 성·연령별 검사."""
    out = []
    for r in S["ageItems"]:
        if not _age_hit(r, age, sex):
            continue
        # 연령대에 1회인 검사(우울증 35~39세, 40~70대 10년마다)는 해당 연령대를 알려 준다.
        band = next((f"{lo}~{hi}세 중 1회" for lo, hi in r.get("bands", []) if lo <= age <= hi), None)
        note = band or r.get("note")
        out.append({"id": r["id"], "name": r["name"], **({"note": note} if note else {})})
    return out


def cancers(user, year):
    birth, sex = user["birthYear"], user.get("gender", "M")
    age = year - birth
    parity = birth % 2 == year % 2 or user.get("confirmedTargetYear") == year
    special = set(user.get("cancerSpecialCase") or [])
    colonoscopy = user.get("colonoscopyYear")
    smoking = (user.get("lifestyle") or {}).get("smoking")
    pack_years = user.get("packYears") or 0
    out = []
    for c in S["cancers"]:
        if c.get("sex") and c["sex"] != sex:
            continue
        if age > c.get("maxAge", 200):
            continue
        if age < c["minAge"]:
            continue
        item = {"id": c["id"], "name": c["name"], "test": c["test"]}
        if c["id"] in special:
            item.update(status="excluded", note="암 산정특례자는 해당 암검진에서 빠집니다. 원하면 추가등록할 수 있습니다.")
        elif colonoscopy and c.get("colonoscopyExcludeYears") and year - colonoscopy < c["colonoscopyExcludeYears"]:
            item.update(status="excluded", note=f"{colonoscopy}년 대장내시경 뒤 5년이 지나지 않아 빠집니다. 원하면 추가등록할 수 있습니다.")
        elif c.get("highRisk") == "liver" and not user.get("liverHighRisk"):
            item.update(status="highRiskOnly", note=f"고위험군만 대상: {c['highRiskText']}")
        elif c.get("highRisk") == "lung" and not (pack_years >= c["packYears"] and smoking in (True, "current", "past")):
            item.update(status="highRiskOnly", note=f"고위험군만 대상: {c['highRiskText']}")
        elif c.get("highRisk") == "lung" and smoking == "past":
            item.update(status="maybe", note="담배를 끊었다면 30갑년 이상으로 폐암검진을 받은 적이 있고 끊은 지 15년 이내일 때만 대상입니다.")
        elif c["cycle"] == "biennial" and not parity:
            item.update(status="notThisYear", nextYear=year + 1)
        else:
            item.update(status="target", note="상·하반기 각 1회" if c["cycle"] == "halfYearly" else None)
        out.append({k: v for k, v in item.items() if v is not None})
    return out


def confirm_test(checkups, gender, today):
    """가장 최근 검진에서 고혈압·당뇨병 질환의심이면 다음 해 3월 31일까지 확진검사 1회 무료."""
    if not checkups:
        return None
    last = checkups[-1]
    y = int(last["date"][:4])
    deadline = date(y + 1, 3, 31)
    if today > deadline:
        return None
    values = last["values"]
    hit = [t["name"] for t in S["confirmTest"]["targets"]
           if any(values.get(code) is not None and ref.judge(code, values[code], gender) == ref.DANGER for code in t["codes"])]
    if not hit:
        return None
    return {"diseases": hit, "deadline": deadline.isoformat(), "where": S["confirmTest"]["where"],
            "message": f"{last['date']} 검진에서 {'·'.join(hit)} 질환의심이 나와 {deadline.year}년 3월 31일까지 확진검사를 1회 무료로 받을 수 있습니다."}
