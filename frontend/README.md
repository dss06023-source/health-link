# 건강잇다 웹 화면 (frontend)

React + Vite + TypeScript. PC는 왼쪽 메뉴, 휴대폰 폭에서는 아래 탭으로 바뀝니다.

## 실행

```bash
npm install
npm run dev          # http://localhost:5173 (모의 데이터로 동작)
```

- 백엔드와 연결해 보려면 `backend/`에서 `uvicorn app.main:app --port 8000`을 먼저 띄우고, 여기서 `VITE_USE_API=1 npm run dev`로 실행합니다. `/api` 요청이 `http://localhost:8000`으로 전달되고, 해석은 같은 기준표로 화면에서, 추천·경고·변화 리포트 문구는 서버 응답을 그대로 씁니다. 왼쪽 아래 "시연 데이터 초기화"는 `POST /api/demo/reset`을 부릅니다.
- `SINGLE=1 npm run build` 는 시연 링크용 단일 HTML 파일을 만듭니다.

## 화면

| 메뉴 | 파일 | 내용 |
|---|---|---|
| 홈 | `src/screens/Home.tsx` | 올해 검진 대상 여부·D-day, 근처 검진기관 예약(시연) |
| 결과지 등록 | `src/screens/Upload.tsx` | 사진·PDF 업로드, 인식 과정 표시, 인식값 확인·수정, 마이데이터(가상) 불러오기(`Mydata.tsx`) |
| 검진 해석 | `src/screens/Results.tsx` | 주의 항목 우선, 쉬운 설명, 이전 검진과 비교 |
| 맞춤 추천 | `src/screens/Recommend.tsx` | 규칙표 기반 추천, 중복·상호작용 경고 |
| 복용 관리 | `src/screens/Intake.tsx` | 시간대별 체크, 알림 미리보기, 30일 달력, 일시정지·중단 |
| 중간 점검 | `src/screens/Measure.tsx` | 집에서 잰 혈압·혈당·체중·허리둘레 기록, 검진 값과 최근 30일 평균 비교 |
| 변화 리포트 | `src/screens/Report.tsx` | 복용 전후 수치 비교(효과 단정 금지 문구 포함) |

- 판정 기준: `src/data/checkup_criteria.json` (backend와 같은 원본, 건강검진 실시기준 별표 4)
- 추천·경고 규칙: `src/data/rules.ts`
- 가상 인물·수치: `src/data/mock.ts`
- 중간 점검 계산: `src/data/measure.ts` (backend `app/measure.py`와 같은 규칙)
- 복용 알림: `src/reminders.tsx` — 알림 시각이 지났는데 체크하지 않은 영양제가 있으면 화면 아래에 알림을 띄웁니다(30초마다 확인, 브라우저 알림 허용 시 함께). 서버 연결 모드는 `GET /api/reminders/due`를 씁니다.
- 마이데이터·중간 점검·알림의 서버 쪽은 backend PR #5에 있습니다.

왼쪽 아래 "처음부터"를 누르면 개인정보 입력부터 시연할 수 있고, "완성 상태"는 6개월 복용 후 상태로 되돌립니다.
