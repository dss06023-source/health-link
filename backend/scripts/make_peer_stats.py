"""app/seed/peer_stats.json 생성: 공단 「직역별 성별 연령별 건강검진정보」 CSV를 성별·연령대별 판정 비율로 바꾼다.

python -m scripts.make_peer_stats app/seed/source/nhis_checkup_judgment_2022_2023.csv app/seed/peer_stats.json
"""
import csv, json, sys

# 검진 항목 그룹(checkup_criteria.json의 group) → 원자료 열. 한 사람이 여러 판정에 함께 셀 수 있다.
GROUPS = {
    "혈압": {"caution": "정상B_혈압관리", "danger": "고혈압당뇨병질환의심_고혈압질환의심", "treated": "유질환자_고혈압"},
    "혈당": {"caution": "정상B_당뇨관리", "danger": "고혈압당뇨병질환의심_당뇨질환의심", "treated": "유질환자_당뇨"},
    "지질": {"caution": "정상B_이상지질혈증관리", "danger": "일반질환의심_이상지질혈증의심", "treated": "유질환자_이상지질혈증"},
    "간기능": {"caution": "정상B_간기능관리", "danger": "일반질환의심_간장질환의심"},
    "신장기능": {"caution": "정상B_신장기능관리", "danger": "일반질환의심_신장질환의심"},
    "빈혈": {"caution": "정상B_빈혈관리", "danger": "일반질환의심_빈혈증의심"},
    "비만": {"caution": "정상B_비만관리"},
}
SEX = {"남자": "M", "여자": "F"}


def count(v):
    v = v.strip()
    return int(v) if v else 0


def pct(n, total):
    return round(100 * n / total, 1)


def build(rows, year):
    sums = {}
    for r in rows:
        if r["검진사업년도"] != year:
            continue
        key = (SEX[r["성별"]], r["연령(5세단위)"])
        acc = sums.setdefault(key, {})
        for col, v in r.items():
            if col not in ("검진사업년도", "직역", "연령(5세단위)", "성별"):
                acc[col] = acc.get(col, 0) + count(v)
    bands = {"M": {}, "F": {}}
    for (sex, age), acc in sums.items():
        n = acc["수검인원"]
        bands[sex][age] = {
            "examinees": n,
            "normalA": pct(acc["정상A"], n),
            "anyCaution": pct(acc["정상B_실인원"], n),
            "anySuspect": pct(acc["일반질환의심_실인원"], n),
            "anyBpDmSuspect": pct(acc["고혈압당뇨병질환의심_실인원"], n),
            "anyTreated": pct(acc["유질환자_실인원"], n),
            "groups": {g: {k: pct(acc[col], n) for k, col in cols.items()} for g, cols in GROUPS.items()},
        }
    return bands


def main(src, dst):
    rows = list(csv.DictReader(open(src, encoding="utf-8")))
    year = max(r["검진사업년도"] for r in rows)
    out = {
        "_about": "국가 일반건강검진 수검자 중 성별·연령대(5세)별 판정 비율(%). 공단이 건강검진 실시기준 별표 4로 판정한 결과를 직역(공교·지역·직장) 합산했다. 또래 비교 문구용이며 아직 API에서 쓰지 않는다.",
        "_source": {
            "name": "국민건강보험공단_직역별 성별 연령별 건강검진정보 (공공데이터포털 15144521, 2025-07-16 등록, 이용허락범위 제한 없음)",
            "url": "https://www.data.go.kr/data/15144521/fileData.do",
            "year": int(year),
            "raw": "app/seed/source/nhis_checkup_judgment_2022_2023.csv (원본 CP949 → UTF-8)",
        },
        "_fields": {
            "normalA": "모든 항목이 정상A인 사람",
            "anyCaution": "정상B(경계) 항목이 하나 이상인 사람. 질환의심 항목이 함께 있을 수 있다",
            "anySuspect": "일반질환의심(고혈압·당뇨 제외) 항목이 하나 이상인 사람",
            "anyBpDmSuspect": "고혈압 또는 당뇨병 질환의심인 사람",
            "anyTreated": "고혈압·당뇨병·이상지질혈증·폐결핵으로 이미 약물 치료 중인 사람(유질환자)",
            "groups": "항목 그룹별 caution=정상B, danger=질환의심, treated=유질환자 비율. 그룹끼리 겹친다",
        },
        "_notes": [
            "원자료는 사람 단위 판정 집계라 항목(TG, LDL 등)별 비율은 없다. 지질은 총콜레스테롤·LDL·HDL·중성지방 중 하나 이상이다.",
            "지질 검사는 남 24세·여 40세부터 4년마다 한다. 분모에 그해 지질 검사를 받지 않은 수검자도 들어 있어 지질 비율은 실제 유병률보다 낮고, 연령대마다 검사 차례가 달라 연령대끼리 비교할 수 없다.",
            "비만은 원자료에 질환의심 열이 없어 정상B(비만관리)만 있다.",
            "신장기능 정상B는 이 앱에 없는 요단백(약양성) 판정에서 나온 것으로 보인다(추정).",
        ],
        "bands": build(rows, year),
    }
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:3])
