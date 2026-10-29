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
| PUT | `/api/users/me` | 시작 화면 입력 저장. 보낸 필드만 바뀜: `name`, `birthYear`, `gender`(M/F), `heightCm`, `lifestyle{…}`(아래 보기의 키, 보낸 키만 바뀜), `medications[]`, `currentSupplements[]`(영양제 id), `conditions[]`, `allergies[]`, `customAllergies[]`(직접 입력), `consent{sensitiveData, agreedAt}`, `location{lat,lng}`. 보기에 없는 값은 422. 보기에 없는 약은 직접 입력으로 저장하고 `unknownMedications`로 알려 줌 |
| GET | `/api/options` | 입력 화면 보기 전체. `medicationGroups[{id, label, items[{name, drugClass, rules}]}]`, `supplements[{id, name, rules}]`, `lifestyle[{key, label, type(choice/multi/number/boolean), options?, min?, max?, sex?}]`, `conditions[{value, label, rules}]`, `allergies[{value, label}]`, `conditionNote`, `customAllowed`. `rules: false`인 보기는 저장만 하고 추천·경고 규칙이 아직 없음 |
| GET | `/api/medications` | 입력 화면의 약 보기 `[{name, drugClass}]`. 예전 이름(아토르바스타틴 등 처방명)은 목록에 없지만 저장하면 규칙이 그대로 적용됨 |
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
항목 코드(15개): `sbp` 수축기 혈압, `dbp` 이완기 혈압, `fbs` 공복혈당, `tc` 총콜레스테롤, `ldl`, `hdl`, `tg` 중성지방, `ast`, `alt`, `ggt` 감마지티피, `hb` 혈색소, `bmi`, `waist` 허리둘레, `creatinine` 혈청 크레아티닌, `egfr` 신사구체여과율. 그룹: 혈압·혈당·지질·간기능·빈혈·비만·신장기능. 샘플 검진에는 앞의 12개만 들어 있습니다.

판정 기준은 「건강검진 실시기준」 별표 4(정상A=`normal`, 정상B(경계)=`caution`, 질환의심=`danger`)를 따르며 `backend/app/seed/checkup_criteria.json` 에 있습니다.

## 4. 맞춤 추천

`GET /api/recommendations?checkupId=` (생략 시 확정된 최신 검진)

```json
{
  "checkupId": 1, "checkupDate": "2024-10-15", "medications": ["아토르바스타틴"],
  "recommendations": [{
    "supplementId": "banaba", "name": "바나바잎 추출물", "ingredients": {"코로솔산": "1.3mg"},
    "dose": "1일 1회 1정", "timing": "아침 식전", "timeSlots": ["morning"],
    "claim": "식후 혈당상승 억제에 도움을 줄 수 있음",
    "dailyIntake": {"ingredient": "코로솔산", "min": 0.45, "max": 1.3, "unit": "mg"},
    "cautions": ["혈당을 낮추는 약을 먹고 있으면 전문가와 상담하세요."], "priority": 1,
    "reasons": [{"code": "fbs", "name": "공복혈당", "value": 108, "unit": "mg/dL", "status": "caution"}],
    "lifestyleReasons": [], "alreadyTaking": false, "warnings": []
  }],
  "excluded": [{"supplementId": "red_yeast_rice", "name": "홍국", "reasons": [], "message": "홍국의 모나콜린K는 스타틴 계열 약과 …추천에서 뺐습니다."}],
  "warnings": [{"type": "duplicate", "level": "info", "supplementId": "vitamin_d", "message": "…"}],
  "notes": [{"items": ["hdl"], "message": "HDL 콜레스테롤을 올리는 기능성을 인정받은 건강기능식품 원료는 없습니다. …"}],
  "disclaimer": "…"
}
```
- `warnings[].type`: `duplicate`(성분 중복) / `interaction`(약물 상호작용, `drugs[]` 포함, 시간 간격이 필요하면 `hours`) / `condition`(검진 수치 때문에 주의) / `diagnosis`(사용자가 고른 진단받은 질환 때문에 주의) / `spacing`(함께 먹는 영양제와 시간 간격, `hours` 포함)
- `excluded` 이유: 약물 상호작용, 검진 수치, 진단받은 질환(`conditions`), 생애주기(`lifestyle.pregnant`·`breastfeeding`·`child` 가 true), 함께 먹지 않도록 묶인 원료(가르시니아·녹차추출물은 하나만).
- `notes`: 기준치 밖이지만 권할 영양제가 없는 항목(HDL, 저체중, 콩팥 수치)의 안내.
- `dailyIntake`: 식약처 고시 1일 섭취량 범위. `cautions`: 제품 표시 섭취 주의사항 요약. 둘 다 `/api/supplements/catalog` 에도 들어 있습니다.
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
| GET | `/api/supplements/check` | 중복 성분 점검 `{duplicates[], interactions[], ok}`. `interactions`는 복용 목록과 입력 화면의 `currentSupplements`(칼슘·비타민K 등 포함)를 모두 약과 대조 |
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

응답에는 두 검진 사이의 가정 측정 기록도 들어 있습니다(그래프용): `"measurements": {"series": {"sbp": [{"date", "value"}], "dbp": [], "fbs": [], "bmi": [], "waist": []}, "count": 71, "note": "…"}`

## 6-1. 중간 검사 (가정 측정)

