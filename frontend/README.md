# 건강잇다 웹 화면 (frontend)

React + Vite + TypeScript. 삼성 One UI 방식으로, 아래 탭 4개(홈·검진·영양·기록)와 흰 바탕에 초록 테두리 묶음으로 구성합니다. 글꼴은 페이퍼로지(본문 400, 제목·버튼·큰 수치 700)입니다.

## 실행

```bash
npm install
npm run dev          # http://localhost:5173 (서버 없이 모의 데이터로 동작)
```

- **서버 연결 모드**: `backend/`에서 `uvicorn app.main:app --port 8000`을 먼저 띄우고, 여기서 `VITE_USE_API=1 npm run dev`로 실행합니다. `/api` 요청이 `http://localhost:8000`으로 전달됩니다. 첫 화면은 로그인·회원가입·체험하기이고, 기록은 계정마다 따로 저장됩니다. 배포판(`Dockerfile`)은 이 모드로 빌드합니다.
- **모의 모드**(기본): 서버 없이 `src/data/`의 가상 데이터와 규칙으로 동작합니다. 모의 모드에서 카카오 지도를 보려면 `VITE_KAKAO_JS_KEY`를 줍니다(없으면 OpenStreetMap).
- `SINGLE=1 npm run build` 는 시연 링크용 단일 HTML 파일을 만듭니다.
- `npm run lint` 는 oxlint 검사입니다.

## 화면

주소는 `#home`, `#results` 같은 해시로 바뀝니다. 한 탭 안의 두 화면은 탭 아래 나눔 버튼으로 오갑니다.

| 탭 | 화면 | 파일 | 내용 |
|---|---|---|---|
| 홈 | 홈 | `src/screens/Home.tsx` | 올해 검진 대상 여부·D-day, 근처 검진기관 목록 |
| | 검진기관 상세 | `src/screens/CenterSheet.tsx` | 아래쪽 창: 지도(카카오 또는 OpenStreetMap), 전화, 길찾기 링크 |
| | 검진 안내 | `src/screens/Guide.tsx` | 공단 「2026년 건강검진 안내」 중 사용자에게 해당하는 주의사항 (`#guide`) |
| 검진 | 결과 해석 | `src/screens/Results.tsx` | 주의 항목 우선, 쉬운 설명, 이전 검진과 비교 |
| | 결과지 등록 | `src/screens/Upload.tsx` | 사진·PDF 업로드(최대 4장), 인식 과정 표시, 인식값 확인·수정, 마이데이터(가상) 불러오기(`Mydata.tsx`) |
| 영양 | 맞춤 추천 | `src/screens/Recommend.tsx` | 규칙표 기반 추천, 제외 이유, 중복·상호작용 경고, 이미 먹는 영양제 점검 |
| | 복용 관리 | `src/screens/Intake.tsx` | 시간대별 체크, 시간대 바꾸기(붐비면 다른 식사 뒤로 나눔), 알림 미리보기, 30일 달력, 일시정지·중단 |
| 기록 | 중간 점검 | `src/screens/Measure.tsx` | 집에서 잰 혈압·혈당·체중·허리둘레 기록, 검진 값과 최근 30일 평균 비교 |
| | 변화 리포트 | `src/screens/Report.tsx` | 두 검진 수치 비교(효과 단정 금지 문구 포함) |
| (첫 화면) | 로그인 | `src/screens/Login.tsx` | 서버 연결 모드에서만: 로그인, 회원가입, 체험하기 |
| (앱 바 버튼) | 내 정보 | `src/screens/Onboarding.tsx` | 처음 입력과 수정: 기본 정보, 키·몸무게, 주소(`AddressField.tsx`), 약·영양제·질환·알레르기, 화면 모드 |

## 그 밖의 파일

| 파일 | 내용 |
|---|---|
| `src/App.tsx` | 탭·화면 전환, 앱 바, 아래 시연 도구 |
| `src/store.tsx` | 화면 상태와 저장(모의 모드는 메모리, 서버 모드는 API) |
| `src/api/index.ts`, `src/api/remote.ts` | 모의/서버 모드 나누기, 서버 API 호출([`docs/api.md`](../docs/api.md) 규격) |
| `src/data/checkup_criteria.json` | 판정 기준(backend `app/seed/`와 같은 원본, 건강검진 실시기준 별표 4) |
| `src/data/checkup_schedule.json` | 검진 대상·검사 기준(backend와 같은 원본) |
| `src/data/rules.ts` | 모의 모드의 해석·추천·경고·시간대 규칙(서버 규칙을 흉내 냄) |
| `src/data/checkupGuide.ts` | 검진 안내 화면 내용 |
| `src/data/measure.ts` | 중간 점검 계산(backend `app/measure.py`와 같은 규칙) |
| `src/data/mock.ts` | 모의 모드의 가상 인물·수치 |
| `src/data/regions.ts` | 시·도, 시·군·구 목록 |
| `src/reminders.tsx` | 복용 알림: 알림 시각이 지났는데 체크하지 않은 영양제가 있으면 화면 아래에 알림(브라우저 알림 허용 시 함께). 서버 모드는 `GET /api/reminders/due` |
| `src/theme.ts` | 화면 모드(기본 밝게, 어둡게, 기기 설정 따르기). 이 브라우저에만 저장 |
| `src/fonts/`, `src/fonts.css` | 페이퍼로지 글꼴(OFL 라이선스 `Paperlogy-OFL.txt`) |
| `src/ui.tsx` | 공통 부품(아이콘, 앱 이름, 아래쪽 창, 면책 문구 등) |

서버 규칙을 바꾸면 `src/data/rules.ts`와 JSON 사본도 함께 고칩니다.

## 시연 도구(화면 맨 아래)

- 서버 연결 모드: 체험 계정이면 **시연 데이터 초기화**(가상 인물 처음 상태로).
- 모의 모드: **처음부터**는 개인정보 입력부터, **완성 상태**는 복용을 이어 온 상태로 되돌립니다.
