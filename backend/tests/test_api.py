import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DEMO_TODAY", "2026-10-28")
    from app import db
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    from app.main import app
    with TestClient(app) as c:
        c.post("/api/auth/guest")  # 가상 인물 기록이 든 체험 계정으로 시작
        yield c


def upload_and_confirm(client, **changes):
    checkup = client.post("/api/checkups/upload", files={"file": ("결과.pdf", b"%PDF", "application/pdf")}).json()
    assert checkup["status"] == "pending_review"
    return client.patch(f"/api/checkups/{checkup['id']}", json={"confirm": True, **changes}).json()


def test_checkup_notice_switches_off_after_upload(client):
    me = client.get("/api/users/me").json()
    assert me["checkupDue"] is True and me["nextCheckupYear"] == 2026
    upload_and_confirm(client)
    me = client.get("/api/users/me").json()
    assert me["checkupDue"] is False and me["nextCheckupYear"] == 2028


def test_odd_birth_year_is_not_target_in_even_year(client):
    me = client.put("/api/users/me", json={"birthYear": 1985}).json()
    assert me["isTargetThisYear"] is False and me["nextCheckupYear"] == 2027


def test_non_office_worker_is_target_every_year(client):
    me = client.put("/api/users/me", json={"birthYear": 2003, "jobType": "nonOffice"}).json()
    assert me["isTargetThisYear"] is True and me["targetReason"] == "nonOffice" and me["nextCheckupYear"] == 2026
    upload_and_confirm(client)
    assert client.get("/api/users/me").json()["nextCheckupYear"] == 2027


def test_nhis_confirmed_year_overrides_parity_for_that_year_only(client):
    me = client.put("/api/users/me", json={"birthYear": 2003, "confirmedTargetYear": 2026}).json()
    assert me["checkupDue"] is True and me["targetReason"] == "confirmed" and "공단 조회" in me["message"]
    me = client.put("/api/users/me", json={"confirmedTargetYear": 0}).json()
    assert me["isTargetThisYear"] is False and me["confirmedTargetYear"] is None
    me = client.put("/api/users/me", json={"confirmedTargetYear": 2025}).json()
    assert me["isTargetThisYear"] is False


def test_job_type_must_be_known(client):
    assert client.put("/api/users/me", json={"jobType": "x"}).status_code == 422


def test_upload_rejects_other_files(client):
    r = client.post("/api/checkups/upload", files={"file": ("a.txt", b"x", "text/plain")})
    assert r.status_code == 415


def test_upload_without_ocr_returns_sample_values(client):
    checkup = client.post("/api/checkups/upload", files={"file": ("a.jpg", b"x", "image/jpeg")}).json()
    assert checkup["ocr"]["engine"] == "mock" and "견본" in checkup["ocr"]["message"]
    assert {f["code"] for f in checkup["ocr"]["missing"]} == {"waist", "creatinine", "egfr"}


def test_user_edit_changes_interpretation(client):
    detail = upload_and_confirm(client, values={"fbs": 130})
    fbs = next(i for i in detail["items"] if i["code"] == "fbs")
    assert fbs["status"] == "danger" and fbs["consultDoctor"] is True
    assert "의사 상담" in fbs["explanation"]
    assert [h["value"] for h in fbs["history"]] == [108, 130]


def test_interpretation_has_no_disease_words(client):
    detail = client.get("/api/checkups/latest").json()
    text = " ".join(i["explanation"] for i in detail["items"]) + detail["summary"]["headline"]
    for word in ("당뇨", "고혈압", "간질환", "위험군"):
        assert word not in text


