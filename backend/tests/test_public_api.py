import httpx
import pytest
from fastapi.testclient import TestClient

from app import public_api

HMC_XML = """<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>00</resultCode></header><body><items>
<item><hmcNo>1</hmcNo><hmcNm>먼병원</hmcNm><locAddr>서울 중구 먼길 1</locAddr><hmcTelNo>02-1</hmcTelNo>
<cxVl>127.0100</cxVl><cyVl>37.5665</cyVl><ykindnm>병원</ykindnm><grenChrgTypeCd>1</grenChrgTypeCd><stmcaExmdChrgTypeCd>0</stmcaExmdChrgTypeCd></item>
<item><hmcNo>2</hmcNo><hmcNm>가까운의원</hmcNm><locAddr>서울 중구 앞길 2</locAddr><hmcTelNo>02-2</hmcTelNo>
<cxVl>126.9790</cxVl><cyVl>37.5665</cyVl><ykindnm>의원</ykindnm><grenChrgTypeCd>1</grenChrgTypeCd><stmcaExmdChrgTypeCd>1</stmcaExmdChrgTypeCd></item>
</items></body></response>"""


def fake_responses(url, params=None, headers=None, timeout=None):
    req = httpx.Request("GET", url)
    if "coord2regioncode" in url:
        return httpx.Response(200, request=req, json={"documents": [
            {"region_type": "H", "code": "1114055000"}, {"region_type": "B", "code": "1114010300"}]})
    if "search/address" in url:
        return httpx.Response(200, request=req, json={"documents": [
            {"address_name": "서울 중구 태평로1가 31", "x": "126.978", "y": "37.5665",
             "road_address": {"address_name": "서울 중구 세종대로 110"}}]})
    if "getHmcList" in url:
        assert params["siDoCd"] == "11" and params["siGunGuCd"] == "140"
        return httpx.Response(200, request=req, content=HMC_XML.encode())
    if "DURPrdlstInfoService03" in url:
        return httpx.Response(200, request=req, json={"header": {"resultCode": "00"}, "body": {"items": [
            {"ITEM_SEQ": "200502107", "ITEM_NAME": "쿠파린정5밀리그램(와파린나트륨)", "ENTP_NAME": "하나제약(주)",
             "ETC_OTC_CODE": "전문의약품", "CLASS_NO": "[333]혈액응고저지제",
             "MATERIAL_NAME": "와파린나트륨,,5.0,밀리그램,USP,", "TYPE_NAME  ": "임부금기,첨가제주의"}]}})
    if "DrbEasyDrugInfoService" in url:
        return httpx.Response(200, request=req, json={"header": {"resultCode": "00"}, "body": {"items": [
            {"itemSeq": "200502107", "itemName": "쿠파린정5밀리그램(와파린나트륨)", "entpName": "하나제약(주)",
             "efcyQesitm": "혈전 예방\n", "intrcQesitm": "비타민K가 많은 음식에 주의하십시오.\n"}]}})
    if "search/keyword" in url:
        assert params["query"] == "가까운의원" and params["radius"] == 300
        return httpx.Response(200, request=req, json={"documents": [
            {"place_name": "다른약국", "phone": "02-9", "place_url": "http://place.map.kakao.com/9"},
            {"place_name": "가까운의원", "phone": "02-777-7777", "place_url": "http://place.map.kakao.com/7",
             "road_address_name": "서울 중구 앞길 2", "category_name": "의료,건강 > 병원 > 내과"}]})
    if "addrLinkApi" in url:
        return httpx.Response(200, request=req, json={"results": {"common": {"errorCode": "0"}, "juso": [
            {"roadAddr": "서울특별시 중구 세종대로 110", "jibunAddr": "서울특별시 중구 태평로1가 31",
             "zipNo": "04524", "bdNm": "서울특별시청", "admCd": "1114010300"}]}})
    raise AssertionError(url)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    from app import db
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    from app.main import app
    with TestClient(app) as c:
        c.post("/api/auth/guest")  # 가상 인물 기록이 든 체험 계정으로 시작
        yield c


@pytest.fixture()
def keys(monkeypatch):
    for name in ("DATA_GO_KR_KEY", "JUSO_API_KEY", "KAKAO_REST_API_KEY"):
        monkeypatch.setenv(name, "test-key")
    monkeypatch.setattr(public_api.httpx, "get", fake_responses)


def test_without_keys_everything_falls_back_to_demo(client):
    centers = client.get("/api/checkup-centers").json()
    assert len(centers) == 5 and all(c["isDemoData"] for c in centers)
    assert client.get("/api/drugs/search", params={"q": "와파린"}).json()["items"][0]["name"] == "와파린"
    assert client.get("/api/address/search", params={"q": "세종대로"}).json()["source"] == "demo"
    assert client.get("/api/geocode", params={"address": "아무 주소"}).json()["isDemoData"] is True
    assert client.get("/api/health").json()["publicApis"] == {"dataGoKr": False, "juso": False, "kakao": False, "kakaoJs": False}


def test_real_checkup_centers_sorted_by_distance(client, keys):
    centers = client.get("/api/checkup-centers", params={"lat": 37.5665, "lng": 126.978}).json()
    assert [c["name"] for c in centers] == ["가까운의원", "먼병원"]
    assert centers[0]["isDemoData"] is False and centers[0]["tags"] == ["의원", "위암"]
    assert centers[0]["distanceKm"] < 0.2


