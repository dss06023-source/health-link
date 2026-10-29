"""변화 리포트 시연용 결과지 두 장(공식 양식, 가상 인물 김건강)을 만든다.

python -m scripts.make_followup_sheets <출력 폴더>
→ 1_처음검진_2026-04-20.pdf: make_official_sheet와 같은 수치(경계·질환의심 몇 개), 검진일만 6개월 앞
→ 2_6개월후_2026-10-20.pdf: 모든 항목이 정상A인 수치
업로드하면 서버가 결과지의 검진일을 읽어 두 검진을 날짜 순으로 비교한다. 값은 모두 가상이다.
"""
import sys
from pathlib import Path

import scripts.make_official_sheet as base

AFTER = {"sbp": 116, "dbp": 74, "fbs": 91, "tc": 182, "hdl": 62, "tg": 118, "ldl": 103, "hb": 14.8,
         "creatinine": 0.9, "egfr": 94, "ast": 24, "alt": 26, "ggt": 34, "bmi": 23.4, "waist": 82}
# 2쪽 수치 칸(위치는 make_official_sheet.VALUES와 같다)
VALUE_ORDER = ["hb", "fbs", "tc", "hdl", "tg", "ldl", "creatinine", "egfr", "ast", "alt", "ggt"]


def _swap_text(page, old, new):
    ops = base.ops[page]
    hits = [i for i, op in enumerate(ops) if op[0] == "t" and op[3] == old]
    assert hits, (page, old)
    for i in hits:
        ops[i] = (*ops[i][:3], new, *ops[i][4:])


def _drop_tick(page, label, top):
    before = len(base.ops[page])
    base.tick(page, label, top)
    box = base.ops[page].pop()
    base.ops[page] = [op for op in base.ops[page] if op != box]
    assert len(base.ops[page]) < before, (page, label, top)


def _dates(exam, notice, notice_parts):
    for page in (0, 3):
        _swap_text(page, "2026. 10. 20.", exam)
    _swap_text(2, "2026. 10. 27.", notice)
    for old, new in zip(("26", "10", "27"), notice_parts):
        _swap_text(2, old, new)


def before_sheet():
    _dates("2026. 4. 20.", "2026. 4. 27.", ("26", "4", "27"))
    return base.fill_pdf()


def after_sheet():
    # 수치
    _swap_text(1, "72.5 kg", "69.5 kg")
    _swap_text(1, "24.4", str(AFTER["bmi"]))
    _swap_text(1, "82", str(AFTER["dbp"]))  # 허리둘레 새 값(82)과 겹치지 않게 먼저 바꾼다
    _swap_text(1, "86", str(AFTER["waist"]))
    _swap_text(1, "126", str(AFTER["sbp"]))
    for (_, old), code in zip(base.VALUES, VALUE_ORDER):
        _swap_text(1, old, str(AFTER[code]))
    # 판정 칸: 경계·질환의심 표시를 정상으로
    _drop_tick(0, "정상B(경계)", 212.9); base.tick(0, "정상A", 212.9)
    _drop_tick(1, "고혈압", 152.3); base.tick(1, "정상", 140.7)
    _drop_tick(1, "공복혈당장애", 221.8); base.tick(1, "정상", 210.2)
    _drop_tick(1, "고중성지방혈증", 261.5); base.tick(1, "정상", 238.1)
    _drop_tick(1, "간기능", 366.1); base.tick(1, "정상", 354.4)
    # 종합소견
    _swap_text(0, "공복혈당이 경계 수준(101mg/dL)입니다. 체중 관리와 절주, 주 3회 이상 유산소 운동을 권합니다.",
               "모든 검사 결과가 정상 범위입니다. 지금의 식습관과 운동을 유지하십시오.")
    _swap_text(0, "중성지방(162mg/dL)과 ALT(37IU/L), 감마지티피(58IU/L)가 참고치보다 조금 높습니다.",
               "지난 검진보다 공복혈당·중성지방·간기능 수치가 좋아졌습니다.")
    _swap_text(0, "1년 뒤 공복혈당·간기능 재확인을 권합니다.", "다음 정기 검진 때 다시 확인하십시오.")
    return base.fill_pdf()


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out.mkdir(parents=True, exist_ok=True)
    saved = {p: list(ops) for p, ops in base.ops.items()}
    (out / "1_처음검진_2026-04-20.pdf").write_bytes(before_sheet())
    base.ops.update({p: list(ops) for p, ops in saved.items()})
    (out / "2_6개월후_2026-10-20.pdf").write_bytes(after_sheet())