def test_recommendation_excludes_statin_conflict_and_liver_caution(client):
    r = client.get("/api/recommendations").json()
    excluded = {e["supplementId"] for e in r["excluded"]}
    # 홍국: 스타틴 복용, 가르시니아·녹차추출물: ALT가 기준치 밖
    assert excluded == {"red_yeast_rice", "garcinia", "green_tea"}
    ids = [x["supplementId"] for x in r["recommendations"]]
    assert "banaba" in ids and "omega3" in ids
    vit_d = next(x for x in r["recommendations"] if x["supplementId"] == "vitamin_d")
    assert vit_d["alreadyTaking"] and "duplicate" in {w["type"] for w in vit_d["warnings"]}


def test_recommendation_is_deterministic(client):
    assert client.get("/api/recommendations").json() == client.get("/api/recommendations").json()


def test_interaction_warning_when_medication_added(client):
    client.put("/api/users/me", json={"medications": ["아토르바스타틴", "와파린"]})
    r = client.get("/api/recommendations").json()
    omega = next(x for x in r["recommendations"] if x["supplementId"] == "omega3")
    assert omega["warnings"][0]["drugs"] == ["와파린"]
    check = client.get("/api/supplements/check").json()
    assert check["interactions"][0]["supplementId"] == "omega3"


def test_supplement_add_pause_and_intake(client):
    s = client.post("/api/supplements", json={"supplementId": "banaba"}).json()
    assert client.post("/api/supplements", json={"supplementId": "banaba"}).status_code == 409
    today = client.get("/api/intake-logs/today").json()
    assert today["scheduledCount"] == 5 and today["rate"] == 0
    today = client.post("/api/intake-logs", json={"supplementId": s["id"], "timeSlot": "morning"}).json()
    assert today["takenCount"] == 1
    client.patch(f"/api/supplements/{s['id']}", json={"paused": True})
    assert client.get("/api/intake-logs/today").json()["scheduledCount"] == 4
    client.delete(f"/api/supplements/{s['id']}")
    assert all(x["id"] != s["id"] for x in client.get("/api/supplements").json())


def test_supplement_shows_recommended_slot_and_reason(client):
    s = client.post("/api/supplements", json={"supplementId": "iron"}).json()
    client.patch(f"/api/supplements/{s['id']}", json={"timeSlots": ["evening"]})
    row = next(x for x in client.get("/api/supplements").json() if x["id"] == s["id"])
    assert row["timeSlots"] == ["evening"] and row["recommendedSlots"] == ["morning"]
    assert "빈속" in row["timingReason"]


def test_duplicate_over_upper_limit(client):
    client.post("/api/supplements", json={"supplementId": "iron"})
    check = client.get("/api/supplements/check").json()
    iron = next(d for d in check["duplicates"] if d["ingredient"] == "철")
    assert iron["total"] == "20mg" and iron["level"] == "info"


def test_intake_history_rate(client):
    h = client.get("/api/intake-logs").json()
    assert len(h["daily"]) == 30 and 0.7 < h["rate"] < 0.95


def test_compare_report(client):
    assert client.get("/api/reports/compare").status_code == 404
    upload_and_confirm(client)
    r = client.get("/api/reports/compare").json()
    ldl = next(i for i in r["items"] if i["code"] == "ldl")
    assert (ldl["beforeStatus"], ldl["afterStatus"], ldl["trend"]) == ("caution", "normal", "improved")
    # HDL 44→47(정상B 안에서 기준치 쪽으로), BMI 25.6→24.4(정상B→정상A)까지 10개
    assert r["summary"]["improved"] == 10
    assert "효과를 뜻하지 않습니다" in r["note"]
    assert r["adherence"]["rate"] is not None


def test_demo_reset(client):
    upload_and_confirm(client)
    client.post("/api/demo/reset")
    assert len(client.get("/api/checkups").json()) == 1


