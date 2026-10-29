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

## 테스트

```bash
python -m pytest -q
```

## 파일 구성

| 파일 | 내용 |
|---|---|
| `app/main.py` | API 경로 |
| `app/logic.py` | 해석·추천·중복 점검·변화 비교 계산 |
| `app/reference.py` | 기준치, 영양제 목록, 추천·상호작용 규칙표 (내용 수정은 여기서) |
| `app/db.py` | 저장소와 가상 데이터 |
| `scripts/make_examples.py` | `docs/api-examples.json` 재생성 (`python -m scripts.make_examples ../docs/api-examples.json`) |

API 규격은 [`../docs/api.md`](../docs/api.md) 를 보세요.
