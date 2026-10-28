"""시연용 규칙표: 검진 항목 기준치, 영양제 목록, 추천 규칙, 약물 상호작용.

내용은 seed/ 폴더의 JSON 세 개에 있고, 이 파일은 그것을 읽어 판정 함수와 함께 내보낸다.
- seed/checkup_criteria.json: 국가건강검진 판정 기준(건강검진 실시기준 별표 4, 2026-10-28 대조)
- seed/supplements.json: 영양제 목록과 고시형 원료 1일 섭취량·주의사항(출처·검증 상태 포함)
- seed/intake_rules.json: 추천·제외·주의·상한·복용 간격 규칙
문구는 질병 판단을 하지 않고 '기준치 범위 안/밖' 사실만 말한다.
"""

import json
from pathlib import Path

NORMAL, CAUTION, DANGER = "normal", "caution", "danger"

SEED_DIR = Path(__file__).parent / "seed"


def _load(name):
    return json.loads((SEED_DIR / name).read_text(encoding="utf-8"))


_criteria = _load("checkup_criteria.json")
_supplements = _load("supplements.json")
_rules = _load("intake_rules.json")

# 판정 구간: low/high를 위에서부터 차례로 검사한다(seed/checkup_criteria.json 참고).
CHECKUP_ITEMS = _criteria["items"]

STATUS_TEXT = {
    CAUTION: "기준치보다 조금 {word}. 생활습관 점검을 권합니다.",
    DANGER: "기준치보다 많이 {word}. 의사 상담을 권장합니다.",
}


def _by_gender(rule, gender):
    return rule.get(gender, rule["M"]) if isinstance(rule, dict) else rule


def _within(band, value):
    """판정 구간 한 줄에 값이 들어가는지. 경계값이 없는 줄은 나머지 전부."""
    if "lt" in band:
        return value < band["lt"]
    if "le" in band:
        return value <= band["le"]
    return True


def judge(code, value, gender="M"):
    """수치 하나를 normal / caution / danger로 판정한다."""
    item = CHECKUP_ITEMS[code]
    low = item.get("low")
    if low:
        for band in _by_gender(low, gender):
            if _within(band, value):
                return band["status"]
    high = item.get("high")
    if high:
        for band in _by_gender(high, gender):
            if _within(band, value):
                return band["status"]
        return DANGER
    return NORMAL


def describe(code, value, gender="M"):
    """항목 하나를 화면에 바로 쓸 수 있는 형태로 만든다."""
    item = CHECKUP_ITEMS[code]
    status = judge(code, value, gender)
    direction = None
    if status != NORMAL:
        low = item.get("low")
        low_edge = max((b["lt"] for b in _by_gender(low, gender)), default=None) if low else None
        direction = "low" if low_edge is not None and value < low_edge else "high"
    if status == NORMAL:
        verdict = "기준치 범위 안입니다."
    else:
        verdict = STATUS_TEXT[status].format(word="높습니다" if direction == "high" else "낮습니다")
    explanation = f"{item['about']} {verdict}"
    return {
        "code": code,
        "name": item["name"],
        "group": item["group"],
        "value": value,
        "unit": item["unit"],
        "normalRange": _by_gender(item["normalRange"], gender) if isinstance(item["normalRange"], dict) else item["normalRange"],
        "status": status,
        "direction": direction,
        "explanation": explanation,
        "consultDoctor": status == DANGER,
    }


# 영양제 목록(API로 내보내는 필드만). 출처·검증 상태는 SUPPLEMENT_META에 따로 둔다.
SUPPLEMENTS = {cid: {k: v for k, v in info.items() if k != "meta"} for cid, info in _supplements["items"].items()}
SUPPLEMENT_META = {cid: info.get("meta", {}) for cid, info in _supplements["items"].items()}

# 하루 섭취 상한. 영양소 상한(한국인 영양소 섭취기준)에 고시형 원료의 1일 섭취량 최대치를 더한다.
UPPER_LIMITS = {name: v["amount"] for name, v in _rules["upperLimits"]["values"].items()}
for _info in SUPPLEMENTS.values():
    _intake = _info.get("dailyIntake")
    if _intake and _intake["ingredient"] not in UPPER_LIMITS:
        UPPER_LIMITS[_intake["ingredient"]] = _intake["max"]

RECOMMENDATION_RULES = _rules["recommendations"]
NO_SUPPLEMENT_RULES = _rules["noSupplement"]
LIFESTYLE_RULES = _rules["lifestyle"]
# level: avoid(추천 제외) / caution(추천하되 경고)
INTERACTIONS = _rules["interactions"]
CONDITION_CAUTIONS = _rules["conditionCautions"]
LIFE_STAGE_LABELS = _rules["lifeStage"]["labels"]
NOT_TOGETHER = _rules["notTogether"]
SPACING_RULES = _rules["spacing"]
MEDICATIONS = _rules["medications"]
DISCLAIMER = _rules["disclaimer"]