def test_age_items_follow_nhis_table(client):
    # 2026년 기준. 1986년생 남성은 40세: B형간염·생활습관평가·치면세균막, 남성 이상지질혈증(24세부터 4년마다)도 해당.
    me = client.get("/api/users/me").json()
    ids = {i["id"] for i in me["checkupItems"]}
    assert {"lipid", "hepB", "lifestyle", "plaque", "depression"} <= ids and "bone" not in ids
    # 1960년생 여성은 66세: 골밀도·인지기능·노인신체기능
    me = client.put("/api/users/me", json={"birthYear": 1960, "gender": "F"}).json()
    ids = {i["id"] for i in me["checkupItems"]}
    assert {"bone", "cognitive", "elderly", "lungFunction"} <= ids and "lipid" not in ids  # 여성은 40세부터 4년마다라 66세는 아님


def test_cancer_screening_rules(client):
    cancers = lambda me: {c["id"]: c for c in me["cancerScreenings"]}
    # 1976년생(50세) 남성: 위암 2년 주기 대상, 대장암 매년, 간암은 고위험군만
    c = cancers(client.put("/api/users/me", json={"birthYear": 1976}).json())
    assert c["stomach"]["status"] == "target" and c["colorectal"]["status"] == "target"
    assert c["liver"]["status"] == "highRiskOnly" and "lung" not in c
    c = cancers(client.put("/api/users/me", json={"liverHighRisk": True, "colonoscopyYear": 2023, "cancerSpecialCase": ["stomach"]}).json())
    assert c["liver"]["status"] == "target" and c["colorectal"]["status"] == "excluded" and c["stomach"]["status"] == "excluded"
    # 1971년생(55세): 짝수 해라 위암은 내년, 폐암은 30갑년 이상 현재 흡연자만
    me = client.put("/api/users/me", json={"birthYear": 1971, "cancerSpecialCase": [], "colonoscopyYear": 0,
                                           "lifestyle": {"smoking": "current"}, "packYears": 20}).json()
    c = cancers(me)
    assert c["stomach"]["status"] == "notThisYear" and c["lung"]["status"] == "highRiskOnly"
    # 30갑년이면 고위험군이지만 2년 주기라 홀수년생은 내년
    assert cancers(client.put("/api/users/me", json={"packYears": 30}).json())["lung"]["status"] == "notThisYear"
    assert cancers(client.put("/api/users/me", json={"birthYear": 1972}).json())["lung"]["status"] == "target"
    assert client.put("/api/users/me", json={"cancerSpecialCase": ["x"]}).status_code == 422


def test_confirm_test_after_suspected_hypertension(client):
    upload_and_confirm(client, values={"sbp": 150, "dbp": 95, "fbs": 90, "tc": 180, "ldl": 100, "hdl": 55, "tg": 120})
    me = client.get("/api/users/me").json()
    assert me["confirmTest"]["diseases"] == ["고혈압"] and me["confirmTest"]["deadline"] == "2027-03-31"
    assert any("환수" in n for n in me["notes"])


def test_missed_last_year_note(client):
    # 1985년생은 2026년 대상이 아니고 2025년 검진 기록도 없다.
    me = client.put("/api/users/me", json={"birthYear": 1985, "jobType": "office"}).json()
    assert any("1577-1000" in n for n in me["notes"]) and any("추가등록" in n for n in me["notes"])


def test_profile_supplements_and_intake_list_are_one(client):
    def plan():
        return {s["supplementId"] for s in client.get("/api/supplements").json()}

    # 시연 인물의 복용 관리 목록이 내 정보에도 보인다.
    assert {"omega3", "milk_thistle", "multivitamin", "vitamin_d"} <= set(client.get("/api/users/me").json()["currentSupplements"])
    # 내 정보에서 빼면 복용 관리에서 중단되고, 새로 고르면 추가된다.
    me = client.put("/api/users/me", json={"currentSupplements": ["omega3", "milk_thistle", "probiotics", "coq10"]}).json()
    assert set(me["currentSupplements"]) == {"omega3", "milk_thistle", "probiotics", "coq10"}
    assert {"vitamin_d", "multivitamin"}.isdisjoint(plan()) and {"omega3", "coq10"} <= plan()
    ended = [s for s in client.get("/api/supplements", params={"includeEnded": True}).json() if s["supplementId"] == "vitamin_d"]
    assert ended and ended[0]["endedAt"]
    # 추천에서 복용을 시작하면 내 정보에도 체크된다.
    client.post("/api/supplements", json={"supplementId": "vitamin_d"})
    assert "vitamin_d" in client.get("/api/users/me").json()["currentSupplements"]


