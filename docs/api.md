# 건강잇다 시연용 API 규격 (v0.1)

- 주소: `http://localhost:8000` (프론트는 `/api` 를 이 주소로 프록시)
- 형식: JSON, 필드명 camelCase. 인증 없음(가상 사용자 1명).
- 실제 응답 예시 전체: [`api-examples.json`](./api-examples.json) — 프론트 모의 데이터로 그대로 쓸 수 있습니다. 서버를 띄우면 `http://localhost:8000/docs` 에서 직접 호출해 볼 수 있습니다.
- 모든 데이터는 가상입니다. 수치 상태값은 `normal` / `caution` / `danger` 세 가지입니다.
- 오류는 `{"detail": "한국어 메시지"}` 와 HTTP 상태코드(404, 409, 415, 422)로 돌려줍니다.

## 1. 사용자·검진 알림

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/users/me` | 기본 정보 + 검진 알림. `age`, `isTargetThisYear`, `nextCheckupYear`, `checkupDue`(올해 대상인데 미수검), `message`, `lastCheckupDate` |
| PUT | `/api/users/me` | 시작 화면 입력 저장. 보낸 필드만 바뀜: `name`, `birthYear`, `gender`(M/F), `heightCm`, `lifestyle{smoking, drinkingPerWeek, exercisePerWeek, lowSunlight}`, `medications[]`, `consent{sensitiveData, agreedAt}`, `location{lat,lng}` |
| GET | `/api/medications` | 선택 가능한 약 목록 `[{name, drugClass}]` (상호작용 규칙이 있는 약만) |
| GET | `/api/checkup-centers?lat&lng&limit` | 가까운 검진기관(가상) `[{id, name, address, phone, distanceKm, bookingUrl}]`. 좌표 생략 시 사용자 위치 |

대상 연도 규칙: 20세 이상, 출생연도 짝·홀과 올해 짝·홀이 같으면 대상(2년 주기).

## 2. 결과 연동 (모의 OCR)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/checkups/upload` | multipart `file`(PDF 또는 이미지). 항상 같은 2026년 샘플 수치로 `status: "pending_review"` 검진을 만들고 `ocr.fields[{code, name, value, unit, confidence, needsReview}]` 를 돌려줌. 사진이면 HDL·감마지티피에 `needsReview: true` |
| PATCH | `/api/checkups/{id}` | 사용자가 확인·수정. `{values?: {code: number}, date?: "YYYY-MM-DD", confirm: true}` → 해석 상세(아래 3번 형식) 반환 |
| DELETE | `/api/checkups/{id}` | 잘못 올린 결과 삭제 |
| GET | `/api/checkups` | 검진 목록(최신순) `[{id, date, source(pdf/photo), status, fileName, summary}]` |

## 3. 결과 해석

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/checkups/latest` | 확정된 최신 검진 해석 |
| GET | `/api/checkups/{id}` | 검진 해석 |

응답 핵심:
```json
{
  "id": 2, "date": "2026-10-28", "status": "confirmed",
  "summary": {"overall": "caution", "headline": "수축기 혈압, 이완기 혈압, 공복혈당 외 4개 항목이 기준치를 벗어났습니다.", "totalCount": 12, "cautionCount": 7},
  "items": [{
    "code": "sbp", "name": "수축기 혈압", "group": "혈압", "value": 126, "unit": "mmHg",
    "normalRange": "120 미만", "status": "caution", "direction": "high",
    "explanation": "심장이 피를 내보낼 때 혈관에 걸리는 압력입니다. 기준치보다 조금 높습니다. 생활습관 점검을 권합니다.",
    "consultDoctor": false,
    "history": [{"date": "2024-10-15", "value": 134}, {"date": "2026-10-28", "value": 126}]
  }],
  "cautionItems": ["sbp", "dbp", "fbs", "tc", "tg", "alt", "bmi"],
  "values": {"sbp": 126},
  "disclaimer": "…"
}
```
항목 코드(12개): `sbp` 수축기 혈압, `dbp` 이완기 혈압, `fbs` 공복혈당, `tc` 총콜레스테롤, `ldl`, `hdl`, `tg` 중성지방, `ast`, `alt`, `ggt` 감마지티피, `hb` 혈색소, `bmi`. 그룹: 혈압·혈당·지질·간기능·빈혈·비만.

## 4. 맞춤 추천

`GET /api/recommendations?checkupId=` (생략 시 확정된 최신 검진)

```json
{
  "checkupId": 1, "checkupDate": "2024-10-15", "medications": ["아토르바스타틴"],
  "recommendations": [{
    "supplementId": "banaba", "name": "바나바잎 추출물", "ingredients": {"코로솔산": "1.3mg"},
    "dose": "1일 1회 1정", "timing": "아침 식전", "timeSlots": ["morning"],
    "claim": "식후 혈당상승 억제에 도움을 줄 수 있음", "priority": 1,
    "reasons": [{"code": "fbs", "name": "공복혈당", "value": 108, "unit": "mg/dL", "status": "caution"}],
    "lifestyleReasons": [], "alreadyTaking": false, "warnings": []
  }],
  "excluded": [{"supplementId": "red_yeast_rice", "name": "홍국", "reasons": [], "message": "홍국의 모나콜린K는 스타틴 계열 약과 …추천에서 뺐습니다."}],
  "warnings": [{"type": "duplicate", "level": "info", "supplementId": "vitamin_d", "message": "…"}],
  "disclaimer": "…"
}
```
- `warnings[].type`: `duplicate`(성분 중복) / `interaction`(약물 상호작용, `drugs[]` 포함) / `condition`(검진 수치 때문에 주의)
- `warnings[].level`: `info` / `caution`. `avoid` 등급은 `excluded` 로 빠짐.
- 같은 입력이면 항상 같은 결과(규칙표 기반).

## 5. 복용 관리

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/supplements/catalog` | 선택 가능한 영양제 전체 |
| GET | `/api/supplements?includeEnded=false` | 복용 중 목록 `[{id, supplementId, name, ingredients, dose, claim, timeSlots, paused, startedAt, endedAt, source}]` |
| POST | `/api/supplements` | 추가 `{supplementId, timeSlots?, source?}` → 201. 이미 복용 중이면 409 |
| PATCH | `/api/supplements/{id}` | 시간대 변경·일시정지 `{timeSlots?, paused?}` |
| DELETE | `/api/supplements/{id}` | 복용 중단(기록은 남김) |
| GET | `/api/supplements/check` | 중복 성분 점검 `{duplicates[], interactions[], ok}` |
| GET | `/api/intake-logs/today?date=` | 오늘 체크 목록 `{date, items[{supplementId, name, timeSlot, taken}], takenCount, scheduledCount, rate}` |
| POST | `/api/intake-logs` | 복용 체크 `{supplementId, timeSlot, taken=true, date?}` → 오늘 체크 목록 반환 |
| GET | `/api/intake-logs?from&to` | 달력용 기록(기본 최근 30일) `{logs[], daily[{date, scheduled, taken, rate}], rate, recordedFrom}` |

