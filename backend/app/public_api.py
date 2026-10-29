"""공공·지도 API 연결: 건보공단 검진기관, 식약처 e약은요·DUR 품목, 도로명주소, 카카오 좌표.

키는 환경 변수에서만 읽는다(DATA_GO_KR_KEY, JUSO_API_KEY, KAKAO_REST_API_KEY).
키가 없거나 호출이 실패하면 None을 돌려주고, 부르는 쪽이 가상 데이터로 대신한다.
요청 주소에 키가 들어가므로 실패 기록에는 서비스 이름과 오류 종류만 남긴다.
"""

import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import unquote

import httpx

log = logging.getLogger("health_itda.public_api")

TIMEOUT = float(os.environ.get("PUBLIC_API_TIMEOUT", "6"))
CACHE_SECONDS = 6 * 3600

DATA_GO_KR = "https://apis.data.go.kr"
HMC_URL = DATA_GO_KR + "/B550928/HmcSearchService/getHmcList"
EASY_DRUG_URL = DATA_GO_KR + "/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList"
DUR_URL = DATA_GO_KR + "/1471000/DURPrdlstInfoService03/getDurPrdlstInfoList03"
JUSO_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do"
KAKAO_ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KAKAO_REGION_URL = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json"
KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

_cache: dict = {}


def _key(name):
    value = os.environ.get(name, "").strip()
    # 공공데이터포털 키를 '인코딩' 값으로 넣어도 되게 한 번 풀어 둔다(httpx가 다시 인코딩한다).
    return unquote(value) if "%" in value else value


def configured():
    """어떤 키가 들어 있는지만 알려 준다(값은 내보내지 않는다)."""
    return {
        "dataGoKr": bool(_key("DATA_GO_KR_KEY")),
        "juso": bool(_key("JUSO_API_KEY")),
        "kakao": bool(_key("KAKAO_REST_API_KEY")),
        "kakaoJs": bool(_key("KAKAO_JS_KEY")),
    }


def cached(fn):
    """성공한 결과만 잠시 기억한다. 같은 동네·같은 약을 다시 찾을 때 외부 호출을 건너뛴다."""
    def wrapper(*args):
        hit = _cache.get((fn.__name__, args))
        if hit and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
        value = fn(*args)
        if value is not None:
            _cache[(fn.__name__, args)] = (time.time(), value)
        return value
    wrapper.__name__ = fn.__name__
    return wrapper


def _get(service, url, params, headers=None):
    try:
        r = httpx.get(url, params=params, headers=headers, timeout=TIMEOUT)
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        log.warning("%s 호출 실패: HTTP %s", service, e.response.status_code)
        return None
    except httpx.HTTPError as e:
        log.warning("%s 호출 실패: %s", service, type(e).__name__)
        return None
    return r


def _json(service, r):
    try:
        return r.json()
    except ValueError:
        # 공공데이터포털은 키 오류일 때 type=json이어도 XML로 답한다.
        log.warning("%s 응답이 JSON이 아님", service)
        return None


# ---------- 카카오 로컬: 주소 → 좌표, 좌표 → 법정동 코드 ----------

def _kakao(service, url, params):
    key = _key("KAKAO_REST_API_KEY")
    if not key:
        return None
    r = _get(service, url, params, {"Authorization": f"KakaoAK {key}"})
    return _json(service, r) if r is not None else None


@cached
def geocode(address):
    data = _kakao("kakao-address", KAKAO_ADDRESS_URL, {"query": address, "size": 1})
    docs = (data or {}).get("documents") or []
    if not docs:
        return None
    d = docs[0]
    road = d.get("road_address") or {}
    return {"address": road.get("address_name") or d.get("address_name"),
            "lat": float(d["y"]), "lng": float(d["x"])}


@cached
def region_code(lat, lng):
    """좌표가 속한 법정동 코드(10자리). 앞 2자리 시도, 다음 3자리 시군구로 검진기관을 찾는다."""
    data = _kakao("kakao-region", KAKAO_REGION_URL, {"x": round(lng, 4), "y": round(lat, 4)})
    for d in (data or {}).get("documents") or []:
        if d.get("region_type") == "B" and d.get("code"):
            return d["code"]
    return None


# ---------- 도로명주소 검색 ----------

@cached
def search_address(keyword, limit=10):
    key = _key("JUSO_API_KEY")
    if not key:
        return None
    r = _get("juso", JUSO_URL, {"confmKey": key, "keyword": keyword, "resultType": "json",
                                 "currentPage": 1, "countPerPage": limit})
    data = _json("juso", r) if r is not None else None
    results = (data or {}).get("results") or {}
    common = results.get("common") or {}
    if common.get("errorCode") != "0":
        if data:
            log.warning("juso 오류 코드 %s", common.get("errorCode"))
        return None
    return [{
        "roadAddress": j.get("roadAddr"),
        "jibunAddress": j.get("jibunAddr"),
        "zipCode": j.get("zipNo"),
        "buildingName": j.get("bdNm") or None,
        "regionCode": j.get("admCd"),
    } for j in results.get("juso") or []]


# ---------- 건강검진기관 ----------

# 검진기관 API의 검진 종류 칸(1이면 그 검진을 한다).
EXAM_TYPES = [
    ("grenChrgTypeCd", "일반"), ("stmcaExmdChrgTypeCd", "위암"), ("ccExmdChrgTypeCd", "대장암"),
    ("lvcaExmdChrgTypeCd", "간암"), ("bcExmdChrgTypeCd", "유방암"), ("cvxcaExmdChrgTypeCd", "자궁경부암"),
    ("mchkChrgTypeCd", "구강"), ("ichkChrgTypeCd", "영유아"),
]