def test_current_supplements_keep_or_conflict(client):
    # 시연 인물은 스타틴을 먹고 ALT가 기준치 밖이다. 홍국은 피해야 하고, 유산균·루테인은 부딪히는 규칙이 없다.
    me = client.put("/api/users/me", json={"currentSupplements": ["omega3", "probiotics", "lutein", "red_yeast_rice"]}).json()
    assert set(me["currentSupplements"]) == {"omega3", "probiotics", "lutein", "red_yeast_rice"}
    plan = {s["supplementId"] for s in client.get("/api/supplements").json()}
    assert {"probiotics", "lutein", "omega3", "red_yeast_rice"} <= plan
    current = {c["supplementId"]: c for c in client.get("/api/recommendations").json()["current"]}
    assert "omega3" not in current  # 추천에도 있는 영양제는 추천 줄에서 '이미 복용 중'으로 보인다.
    assert current["probiotics"]["status"] == "keep" and current["probiotics"]["message"].startswith("장 건강을 위해 드신다면")
    assert current["lutein"]["message"].startswith("눈 건강을 위해 드신다면")
    assert current["red_yeast_rice"]["status"] == "conflict" and "추천에서 뺐습니다" not in current["red_yeast_rice"]["message"]
    # 나중에 임신 중으로 바꾸면 루테인은 복용 관리에 남고 '피해야 함'으로 보인다.
    client.put("/api/users/me", json={"lifestyle": {"pregnant": True}})
    assert "lutein" in {s["supplementId"] for s in client.get("/api/supplements").json()}
    current = {c["supplementId"]: c for c in client.get("/api/recommendations").json()["current"]}
    assert current["lutein"]["status"] == "conflict"


def test_new_recommendation_that_clashes_with_taking_is_excluded():
    from app import logic
    user = {"gender": "F", "medications": [], "conditions": [], "lifestyle": {}}
    values = {"bmi": 31, "waist": 95, "ldl": 170, "tc": 250}
    free = {r["supplementId"] for r in logic.recommend(user, values, [])["recommendations"]}
    assert {"garcinia", "green_tea"} & free
    r = logic.recommend(user, values, ["green_tea"])
    excluded = {e["supplementId"]: e["message"] for e in r["excluded"]}
    assert "garcinia" in excluded and "이미 녹차추출물을 드시고 있어" in excluded["garcinia"]


def test_purchase_checks_list_ingredients_to_look_for_on_labels():
    # 제품을 살 때 원재료 표시에서 확인할 성분: 피해야 할 원료, 상의할 원료, 상한에 가까운 성분
    from app import logic
    user = {"gender": "M", "medications": ["아토르바스타틴", "와파린"], "conditions": [], "lifestyle": {}}
    checks = logic.recommend(user, {"tg": 250}, ["garcinia"])["purchaseChecks"]
    by_id = {c.get("supplementId", c["ingredient"]): c for c in checks}
    assert by_id["red_yeast_rice"]["type"] == "avoid"
    assert by_id["red_yeast_rice"]["check"] == "홍국(모나콜린K)이 든 제품은 피하십시오."
    assert "추천에서 뺐습니다" not in by_id["red_yeast_rice"]["message"]
    # 가르시니아를 먹고 있으면 함께 먹지 않는 녹차추출물을 피한다.
    assert by_id["green_tea"]["type"] == "avoid" and "이미 가르시니아를 드시고 있습니다" in by_id["green_tea"]["message"]
    assert by_id["vitamin_k"]["type"] == "caution" and by_id["vitamin_k"]["check"].startswith("제품에 비타민K가 들어 있으면")
    assert "multivitamin" not in by_id  # 여러 성분을 묶은 제품은 성분별 항목으로 안내한다.
    assert by_id["HCA"]["type"] == "amount"  # 이미 고시 최대량(1500mg)을 먹고 있다.
    # 구매 탭이 고른 제품과 관계있는 항목을 가르도록 걸리는 성분 이름을 함께 준다.
    assert by_id["red_yeast_rice"]["ingredientKeys"] == ["모나콜린K"]
    assert by_id["vitamin_k"]["ingredientKeys"] == ["비타민K"]
    assert by_id["HCA"]["ingredientKeys"] == ["HCA"]
    # 부딪히는 규칙이 없으면 확인할 성분도 없다.
    assert logic.recommend({"gender": "F", "medications": [], "conditions": [], "lifestyle": {}}, {}, [])["purchaseChecks"] == []