`supplementId` 는 두 가지입니다: 영양제 종류는 문자열(`"omega3"`), 복용 목록의 한 줄은 숫자 `id`. 복용 체크·수정에는 숫자 `id` 를 씁니다.
시간대(`timeSlot`): `morning` / `lunch` / `evening` / `bedtime`.

## 6. 변화 리포트

`GET /api/reports/compare?from=&to=` (검진 id. 생략 시 확정된 최근 2건)

```json
{
  "from": {"id": 1, "date": "2024-10-15"}, "to": {"id": 2, "date": "2026-10-28"},
  "items": [{"code": "ldl", "name": "LDL 콜레스테롤", "unit": "mg/dL", "normalRange": "130 미만",
             "before": 152, "after": 128, "change": -24, "beforeStatus": "caution", "afterStatus": "normal",
             "statusChanged": true, "trend": "improved"}],
  "summary": {"improved": 9, "same": 3, "worsened": 0, "headline": "기준치에 가까워진 항목 9개, 멀어진 항목 0개입니다."},
  "note": "검진 수치는 식사·운동·음주·약 등 여러 요인의 영향을 받습니다. 이 비교는 영양제의 효과를 뜻하지 않습니다.",
  "supplementsDuring": [{"id": 1, "supplementId": "omega3", "name": "오메가-3", "startedAt": "2024-11-01", "endedAt": null}],
  "adherence": {"rate": 0.84, "recordedFrom": "2026-08-29", "daily": []}
}
```
`trend`: 판정 등급이 바뀌면 그 방향, 등급이 같으면 기준치 쪽으로 움직였는지로 정합니다. 화면에는 `note` 를 함께 표시해 주세요(영양제 효과로 단정하는 표현 금지).

## 7. 시연 도구

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/demo/reset` | 가상 데이터를 처음 상태로 되돌림(리허설마다 사용) |
| GET | `/api/health` | 서버 상태 확인 |

## 시연 시나리오와 데이터

1. 시작: `김건강`(가상, 1986년생 남성, 스타틴 복용). 2024년 검진 1건, 영양제 4개 복용 중, 최근 60일 복용 기록. 올해 대상인데 미수검 → 알림 표시.
2. 결과지 업로드 → 모의 OCR → 확인 후 확정 → 알림이 사라지고 다음 검진 2028년.
3. 해석: 12개 항목 중 7개 주의.
4. 추천: 바나바잎·오메가-3 등. 홍국은 스타틴과 겹쳐 제외, 가르시니아는 간 수치 때문에 제외, 비타민D는 종합비타민과 성분 중복 안내.
5. 복용 관리: 오늘 체크, 일시정지, 중복 성분 점검.
6. 변화 리포트: 2024 → 2026 비교, 기간 복용률.

기준치·기능성 문구·상호작용은 시연용 표본이며 실제 서비스 전 전문가 확인이 필요합니다.
