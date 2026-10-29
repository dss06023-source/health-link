# 건강잇다 (health-link)

국가건강검진 결과를 근거로 영양제 구성을 제안하고, 복용을 관리한 뒤 다음 검진에서 변화를 확인하는 서비스의 **시연용 프로그램**입니다.

- 시연 주소: https://health-itda.onrender.com (Render 무료, 처음 열 때 1분쯤 걸릴 수 있음)
- 로그인 화면의 **체험하기**를 누르면 가상 인물 `김건강`의 기록으로 바로 시연할 수 있습니다(체험 기록은 2일 뒤 삭제). 회원가입하면 내 기록이 따로 저장됩니다.

## 주요 기능

| 탭 | 화면 | 내용 |
|---|---|---|
| 홈 | 홈, 검진 안내 | 올해 검진 대상 여부, 받을 검사·암검진, 근처 검진기관(건보공단 지정 기관, 지도) |
| 검진 | 결과 해석, 결과지 등록 | 결과지 PDF·사진 인식(무료 OCR, 서버 안에서만 처리), 15개 항목 판정과 쉬운 설명, 이전 검진과 비교 |
| 영양 | 맞춤 추천, 복용 관리 | 검진 수치·복용 약·질환에 맞춘 규칙 기반 추천과 주의, 시간대별 복용 체크, 알림 미리보기 |
| 기록 | 중간 점검, 변화 리포트 | 집에서 잰 혈압·혈당·체중 기록, 두 검진 비교 |

판정 기준은 「건강검진 실시기준」 별표 4, 영양제 섭취량·주의 문구는 식약처 건강기능식품 고시를 따릅니다. 약 정보는 식약처 e약은요·DUR, 검진기관은 건보공단 API, 주소는 행정안전부 도로명주소·카카오 API를 씁니다.

## 폴더

| 폴더 | 내용 |
|---|---|
| `backend/` | API 서버 (Python FastAPI + SQLite, 배포 때는 Postgres). [backend/README.md](backend/README.md) |
| `frontend/` | 웹 화면 (React + Vite + TypeScript). [frontend/README.md](frontend/README.md) |
| `docs/` | [API 규격](docs/api.md)과 [실제 응답 예시](docs/api-examples.json) |
| `Dockerfile`, `render.yaml` | 화면과 서버를 한 주소로 올리는 배포 설정 |

## 내 컴퓨터에서 실행

```bash
# 1) 서버
cd backend && pip install -r requirements.txt && uvicorn app.main:app --port 8000
# 2) 화면 (다른 창에서)
cd frontend && npm install && VITE_USE_API=1 npm run dev     # http://localhost:5173
```

`VITE_USE_API=1` 없이 `npm run dev`만 하면 서버 없이 모의 데이터로 동작합니다. 사진 인식 준비는 [backend/README.md](backend/README.md#결과지-인식ocr)를 보세요.

## 인터넷에 올리기 (Render 무료)

화면과 서버를 한 주소로 올립니다. 설정은 `Dockerfile`, `render.yaml`에 있습니다.

1. [render.com](https://render.com)에 GitHub 계정으로 가입합니다.
2. 대시보드에서 **New → Blueprint**를 누르고 이 저장소를 고릅니다.
3. 키 입력 칸(`DATA_GO_KR_KEY`, `JUSO_API_KEY`, `KAKAO_REST_API_KEY`, `DATABASE_URL`)에 값을 넣고 만듭니다. 키는 저장소에 적지 않습니다.
4. 검진기관 지도를 카카오 지도로 보이려면 Environment에 `KAKAO_JS_KEY`(카카오 JavaScript 키)도 넣습니다. 없으면 키 없는 지도(OpenStreetMap)로 보입니다.
5. 빌드가 끝나면 `https://health-itda.onrender.com` 같은 주소가 생깁니다.
6. 입력을 계속 남기려면 [neon.tech](https://neon.tech)에서 무료 Postgres를 만들고(지역 Singapore), 연결 주소를 `DATABASE_URL`로 넣습니다.

키가 없거나 공공 API 호출이 실패하면 해당 기능은 가상 데이터로 대신합니다. 키가 들어갔는지는 `/api/health`의 `publicApis`로 확인할 수 있습니다(값은 보이지 않음).

무료 조건: 15분 동안 접속이 없으면 잠들고 다음 접속 때 1분쯤 걸려 깨어납니다. `DATABASE_URL`이 없으면 잠들 때 저장 내용이 초기화됩니다. 사진 인식 모델은 서버가 켜질 때 미리 올리지만, CPU가 작아 인식에 시간이 걸릴 수 있습니다.

## 주의

추천은 규칙표로만 계산하며 의학적 진단이 아닙니다. 기준치·기능성 문구·상호작용 규칙은 실제 서비스 전에 전문가 확인이 필요합니다.
