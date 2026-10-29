# 건강잇다 백엔드 (시연용)

국가건강검진 수치 → 해석 → 영양제 추천 → 복용 관리 → 재검진 비교를 제공하는 시연용 API 서버입니다.
추천은 규칙표(`app/seed/*.json`)로만 계산합니다. 체험 계정의 인물·수치는 가상입니다.

## 실행 방법

Python 3.11 이상이 필요합니다.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- 브라우저에서 http://localhost:8000/docs 를 열면 모든 API를 직접 눌러 볼 수 있습니다. 기록 API는 로그인이 필요하므로 먼저 `POST /api/auth/guest`(체험 계정)나 `POST /api/auth/signup`을 실행합니다.
- 체험 계정을 처음 상태로 되돌리기: `POST /api/demo/reset` (가입한 계정은 403).
- 데이터 파일은 `backend/data/demo.db` 에 생깁니다(지워도 다음 실행 때 다시 만들어짐).
- 화면 빌드 폴더를 `FRONTEND_DIST`로 주면 같은 주소에서 화면도 보여 줍니다(배포용 `Dockerfile`이 이렇게 씀).

## 환경 변수

키 값은 저장소에 적지 않습니다. 없으면 해당 기능은 가상 데이터로 대신합니다.

| 이름 | 용도 |
|---|---|
| `DATA_GO_KR_KEY` | 공공데이터포털 키: 건보공단 검진기관, 식약처 e약은요·DUR 품목 |
| `JUSO_API_KEY` | 행정안전부 도로명주소 검색 (없으면 카카오 주소 검색) |
| `KAKAO_REST_API_KEY` | 카카오 로컬: 주소 → 좌표, 좌표 → 시군구, 검진기관 장소 검색 |
| `KAKAO_JS_KEY` | 카카오 지도 JavaScript 키. 브라우저에 보내도 되는 공개용 키(`/api/config`) |
| `DATABASE_URL` | `postgresql://…` 이면 SQLite 대신 그 Postgres(예: Neon 무료)에 저장. 배포한 서버는 이것을 써야 잠들거나 다시 배포돼도 입력이 남음 |
| `PUBLIC_API_TIMEOUT` | 공공 API 응답 대기 초(기본 6) |
| `HEALTH_ITDA_OCR=mock` | 사진 인식 대신 견본 값을 씀(시험용) |
| `DEMO_TODAY`, `DEMO_NOW` | 오늘 날짜·지금 시각 고정(시험용) |

## 결과지 인식(OCR)

- 글자가 든 PDF는 추가 설치 없이 바로 읽습니다.
- 사진과 스캔 PDF는 무료 공개 OCR(RapidOCR + PaddleOCR 한국어 모델)로 읽습니다. 쓰려면 한 번만:

```bash
pip install -r requirements-ocr.txt
python -m scripts.get_ocr_models     # backend/models/ 에 한국어 인식 모델(약 13MB)을 받음
```

- 모델이 없으면 사진은 견본 값으로 대신합니다(`ocr.engine: "mock"`). 모델이 있으면 서버가 켜질 때 뒤에서 미리 올려, 첫 업로드가 모델 읽는 시간을 기다리지 않게 합니다.
- 결과지에 적힌 날짜 중 가장 이른 것을 검진일로 씁니다(못 읽으면 올린 날).
- 인식은 서버 안에서만 하고 파일은 저장하지 않습니다. 외부 OCR 회사로 보내지 않습니다.
- 시험용 가상 결과지 만들기:
  - `python -m scripts.make_sample_sheet tests/fixtures` — 간단한 표 양식(PNG, 기울어진 PNG, PDF)
  - `python -m scripts.make_official_sheet <폴더>` — 공식 양식(별지 제6호서식) PDF와 휴대폰 사진풍 JPG
  - `python -m scripts.make_followup_sheets <폴더>` — 변화 리포트 시연용 두 장(2026-04-20 경계 수치, 2026-10-20 모두 정상)
  - 공식 양식 두 스크립트는 `pip install reportlab pypdf`가 더 필요합니다.

