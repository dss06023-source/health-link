"""개인정보 입력 보기(seed/profile_options.json)와 그 값 검사.

보기에 있는 값만 받고, 약과 알레르기는 '직접 입력'도 받는다.
규칙(intake_rules.json)이 있는 보기인지는 rules 값으로 알려 준다. 규칙이 없는 보기는 저장만 한다.
"""

from . import reference as ref

OPTIONS = ref.PROFILE_OPTIONS
RULE_CLASSES = {r["drugClass"] for r in ref.INTERACTIONS} | {
    t.partition(":")[2] for r in ref.SPACING_RULES for t in (r["a"], r["b"]) if t.startswith("drug:")
}
LIFESTYLE = {f["key"]: f for f in OPTIONS["lifestyle"]}
CONDITIONS = {o["value"] for o in OPTIONS["conditions"]}
ALLERGIES = {o["value"] for o in OPTIONS["allergies"]}
SUPPLEMENTS = {o["id"] for o in OPTIONS["supplements"]}
# 예전 값(흡연 여부 true/false)도 받는다.
SMOKING_LEGACY = {True: "current", False: "never"}


def catalog():
    return {
        "medicationGroups": [
            {**g, "items": [{**i, "rules": i["drugClass"] in RULE_CLASSES} for i in g["items"]]}
            for g in OPTIONS["medicationGroups"]
        ],
        "supplements": [{**s, "rules": s["id"] in ref.SUPPLEMENTS} for s in OPTIONS["supplements"]],
        "lifestyle": OPTIONS["lifestyle"],
        "conditions": [{**c, "rules": False} for c in OPTIONS["conditions"]],
        "allergies": OPTIONS["allergies"],
        "conditionNote": OPTIONS["conditionNote"],
        "customAllowed": ["medications", "allergies"],
    }


def check_lifestyle(lifestyle):
    """잘못된 값의 설명 목록과 정리한 생활습관을 돌려준다. 모르는 키는 버리지 않고 그대로 둔다."""
    errors, out = [], dict(lifestyle)
    if isinstance(out.get("smoking"), bool):
        out["smoking"] = SMOKING_LEGACY[out["smoking"]]
    for key, value in out.items():
        field = LIFESTYLE.get(key)
        if not field or value is None:
            continue
        kind = field["type"]
        if kind == "choice" and value not in {o["value"] for o in field["options"]}:
            errors.append(f"{field['label']}: {value}")
        elif kind == "multi" and (not isinstance(value, list) or set(value) - {o["value"] for o in field["options"]}):
            errors.append(f"{field['label']}: {value}")
        elif kind == "boolean" and not isinstance(value, bool):
            errors.append(f"{field['label']}: {value}")
        elif kind == "number" and (isinstance(value, bool) or not isinstance(value, (int, float))
                                   or not field["min"] <= value <= field["max"]):
            errors.append(f"{field['label']}: {value} ({field['min']}~{field['max']})")
    return errors, out


def check_codes(values, allowed, label):
    bad = [v for v in values or [] if v not in allowed]
    return [f"{label}: {', '.join(bad)}"] if bad else []