국가검진은 2년에 한 번이라 그 사이 변화를 가정용 혈압계·혈당계·체중계·줄자로 기록합니다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/measurements/types` | 입력 종류와 허용 범위: `bp{sbp,dbp}`, `glucose{fbs}`, `weight{weightKg}`, `waist{waist}` |
| POST | `/api/measurements` | 기록 `{type, values, measuredAt?: "YYYY-MM-DDTHH:MM", fasting?(혈당은 필수), note?}` → 201. 응답 `codes`(검진 항목으로 바꾼 값: 체중→`bmi`), `judged`(항목별 판정, 3번 형식) |
| GET | `/api/measurements?from&to&type` | 기록 목록(오래된 순) |
| DELETE | `/api/measurements/{id}` | 기록 삭제 |
| GET | `/api/reports/interim?baselineId&days=30` | 중간 점검 리포트. 기준 검진(기본: 확정된 최신) 이후 측정의 최근 `days`일 평균을 검진 값과 비교 |

`/api/reports/interim` 응답 핵심:
```json
{
  "baseline": {"id": 1, "date": "2024-10-15"}, "windowDays": 30,
  "items": [{"code": "sbp", "name": "수축기 혈압", "unit": "mmHg", "checkupValue": 134, "count": 29,
             "recentAverage": 125.8, "recentStatus": "caution", "trend": "improved", "change": -8.2,
             "points": [{"date": "2025-01-15", "value": 131}]}],
  "summary": {"improved": 4, "same": 0, "worsened": 0, "measurementCount": 71, "headline": "검진 이후 가정 측정 71건. …"},
  "adherence": {"rate": 0.84, "recordedFrom": "2026-08-29"},
  "note": "가정 측정값은 측정 기기·시간·자세가 검진과 달라 참고용입니다. 영양제의 효과를 뜻하지 않습니다."
}
```
- 비교 항목: `sbp`, `dbp`, `fbs`(공복일 때만), `bmi`(키는 사용자 정보의 `heightCm`), `waist`. 측정이 없는 항목은 `count: 0`, 나머지 값 `null`.
- 식후 혈당(`fasting: false`)은 기록만 하고 공복혈당 기준으로 판정하지 않습니다.
- 화면에는 `note` 를 꼭 함께 표시해 주세요.

## 6-2. 복용 알림

실제 휴대폰 푸시(서버 발송)는 시연 범위 밖입니다. 화면이 `/api/reminders/due` 를 1분마다 불러, 항목이 있으면 화면 안 알림이나 브라우저 알림(Notification API)을 띄우는 방식입니다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/reminders/settings` | `{enabled, times: {morning: "08:00", lunch: "12:30", evening: "19:00", bedtime: "22:00"}}` |
| PUT | `/api/reminders/settings` | 보낸 값만 변경 `{enabled?, times?: {slot: "HH:MM"}}` |
| GET | `/api/reminders/due?at=` | 지금 보낼 알림. `at`(YYYY-MM-DDTHH:MM, 한국 시간) 생략 시 현재 시각. 응답 `{now, enabled, due[{timeSlot, label, time, items[{supplementId, name}], overdueMinutes, message}], next}` |
| POST | `/api/reminders/snooze` | 미루기 `{timeSlot, minutes=30, at?}` → `{timeSlot, snoozedUntil}` |

- 알림 시각이 지났고 그 시간대에 아직 체크하지 않은 영양제가 있으면 `due` 에 나옵니다. 복용 체크(`POST /api/intake-logs`)를 하면 사라집니다.
- 일시정지한 영양제는 알림에서 빠집니다. `enabled: false` 면 `due` 는 항상 빈 배열입니다.

## 6-3. 마이데이터 연동 (가상)

실제 전송요구·인증은 하지 않고, 정해진 가상 기록을 가져옵니다. 제공처 이름은 `건강정보 고속도로(가상)`.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/mydata` | 연동 상태 `{connected, provider, scopes?, connectedAt?, lastSyncAt?}` |
| POST | `/api/mydata/connect` | 전송 동의 `{agree: true, scopes?: ["checkups", "prescriptions"]}`. `agree: false` 면 422 |
| DELETE | `/api/mydata/connect` | 연동 해제(가져온 기록은 남음) |
| POST | `/api/mydata/sync` | 가져오기 `{applyMedications?: false}`. 동의 전이면 409 |

`sync` 응답: `importedCheckups[{id, date, institution}]`(2022-10-18 검진 1건, `source: "mydata"`), `skippedCheckups`(이미 있는 2024-10-15), `prescriptions[{name, dispensedAt, days, institution, drugClass, alreadyRegistered}]`(아토르바스타틴, 암로디핀), `medications`(현재 복용 약), `message`. `applyMedications: true` 면 목록에 없는 처방 약을 복용 약에 추가합니다. 가져온 검진은 해석 화면 `history`(추이 그래프)에 바로 나타납니다.

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
6. 변화 리포트: 2024 → 2026 비교, 기간 복용률, 그 사이 가정 측정 그래프.
7. 중간 점검(업로드 전에 보여 주기): 2024 검진 이후 혈압·혈당·체중 측정 70건(2025-01부터 매달, 최근 8주는 매주)의 최근 평균을 검진 값과 비교.
8. 복용 알림: 아침 8시가 지나도 체크하지 않으면 알림, 30분 미루기.
9. 마이데이터: 동의 → 가져오기 → 2022년 검진이 추이에 추가, 처방 기록의 암로디핀을 복용 약에 추가할지 안내.

기준치·기능성 문구·상호작용은 시연용 표본이며 실제 서비스 전 전문가 확인이 필요합니다.
