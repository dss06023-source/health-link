"""시연용 규칙표: 검진 항목 기준치, 영양제 목록, 추천 규칙, 약물 상호작용.

기준치는 국가건강검진 판정 기준을 참고해 정리한 시연용 값이다(원문 대조 전).
문구는 질병 판단을 하지 않고 '기준치 범위 안/밖' 사실만 말한다.
"""

NORMAL, CAUTION, DANGER = "normal", "caution", "danger"

# 판정 구간: (상한 미만이면 해당 상태) 순서대로 검사. direction="high"는 높을수록 나쁨.
CHECKUP_ITEMS = {
    "sbp": {
        "name": "수축기 혈압", "unit": "mmHg", "group": "혈압",
        "high": [(120, NORMAL), (140, CAUTION)], "normalRange": "120 미만",
        "about": "심장이 피를 내보낼 때 혈관에 걸리는 압력입니다.",
    },
    "dbp": {
        "name": "이완기 혈압", "unit": "mmHg", "group": "혈압",
        "high": [(80, NORMAL), (90, CAUTION)], "normalRange": "80 미만",
        "about": "심장이 쉬는 동안 혈관에 남아 있는 압력입니다.",
    },
    "fbs": {
        "name": "공복혈당", "unit": "mg/dL", "group": "혈당",
        "high": [(100, NORMAL), (126, CAUTION)], "normalRange": "100 미만",
        "about": "8시간 이상 굶은 뒤 잰 혈액 속 포도당 양입니다.",
    },
    "tc": {
        "name": "총콜레스테롤", "unit": "mg/dL", "group": "지질",
        "high": [(200, NORMAL), (240, CAUTION)], "normalRange": "200 미만",
        "about": "혈액 속 콜레스테롤을 모두 더한 양입니다.",
    },
    "ldl": {
        "name": "LDL 콜레스테롤", "unit": "mg/dL", "group": "지질",
        "high": [(130, NORMAL), (160, CAUTION)], "normalRange": "130 미만",
        "about": "혈관 벽에 쌓이기 쉬운 콜레스테롤입니다.",
    },
    "hdl": {
        "name": "HDL 콜레스테롤", "unit": "mg/dL", "group": "지질",
        "low": [(40, CAUTION)], "normalRange": "40 이상",
        "about": "혈관에서 콜레스테롤을 실어 나르는 콜레스테롤로, 높을수록 좋습니다.",
    },
    "tg": {
        "name": "중성지방", "unit": "mg/dL", "group": "지질",
        "high": [(150, NORMAL), (200, CAUTION)], "normalRange": "150 미만",
        "about": "몸에 저장되는 지방의 한 형태로, 식사·음주의 영향을 많이 받습니다.",
    },
    "ast": {
        "name": "AST", "unit": "U/L", "group": "간기능",
        "high": [(41, NORMAL), (51, CAUTION)], "normalRange": "40 이하",
        "about": "간·근육에 있는 효소로, 간세포가 손상되면 혈액에 늘어납니다.",
    },
    "alt": {
        "name": "ALT", "unit": "U/L", "group": "간기능",
        "high": [(36, NORMAL), (46, CAUTION)], "normalRange": "35 이하",
        "about": "주로 간에 있는 효소로, 간 상태를 볼 때 쓰는 대표 수치입니다.",
    },
    "ggt": {
        "name": "감마지티피(γ-GTP)", "unit": "U/L", "group": "간기능",
        "high": {"M": [(64, NORMAL), (78, CAUTION)], "F": [(36, NORMAL), (46, CAUTION)]},
        "normalRange": {"M": "63 이하", "F": "35 이하"},
        "about": "음주·약물의 영향을 잘 받는 간 효소입니다.",
    },
    "hb": {
        "name": "혈색소", "unit": "g/dL", "group": "빈혈",
        "low": {"M": [(12, DANGER), (13, CAUTION)], "F": [(10, DANGER), (12, CAUTION)]},
        "normalRange": {"M": "13 이상", "F": "12 이상"},
        "about": "산소를 나르는 적혈구 속 단백질의 양입니다.",
    },
    "bmi": {
        "name": "체질량지수(BMI)", "unit": "kg/m²", "group": "비만",
        "high": [(23, NORMAL), (25, CAUTION)], "low": [(18.5, CAUTION)],
        "normalRange": "18.5~22.9",
        "about": "몸무게(kg)를 키(m)의 제곱으로 나눈 값입니다.",
    },
}