def test_frontend_product_ingredients_match_seed():
    # 구매 탭의 제품별 성분표(frontend/src/data/product_ingredients.json)는 supplements.json에서 만든 복사본이다.
    import json
    from pathlib import Path
    from app import reference as ref
    front = Path(__file__).resolve().parents[2] / "frontend/src/data/product_ingredients.json"
    assert json.loads(front.read_text(encoding="utf-8")) == {i["name"]: list(i["ingredients"]) for i in ref.SUPPLEMENTS.values()}


def test_frontend_product_mixes_use_known_ingredient_names():
    # 구매 탭의 '흔히 함께 든 성분'(product_mixes.json)은 성분표 이름으로만 적어야 확인 항목과 맞물린다.
    import json
    from pathlib import Path
    from app import reference as ref
    front = Path(__file__).resolve().parents[2] / "frontend/src/data/product_mixes.json"
    mixes = json.loads(front.read_text(encoding="utf-8"))["items"]
    names = {i["name"] for i in ref.SUPPLEMENTS.values()}
    keys = {k for i in ref.SUPPLEMENTS.values() for k in i["ingredients"]}
    assert set(mixes) <= names
    assert all(set(v) <= keys for v in mixes.values())


def test_saw_palmetto_is_for_adult_men_only():
    # 고시 3. 2-28: 성인남성만 섭취할 것. 여성이 이미 먹고 있으면 피해야 할 조합으로 알린다.
    from app import logic
    woman = {"gender": "F", "medications": [], "conditions": [], "lifestyle": {}}
    man = {"gender": "M", "medications": [], "conditions": [], "lifestyle": {}}
    w = logic.recommend(woman, {}, ["saw_palmetto"])
    assert [c["status"] for c in w["current"] if c["name"] == "쏘팔메토"] == ["conflict"]
    assert "성인 남성만" in next(c["message"] for c in w["current"] if c["name"] == "쏘팔메토")
    assert not [c for c in w["purchaseChecks"] if c["type"] == "avoid"]  # 구매 확인에는 성별 원료 경고를 띄우지 않는다.
    m = logic.recommend(man, {}, ["saw_palmetto"])
    assert [c["status"] for c in m["current"] if c["name"] == "쏘팔메토"] == ["keep"]


def test_new_notice_rules_for_ginseng_ginkgo_msm():
    from app import logic
    user = {"gender": "M", "medications": ["와파린", "메트포르민"], "conditions": ["kidney"], "lifestyle": {}}
    r = logic.recommend(user, {}, ["red_ginseng", "ginkgo", "msm"])
    by = {c["name"]: c for c in r["current"]}
    assert by["홍삼"]["status"] == "keep" and any("당뇨약" in x for x in by["홍삼"]["cautions"]) and any("혈액항응고제" in x for x in by["홍삼"]["cautions"])
    assert any("항응고제" in x for x in by["은행잎 추출물"]["cautions"])
    assert any("신장 질환" in x for x in by["MSM"]["cautions"])