def test_region_without_nhis_data_returns_empty_list(client, keys, monkeypatch):
    monkeypatch.setattr(public_api, "checkup_centers", lambda lat, lng: [])
    assert client.get("/api/checkup-centers", params={"lat": 35.0036, "lng": 128.0642}).json() == []


def test_real_drug_search_merges_dur_and_easy_guide(client, keys):
    body = client.get("/api/drugs/search", params={"q": "쿠파린"}).json()
    drug = body["items"][0]
    assert body["source"] == "mfds" and len(body["items"]) == 1
    assert drug["durTypes"] == ["임부금기", "첨가제주의"] and drug["ingredients"] == ["와파린나트륨"]
    assert drug["guide"]["interaction"] == "비타민K가 많은 음식에 주의하십시오."
    assert drug["matchedOption"] == {"name": "와파린", "drugClass": "anticoagulant", "by": "ingredient"}


def test_real_address_and_geocode(client, keys):
    addr = client.get("/api/address/search", params={"q": "세종대로 110"}).json()
    assert addr["source"] == "juso" and addr["items"][0]["zipCode"] == "04524"
    point = client.get("/api/geocode", params={"address": "세종대로 110"}).json()
    assert point == {"address": "서울 중구 세종대로 110", "lat": 37.5665, "lng": 126.978,
                     "source": "kakao", "isDemoData": False}


def test_api_failure_falls_back_and_hides_key(client, monkeypatch, caplog):
    for name in ("DATA_GO_KR_KEY", "KAKAO_REST_API_KEY"):
        monkeypatch.setenv(name, "secret-value")

    def down(url, params=None, headers=None, timeout=None):
        raise httpx.ConnectTimeout(f"timeout {url}?serviceKey={params.get('serviceKey')}")
    monkeypatch.setattr(public_api.httpx, "get", down)
    centers = client.get("/api/checkup-centers").json()
    assert all(c["isDemoData"] for c in centers)
    assert client.get("/api/drugs/search", params={"q": "와파린"}).json()["source"] == "demo"
    assert "secret-value" not in caplog.text and "ConnectTimeout" in caplog.text


def test_encoded_data_go_kr_key_is_decoded(monkeypatch):
    monkeypatch.setenv("DATA_GO_KR_KEY", "abc%2Bdef%3D%3D")
    assert public_api._key("DATA_GO_KR_KEY") == "abc+def=="


def test_address_search_falls_back_to_kakao_without_juso(client, keys, monkeypatch):
    monkeypatch.delenv("JUSO_API_KEY")
    addr = client.get("/api/address/search", params={"q": "세종대로 110 kakao"}).json()
    assert addr["source"] == "kakao"
    assert addr["items"][0] == {"roadAddress": "서울 중구 세종대로 110", "jibunAddress": "서울 중구 태평로1가 31",
                                "zipCode": None, "buildingName": None, "regionCode": None, "lat": 37.5665, "lng": 126.978}


def test_saving_address_moves_checkup_center_search(client, keys):
    me = client.put("/api/users/me", json={"address": {
        "sido": "서울특별시", "sigungu": "중구", "roadAddress": "서울 중구 세종대로 110", "detailAddress": "3층"}}).json()
    assert me["address"]["detailAddress"] == "3층" and me["location"] == {"lat": 37.5665, "lng": 126.978}
    assert client.get("/api/checkup-centers").json()[0]["source"] == "nhis"


def test_address_without_geocode_uses_sido_center(client):
    me = client.put("/api/users/me", json={"address": {"sido": "부산광역시", "sigungu": "해운대구"}}).json()
    assert me["location"] == {"lat": 35.1796, "lng": 129.0756}
    assert me["address"] == {"sido": "부산광역시", "sigungu": "해운대구", "roadAddress": "", "detailAddress": "", "zipCode": ""}


def test_picked_address_keeps_its_coordinates_and_bad_sido_is_rejected(client):
    me = client.put("/api/users/me", json={"address": {"sido": "제주특별자치도", "sigungu": "서귀포시",
                                                        "roadAddress": "제주 서귀포시 중앙로 1", "lat": 33.25, "lng": 126.56}}).json()
    assert me["location"] == {"lat": 33.25, "lng": 126.56}
    assert client.put("/api/users/me", json={"address": {"sido": "서울"}}).status_code == 422
def test_center_place_uses_kakao_keyword_match(client, keys):
    r = client.get("/api/checkup-centers/place", params={"name": "가까운의원", "lat": 37.5665, "lng": 126.979}).json()
    assert r["found"] and r["phone"] == "02-777-7777" and r["placeUrl"].endswith("/7")
    assert r["category"].endswith("내과") and r["mapLink"].startswith("https://map.kakao.com/link/map/")


def test_center_place_without_key_still_gives_map_link(client):
    r = client.get("/api/checkup-centers/place", params={"name": "가상내과의원", "lat": 37.5, "lng": 127.0}).json()
    assert r["found"] is False and "phone" not in r
    assert r["mapLink"] == "https://map.kakao.com/link/map/%EA%B0%80%EC%83%81%EB%82%B4%EA%B3%BC%EC%9D%98%EC%9B%90,37.5,127.0"


def test_client_config_exposes_only_js_key(client, monkeypatch):
    assert client.get("/api/config").json() == {"kakaoJsKey": None}
    monkeypatch.setenv("KAKAO_JS_KEY", "js-key")
    monkeypatch.setenv("KAKAO_REST_API_KEY", "rest-secret")
    body = client.get("/api/config").text
    assert "js-key" in body and "rest-secret" not in body