STATUS_TEXT = {
    CAUTION: "기준치보다 조금 {word}. 생활습관 점검을 권합니다.",
    DANGER: "기준치보다 많이 {word}. 의사 상담을 권장합니다.",
}


def _by_gender(rule, gender):
    return rule.get(gender, rule["M"]) if isinstance(rule, dict) else rule


def judge(code, value, gender="M"):
    """수치 하나를 normal / caution / danger로 판정한다."""
    item = CHECKUP_ITEMS[code]
    low = item.get("low")
    if low:
        for limit, status in _by_gender(low, gender):
            if value < limit:
                return status
    high = item.get("high")
    if high:
        for limit, status in _by_gender(high, gender):
            if value < limit:
                return status
        return DANGER
    return NORMAL


def describe(code, value, gender="M"):
    """항목 하나를 화면에 바로 쓸 수 있는 형태로 만든다."""
    item = CHECKUP_ITEMS[code]
    status = judge(code, value, gender)
    direction = None
    if status != NORMAL:
        low = item.get("low")
        direction = "low" if low and value < max(l for l, _ in _by_gender(low, gender)) else "high"
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


# 영양제 목록. 기능성 문구는 식약처 고시형 원료의 인정 문구를 요약한 것(시연용).
SUPPLEMENTS = {
    "omega3": {
        "name": "오메가-3", "ingredients": {"EPA·DHA": "1000mg"},
        "dose": "1일 1회 1캡슐", "timeSlots": ["morning"], "timing": "아침 식후",
        "claim": "혈중 중성지질 개선·혈행 개선에 도움을 줄 수 있음",
    },
    "red_yeast_rice": {
        "name": "홍국", "ingredients": {"모나콜린K": "8mg"},
        "dose": "1일 1회 1정", "timeSlots": ["evening"], "timing": "저녁 식후",
        "claim": "혈중 콜레스테롤 개선에 도움을 줄 수 있음",
    },
    "banaba": {
        "name": "바나바잎 추출물", "ingredients": {"코로솔산": "1.3mg"},
        "dose": "1일 1회 1정", "timeSlots": ["morning"], "timing": "아침 식전",
        "claim": "식후 혈당상승 억제에 도움을 줄 수 있음",
    },
    "milk_thistle": {
        "name": "밀크씨슬", "ingredients": {"실리마린": "130mg"},
        "dose": "1일 1회 1정", "timeSlots": ["morning"], "timing": "아침 식후",
        "claim": "간 건강에 도움을 줄 수 있음",
    },
    "coq10": {
        "name": "코엔자임Q10", "ingredients": {"코엔자임Q10": "100mg"},
        "dose": "1일 1회 1캡슐", "timeSlots": ["morning"], "timing": "아침 식후",
        "claim": "높은 혈압 감소에 도움을 줄 수 있음",
    },
    "iron": {
        "name": "철분", "ingredients": {"철": "12mg"},
        "dose": "1일 1회 1정", "timeSlots": ["morning"], "timing": "아침 공복",
        "claim": "체내 산소운반과 혈액생성에 필요",
    },
    "vitamin_d": {
        "name": "비타민D", "ingredients": {"비타민D": "25μg"},
        "dose": "1일 1회 1정", "timeSlots": ["morning"], "timing": "아침 식후",
        "claim": "칼슘과 인이 흡수되고 이용되는데 필요, 뼈의 형성과 유지에 필요",
    },
    "garcinia": {
        "name": "가르시니아", "ingredients": {"HCA": "750mg"},
        "dose": "1일 2회 1정", "timeSlots": ["morning", "evening"], "timing": "식전",
        "claim": "탄수화물이 지방으로 합성되는 것을 억제하여 체지방 감소에 도움을 줄 수 있음",
    },
    "multivitamin": {
        "name": "종합비타민", "ingredients": {"비타민D": "10μg", "철": "8mg", "비타민C": "100mg", "비타민B군": "1일분"},
        "dose": "1일 1회 1정", "timeSlots": ["morning"], "timing": "아침 식후",
        "claim": "에너지 생성과 정상적인 면역기능에 필요",
    },
}

