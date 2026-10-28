"""규칙표가 국가건강검진 판정 기준(건강검진 실시기준 별표 4)과 맞는지, 영양제 시드가 고시 섭취량 안에 있는지 본다."""
import re

import pytest

from app import logic
from app import reference as ref

N, C, D = ref.NORMAL, ref.CAUTION, ref.DANGER

# (항목, 성별, 값, 기대 판정): 별표 4의 경계값 양쪽
OFFICIAL_BOUNDARIES = [
    ("sbp", "M", 119, N), ("sbp", "M", 120, C), ("sbp", "M", 139, C), ("sbp", "M", 140, D),
    ("dbp", "M", 79, N), ("dbp", "M", 80, C), ("dbp", "M", 89, C), ("dbp", "M", 90, D),
    ("fbs", "M", 99, N), ("fbs", "M", 100, C), ("fbs", "M", 125, C), ("fbs", "M", 126, D),
    ("tc", "M", 199, N), ("tc", "M", 200, C), ("tc", "M", 239, C), ("tc", "M", 240, D),
    ("hdl", "M", 60, N), ("hdl", "M", 59, C), ("hdl", "M", 40, C), ("hdl", "M", 39, D),
    ("tg", "M", 149, N), ("tg", "M", 150, C), ("tg", "M", 199, C), ("tg", "M", 200, D),
    ("ldl", "M", 129, N), ("ldl", "M", 130, C), ("ldl", "M", 159, C), ("ldl", "M", 160, D),
    ("ast", "M", 40, N), ("ast", "M", 41, C), ("ast", "M", 50, C), ("ast", "M", 51, D),
    ("alt", "M", 35, N), ("alt", "M", 36, C), ("alt", "M", 45, C), ("alt", "M", 46, D),
    ("ggt", "M", 63, N), ("ggt", "M", 64, C), ("ggt", "M", 77, C), ("ggt", "M", 78, D),
    ("ggt", "F", 35, N), ("ggt", "F", 36, C), ("ggt", "F", 45, C), ("ggt", "F", 46, D),
    ("hb", "M", 13.0, N), ("hb", "M", 12.9, C), ("hb", "M", 12.0, C), ("hb", "M", 11.9, D), ("hb", "M", 16.5, N),
    ("hb", "F", 12.0, N), ("hb", "F", 11.9, C), ("hb", "F", 10.0, C), ("hb", "F", 9.9, D), ("hb", "F", 15.5, N),
    ("bmi", "M", 18.4, D), ("bmi", "M", 18.5, N), ("bmi", "M", 24.9, N), ("bmi", "M", 25.0, C),
    ("bmi", "M", 29.9, C), ("bmi", "M", 30.0, D),
    ("waist", "M", 89, N), ("waist", "M", 90, D), ("waist", "F", 84, N), ("waist", "F", 85, D),
    ("creatinine", "M", 1.5, N), ("creatinine", "M", 1.6, D),
    ("egfr", "M", 60, N), ("egfr", "M", 59, D),
]


@pytest.mark.parametrize("code,gender,value,expected", OFFICIAL_BOUNDARIES)
def test_judge_matches_official_criteria(code, gender, value, expected):
    assert ref.judge(code, value, gender) == expected


def test_low_values_report_low_direction():
    assert ref.describe("hdl", 45, "M")["direction"] == "low"
    assert ref.describe("bmi", 17, "M")["direction"] == "low"
    assert ref.describe("bmi", 27, "M")["direction"] == "high"
    assert ref.describe("hb", 17.2, "M")["direction"] == "high"


def _amount(text):
    value, unit = re.match(r"([\d.]+)(.*)", text).groups()
    return float(value), unit


@pytest.mark.parametrize("cid", [c for c, s in ref.SUPPLEMENTS.items() if s.get("dailyIntake")])
def test_product_amount_is_within_notified_daily_intake(cid):
    info = ref.SUPPLEMENTS[cid]
    intake = info["dailyIntake"]
    amount, unit = _amount(info["ingredients"][intake["ingredient"]])
    assert unit == intake["unit"]
    assert intake["min"] <= amount <= intake["max"]


def test_rules_point_to_known_codes():
    for rule in ref.RECOMMENDATION_RULES + ref.CONDITION_CAUTIONS:
        assert rule["supplement"] in ref.SUPPLEMENTS
        assert set(rule["items"]) <= set(ref.CHECKUP_ITEMS)
    for rule in ref.INTERACTIONS:
        assert rule["supplement"] in ref.SUPPLEMENTS
        assert rule["drugClass"] in set(ref.MEDICATIONS.values())
    for cid, info in ref.SUPPLEMENTS.items():
        assert set(info["lifeStageAvoid"]) <= set(ref.LIFE_STAGE_LABELS), cid
        assert "meta" not in info


USER = {"gender": "F", "medications": [], "lifestyle": {}}


def test_pregnancy_excludes_red_yeast_rice():
    user = dict(USER, lifestyle={"pregnant": True})
    r = logic.recommend(user, {"ldl": 150}, [])
    assert "red_yeast_rice" in {e["supplementId"] for e in r["excluded"]}
    assert "plant_sterol" in {x["supplementId"] for x in r["recommendations"]}


def test_pregnancy_excludes_banaba_and_milk_thistle():
    # 고시 3. 2-12, 2-14: 어린이·임산부·수유부는 섭취를 피할 것
    user = dict(USER, lifestyle={"pregnant": True})
    r = logic.recommend(user, {"fbs": 110, "alt": 50}, [])
    assert {"banaba", "milk_thistle"} <= {e["supplementId"] for e in r["excluded"]}


def test_liver_values_exclude_red_yeast_rice():
    # 고시 3. 2-52: 간 질환이 있으면 섭취를 피할 것
    r = logic.recommend(USER, {"ldl": 150, "alt": 50}, [])
    assert "red_yeast_rice" in {e["supplementId"] for e in r["excluded"]}


def test_liver_caution_ingredients_are_not_recommended_together():
    r = logic.recommend(USER, {"bmi": 27}, [])
    ids = {x["supplementId"] for x in r["recommendations"]}
    assert len(ids & {"garcinia", "green_tea"}) == 1


def test_iron_gets_spacing_notice_with_green_tea():
    r = logic.recommend(USER, {"hb": 11, "ldl": 150}, [])
    iron = next(x for x in r["recommendations"] if x["supplementId"] == "iron")
    assert [w["hours"] for w in iron["warnings"] if w["type"] == "spacing"] == [2]


def test_low_hdl_gets_note_instead_of_supplement():
    r = logic.recommend(USER, {"hdl": 38}, [])
    assert r["recommendations"] == []
    assert r["notes"][0]["items"] == ["hdl"]


def test_overlap_checks_notified_max_for_functional_ingredients():
    assert ref.UPPER_LIMITS["EPA·DHA"] == 2000
    assert ref.UPPER_LIMITS["철"] == 45