## 테스트

```bash
python -m pytest -q
```

Postgres로 시험: `TEST_DATABASE_URL=postgresql://… python -m pytest` (시험마다 표를 지우므로 실제 DB 주소를 넣지 마세요)

## 파일 구성

| 파일 | 내용 |
|---|---|
| `app/main.py` | API 경로(검진·추천·복용 관리·공공 검색 등) |
| `app/auth.py` | 회원가입·로그인·체험 계정·세션 쿠키 |
| `app/features.py` | 추가 기능 API: 마이데이터 가상 연동, 복용 알림, 중간 검사 기록·리포트 |
| `app/logic.py` | 해석·추천·중복 점검·변화 비교 계산 |
| `app/checkup_schedule.py` | 올해 검진 대상, 성·연령별 검사, 암검진, 확진검사 판정 |
| `app/public_api.py` | 공공·지도 API 연결(검진기관, e약은요·DUR, 도로명주소, 카카오). 실패하면 None을 돌려 가상 데이터로 대신 |
| `app/regions.py` | 시·도 대표 좌표(주소를 좌표로 못 바꿀 때 기준점) |
| `app/reference.py` | `app/seed/` JSON을 읽어 판정 함수와 규칙표로 내보냄 |
| `app/options.py` | 입력 화면 보기 목록 API와 입력값 검사 |
| `app/ocr.py` | 결과지 PDF 글자 읽기와 사진 OCR, 항목별 값·검진일 찾기 |
| `app/measure.py` | 가정 측정값을 검진 항목 코드로 바꾸는 도우미 |
| `app/db.py` | 저장소(SQLite/Postgres)와 가상 데이터 |
| `app/seed/checkup_criteria.json` | 검진 항목 판정 기준(건강검진 실시기준 별표 4와 대조) |
| `app/seed/checkup_schedule.json` | 검진 대상·검사 항목·암검진 기준(공단 안내문) |
| `app/seed/supplements.json` | 영양제 목록, 고시 1일 섭취량, 섭취 주의사항, 권장·대체 복용 시간대, 출처·검증 상태 |
| `app/seed/intake_rules.json` | 추천·제외·주의·상한·복용 간격·시간대 나누기(`slotBalance`) 규칙. 내용 수정은 seed/ 에서 |
| `app/seed/profile_options.json` | 입력 화면 보기(약 계열, 영양제, 생활습관, 질환, 알레르기). `rules: false`인 보기는 저장만 함 |
| `app/seed/peer_stats.json` | 성별·연령대별 국가검진 판정 비율(공단 공개자료, 또래 비교용, 아직 API 미사용) |
| `app/seed/source/` | `peer_stats.json`의 원자료 CSV |
| `scripts/get_ocr_models.py` | OCR 한국어 모델 받기(해시 확인) |
| `scripts/make_sample_sheet.py`, `make_official_sheet.py`, `make_followup_sheets.py` | 시험용 가상 결과지 만들기(위 OCR 항목 참고) |
| `scripts/make_examples.py` | `docs/api-examples.json` 재생성 (`python -m scripts.make_examples ../docs/api-examples.json`) |
| `scripts/make_peer_stats.py` | `app/seed/peer_stats.json` 재생성 (`python -m scripts.make_peer_stats app/seed/source/nhis_checkup_judgment_2022_2023.csv app/seed/peer_stats.json`) |

판정 기준(`checkup_criteria.json`)과 검진 대상 기준(`checkup_schedule.json`)은 `frontend/src/data/`에 사본이 있고, 서버 없는 모의 모드의 규칙(`frontend/src/data/rules.ts`)도 따로 있습니다. 규칙을 바꾸면 양쪽을 함께 고칩니다.

API 규격은 [`../docs/api.md`](../docs/api.md) 를 보세요.