# 하루 섭취 상한(시연용 표본). 단위는 성분 표기와 같다.
UPPER_LIMITS = {"비타민D": 100, "철": 45}

# 추천 규칙: 검진 항목 상태 → 영양제. priority가 낮을수록 먼저 보여준다.
RECOMMENDATION_RULES = [
    {"supplement": "omega3", "items": ["tg"], "priority": 1},
    {"supplement": "red_yeast_rice", "items": ["ldl", "tc"], "priority": 2},
    {"supplement": "banaba", "items": ["fbs"], "priority": 1},
    {"supplement": "milk_thistle", "items": ["alt", "ast", "ggt"], "priority": 2},
    {"supplement": "coq10", "items": ["sbp", "dbp"], "priority": 2},
    {"supplement": "iron", "items": ["hb"], "direction": "low", "priority": 1},
    {"supplement": "garcinia", "items": ["bmi"], "direction": "high", "priority": 3},
]

# 생활습관 규칙
LIFESTYLE_RULES = [
    {"supplement": "vitamin_d", "field": "lowSunlight", "reason": "실내 생활이 길어 햇빛 노출이 적다고 답했습니다.", "priority": 3},
]

# 약물·상태와의 상호작용(시연용 표본, 출처 확인 필요).
# level: avoid(추천 제외) / caution(추천하되 경고)
INTERACTIONS = [
    {"supplement": "red_yeast_rice", "drugClass": "statin", "level": "avoid",
     "message": "홍국의 모나콜린K는 스타틴 계열 약과 작용이 같아 함께 먹으면 부작용 위험이 커질 수 있습니다. 추천에서 뺐습니다."},
    {"supplement": "omega3", "drugClass": "anticoagulant", "level": "caution",
     "message": "항응고·항혈소판제와 함께 먹으면 출혈 경향이 커질 수 있습니다. 의사·약사와 상담하세요."},
    {"supplement": "coq10", "drugClass": "anticoagulant", "level": "caution",
     "message": "와파린의 효과를 떨어뜨릴 수 있습니다. 의사·약사와 상담하세요."},
    {"supplement": "banaba", "drugClass": "antidiabetic", "level": "caution",
     "message": "혈당강하제와 함께 먹으면 혈당이 지나치게 떨어질 수 있습니다. 의사·약사와 상담하세요."},
    {"supplement": "iron", "drugClass": "thyroid", "level": "caution",
     "message": "갑상선 호르몬제의 흡수를 방해할 수 있어 4시간 이상 간격을 두세요."},
]

# 검진 상태에 따른 주의(약이 아니라 수치가 이유)
CONDITION_CAUTIONS = [
    {"supplement": "garcinia", "items": ["alt", "ast"], "level": "avoid",
     "message": "간 수치가 기준치 밖일 때는 가르시니아 섭취 전 의사 상담이 필요합니다. 추천에서 뺐습니다."},
]

# 시연용 약 목록: 이름 → 계열
MEDICATIONS = {
    "아토르바스타틴": "statin",
    "로수바스타틴": "statin",
    "와파린": "anticoagulant",
    "아스피린(저용량)": "anticoagulant",
    "메트포르민": "antidiabetic",
    "레보티록신": "thyroid",
    "암로디핀": "antihypertensive",
}

DISCLAIMER = (
    "이 추천은 검진 수치와 규칙표에 따른 참고 정보이며 진단이나 치료를 대신하지 않습니다. "
    "복용 중인 약이 있거나 주의 항목이 있으면 의사·약사와 상담하세요."
)