@cached
def checkup_centers(lat, lng, rows=300):
    """좌표가 속한 시군구의 검진기관 목록(거리 계산 전). 실패하면 None."""
    key = _key("DATA_GO_KR_KEY")
    code = region_code(lat, lng) if key else None
    if not code:
        return None
    r = _get("hmc", HMC_URL, {"serviceKey": key, "siDoCd": code[:2], "siGunGuCd": code[2:5],
                              "pageNo": 1, "numOfRows": rows})
    if r is None:
        return None
    try:
        root = ET.fromstring(r.content)
    except ET.ParseError:
        log.warning("hmc 응답이 XML이 아님")
        return None
    if root.findtext("header/resultCode") != "00":
        log.warning("hmc 오류 코드 %s", root.findtext("header/resultCode"))
        return None
    centers = []
    for item in root.iter("item"):
        f = {c.tag: (c.text or "").strip() for c in item}
        try:
            c_lat, c_lng = float(f["cyVl"]), float(f["cxVl"])
        except (KeyError, ValueError):
            continue
        centers.append({
            "id": f.get("hmcNo"),
            "name": f.get("hmcNm"),
            "address": f.get("locAddr"),
            "phone": f.get("hmcTelNo") or f.get("exmdrTelNo") or None,
            "lat": c_lat, "lng": c_lng,
            "kind": f.get("ykindnm") or None,
            "exams": [label for tag, label in EXAM_TYPES if f.get(tag) == "1"],
        })
    return centers


@cached
def place(name, lat, lng):
    """카카오 장소 검색으로 기관 좌표 근처(300m)에서 같은 이름을 찾는다. 전화·카카오맵 장소 주소를 준다."""
    data = _kakao("kakao-keyword", KAKAO_KEYWORD_URL,
                  {"query": name, "x": lng, "y": lat, "radius": 300, "sort": "distance", "size": 5})
    docs = (data or {}).get("documents") or []
    if not docs:
        return None
    squeeze = lambda t: re.sub(r"[\s()]", "", t or "")
    # 이름이 겹치는 곳을 먼저, 없으면 가장 가까운 곳.
    d = next((d for d in docs if squeeze(name) in squeeze(d.get("place_name")) or squeeze(d.get("place_name")) in squeeze(name)), docs[0])
    return {
        "placeName": d.get("place_name"),
        "phone": d.get("phone") or None,
        "placeUrl": d.get("place_url") or None,
        "roadAddress": d.get("road_address_name") or None,
        "category": d.get("category_name") or None,
    }


def kakao_js_key():
    """지도 화면용 카카오 JavaScript 키. 브라우저에 보내도 되는 키이고, 카카오 앱의 사이트 도메인에서만 동작한다."""
    return _key("KAKAO_JS_KEY") or None


# ---------- 약 검색: e약은요(쉬운 설명) + DUR 품목(전문의약품 포함, 금기 종류) ----------

def _clean(text):
    return re.sub(r"\s+", " ", text or "").strip() or None


def _items(service, url, params):
    key = _key("DATA_GO_KR_KEY")
    if not key:
        return None
    r = _get(service, url, {"serviceKey": key, "type": "json", "pageNo": 1, **params})
    data = _json(service, r) if r is not None else None
    if not data:
        return None
    if (data.get("header") or {}).get("resultCode") != "00":
        log.warning("%s 오류 코드 %s", service, (data.get("header") or {}).get("resultCode"))
        return None
    items = (data.get("body") or {}).get("items") or []
    # DUR 응답에는 "TYPE_NAME  "처럼 이름 끝에 빈칸이 붙은 칸이 있다.
    return [{k.strip(): v for k, v in i.items()} for i in items]


@cached
def search_drugs(name, limit=10):
    with ThreadPoolExecutor(2) as pool:
        easy_f = pool.submit(_items, "e-drug", EASY_DRUG_URL, {"itemName": name, "numOfRows": limit})
        dur_f = pool.submit(_items, "dur", DUR_URL, {"itemName": name, "numOfRows": limit})
        easy, dur = easy_f.result(), dur_f.result()
    if easy is None and dur is None:
        return None
    merged = {}
    for d in dur or []:
        merged[d.get("ITEM_SEQ")] = {
            "itemSeq": d.get("ITEM_SEQ"), "name": d.get("ITEM_NAME"), "company": d.get("ENTP_NAME"),
            "kind": d.get("ETC_OTC_CODE"), "className": d.get("CLASS_NO"),
            "ingredients": _ingredients(d.get("MATERIAL_NAME")),
            "durTypes": [t for t in (d.get("TYPE_NAME") or "").split(",") if t],
        }
    for e in easy or []:
        row = merged.setdefault(e.get("itemSeq"), {
            "itemSeq": e.get("itemSeq"), "name": e.get("itemName"), "company": e.get("entpName"),
            "kind": None, "className": None, "ingredients": [], "durTypes": [],
        })
        row["guide"] = {
            "efficacy": _clean(e.get("efcyQesitm")),
            "usage": _clean(e.get("useMethodQesitm")),
            "warning": _clean(e.get("atpnWarnQesitm")),
            "caution": _clean(e.get("atpnQesitm")),
            "interaction": _clean(e.get("intrcQesitm")),
            "sideEffect": _clean(e.get("seQesitm")),
            "storage": _clean(e.get("depositMethodQesitm")),
        }
    rows = list(merged.values())[:limit]
    for row in rows:
        row.setdefault("guide", None)
    return rows


def _ingredients(material):
    # "와파린나트륨,,5.0,밀리그램,USP,|..." 에서 성분 이름만 뽑는다.
    names = []
    for part in (material or "").split("|"):
        n = part.split(",")[0].strip()
        if n and n not in names:
            names.append(n)
    return names
