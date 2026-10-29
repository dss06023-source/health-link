# 건강잇다 백엔드 (시연용)

국가건강검진 수치 → 해석 → 영양제 추천 → 복용 관리 → 재검진 비교를 제공하는 시연용 API 서버입니다.
모든 데이터는 가상이며, 추천은 규칙표(`app/reference.py`)로만 계산합니다.

## 실행 방법

Python 3.11 이상이 필요합니다.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- 브라우저에서 http://localhost:8000/docs 를 열면 모든 API를 직접 눌러 볼 수 있습니다.
- 시연 전 처음 상태로 되돌리기: `/docs` 에서 `POST /api/demo/reset` 실행.
- 데이터 파일은 `backend/data/demo.db` 에 생깁니다(지워도 다음 실행 때 다시 만들어짐).
- 환경 변수 `DATABASE_URL`(postgresql://…)을 주면 SQLite 대신 그 Postgres(예: Neon 무료)에 저장합니다. 배포한 서버는 이것을 써야 잠들거나 다시 배포돼도 입력이 남습니다.
- Postgres로 시험: `TEST_DATABASE_URL=postgresql://… python -m pytest` (시험마다 표를 지우므로 실제 DB 주소를 넣지 마세요)

## 결과지 인식(OCR)

- 글자가 든 PDF는 추가 설치 없이 바로 읽습니다.
- 사진과 스캔 PDF는 무료 공개 OCR(RapidOCR + PaddleOCR 한국어 모델)로 읽습니다. 쓰려면 한 번만:

```bash
pip install -r requirements-ocr.txt
python -m scripts.get_ocr_models     # backend/models/ 에 한국어 인식 모델(약 13MB)을 받음
```

- 모델이 없으면 사진은 견본 값으로 대신합니다(`ocr.engine: "mock"`).
- 시험용 가상 결과지: `python -m scripts.make_sample_sheet tests/fixtures` (PNG, 기울어진 PNG, PDF).
- 인식은 서버 안에서만 하고 파일은 저장하지 않습니다. 외부 OCR 회사로 보내지 않습니다.

## 테스트

```bash
python -m pytest -q
```

## 파일 구성

| 파일 | 내용 |
|---|---|
| `app/main.py` | API 경로 |
| `app/logic.py` | 해석·추천·중복 점검·변화 비교 계산 |
| `app/reference.py` | `app/seed/` JSON을 읽어 판정 함수와 규칙표로 내보냄 |
| `app/seed/checkup_criteria.json` | 검진 항목 판정 기준(건강검진 실시기준 별표 4와 대조) |
| `app/seed/supplements.json` | 영양제 목록, 고시 1일 섭취량, 섭취 주의사항, 출처·검증 상태 |
| `app/seed/intake_rules.json` | 추천·제외·주의·상한·복용 간격 규칙 (내용 수정은 seed/ 에서) |
| `app/seed/profile_options.json` | 입력 화면 보기(약 계열, 영양제, 생활습관, 질환, 알레르기). 보기만 늘린 것이고 규칙은 intake_rules.json에 있음 |
| `app/options.py` | 보기 목록 API와 입력값 검사 |
| `app/ocr.py` | 결과지 PDF 글자 읽기와 사진 OCR, 항목별 값 찾기 |
| `scripts/get_ocr_models.py` | OCR 한국어 모델 받기(해시 확인) |
| `scripts/make_sample_sheet.py` | 시험용 가상 결과지 만들기 |
| `app/features.py` | 추가 기능 API: 마이데이터 가상 연동, 복용 알림, 중간 검사 기록·리포트 |
| `app/measure.py` | 가정 측정값을 검진 항목 코드로 바꾸는 도우미 |
| `app/db.py` | 저장소와 가상 데이터 |
| `scripts/make_examples.py` | `docs/api-examples.json` 재생성 (`python -m scripts.make_examples ../docs/api-examples.json`) |

API 규격은 [`../docs/api.md`](../docs/api.md) 를 보세요.
