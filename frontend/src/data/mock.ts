import type { Checkup, CheckupCenter, CheckupItem, Timing, UserProfile } from '../types'

// 모든 인물·수치는 시연용 가상 데이터다.
export const SAMPLE_PROFILE: UserProfile = {
  name: '박지훈',
  birthYear: 1980,
  sex: 'M',
  region: '서울 마포구',
  address: { sido: '서울특별시', sigungu: '마포구', roadAddress: '', detailAddress: '' },
  lastCheckupYear: 2024,
  medications: ['아스피린'],
  currentSupplements: ['종합비타민'],
  lifestyle: { smoking: false, smokingStatus: 'past', drinkingPerWeek: 2, drinksPerSession: 4, exercisePerWeek: 1, lowOutdoor: true, sleepHours: 6, diet: ['외식 잦음', '짠 음식'] },
  conditions: [],
  allergies: [],
  heightCm: 175,
}

const units: Record<string, [string, string]> = {
  SBP: ['수축기 혈압', 'mmHg'], DBP: ['이완기 혈압', 'mmHg'], FBS: ['공복 혈당', 'mg/dL'],
  TC: ['총콜레스테롤', 'mg/dL'], LDL: ['LDL 콜레스테롤', 'mg/dL'], HDL: ['HDL 콜레스테롤', 'mg/dL'],
  TG: ['중성지방', 'mg/dL'], AST: ['AST', 'IU/L'], ALT: ['ALT', 'IU/L'], GGT: ['감마지티피', 'IU/L'],
  HB: ['혈색소', 'g/dL'], BMI: ['체질량지수', 'kg/m²'], WAIST: ['허리둘레', 'cm'], EGFR: ['사구체여과율', 'mL/min'],
}

const toItems = (v: Record<string, number>): CheckupItem[] =>
  Object.entries(v).map(([code, value]) => ({ code, name: units[code][0], unit: units[code][1], value }))

export const PAST_CHECKUP: Checkup = {
  id: 'c2024', date: '2024-05-14', source: 'pdf', label: '2024 일반건강검진',
  items: toItems({ SBP: 126, DBP: 80, FBS: 98, TC: 214, LDL: 136, HDL: 45, TG: 172, AST: 33, ALT: 41, GGT: 61, HB: 15.1, BMI: 25.4, WAIST: 89, EGFR: 92 }),
}

// 결과지 촬영 시 OCR이 읽어 냈다고 가정하는 값
export const OCR_RESULT: CheckupItem[] =
  toItems({ SBP: 132, DBP: 84, FBS: 108, TC: 228, LDL: 148, HDL: 42, TG: 214, AST: 38, ALT: 52, GGT: 78, HB: 14.8, BMI: 26.1, WAIST: 92, EGFR: 88 })

// 복용 6개월 뒤 중간 점검(가상 시나리오)
export const FOLLOWUP_ITEMS: CheckupItem[] =
  toItems({ SBP: 126, DBP: 81, FBS: 101, TC: 209, LDL: 137, HDL: 46, TG: 158, AST: 31, ALT: 37, GGT: 56, HB: 14.9, BMI: 25.3, WAIST: 89, EGFR: 89 })

export const CENTERS: CheckupCenter[] = [
  { id: 'h1', name: '하늘내과의원(가상)', address: '서울 마포구 (시연용 주소)', distanceKm: 0.6, slots: ['11/3(화) 08:30', '11/4(수) 09:00', '11/6(금) 08:00'], kind: '의원', exams: ['일반', '위암'], phone: '02-000-0101', lat: 37.5563, lng: 126.9220 },
  { id: 'h2', name: '초록건강검진센터(가상)', address: '서울 마포구 (시연용 주소)', distanceKm: 1.4, slots: ['11/2(월) 08:00', '11/7(토) 08:30'], kind: '의원', exams: ['일반', '위암', '대장암'], phone: '02-000-0102', lat: 37.5480, lng: 126.9135 },
  { id: 'h3', name: '잇다가정의학과(가상)', address: '서울 마포구 (시연용 주소)', distanceKm: 2.1, slots: ['11/5(목) 09:30'], kind: '의원', exams: ['일반', '구강'], phone: '02-000-0103', lat: 37.5660, lng: 126.9010 },
]

// 입력 화면의 보기. 약은 계열로 묶고, 영양제와 상호작용 규칙이 있는 약만 이름을 따로 둔다.
export const MEDICATION_GROUPS: { group: string; items: string[] }[] = [
  { group: '혈압', items: ['혈압약'] },
  { group: '콜레스테롤', items: ['스타틴', '기타 고지혈증약'] },
  { group: '당뇨', items: ['메트포르민', '인슐린', '기타 당뇨약'] },
  { group: '피를 묽게 하는 약', items: ['아스피린', '와파린', '클로피도그렐', '기타 항응고제'] },
  { group: '갑상선', items: ['레보티록신'] },
  { group: '위장', items: ['위산억제제'] },
  { group: '뼈', items: ['골다공증약'] },
  { group: '그 밖의 약', items: ['항생제', '항우울제', '호르몬제·피임약', '항경련제'] },
]
export const MEDICATION_OPTIONS = MEDICATION_GROUPS.flatMap((g) => g.items)
export const SUPPLEMENT_OPTIONS = ['종합비타민', '비타민B군', '비타민C', '비타민D', '비타민K', '칼슘', '마그네슘', '아연', '철분', '엽산', '오메가-3', '유산균', '루테인', '밀크씨슬', '홍국', '코엔자임Q10']
export const CONDITION_OPTIONS = ['고혈압', '당뇨', '이상지질혈증', '간질환', '신장질환', '갑상선질환']
export const ALLERGY_OPTIONS = ['갑각류', '대두', '우유']
export const DIET_OPTIONS = ['아침 거름', '짠 음식', '채식', '유제품 안 먹음', '외식 잦음']

// 마이데이터(가상)로 가져오는 기록. 시연 모드에서만 쓴다(서버 연결 모드는 backend가 돌려준다).
export const MYDATA_CHECKUP: Checkup = {
  id: 'c2022', date: '2022-05-17', source: 'pdf', label: '2022 일반건강검진 (마이데이터)',
  items: toItems({ SBP: 124, DBP: 79, FBS: 96, TC: 206, LDL: 129, HDL: 47, TG: 158, AST: 30, ALT: 36, GGT: 55, HB: 15.2, BMI: 25.0, WAIST: 88, EGFR: 95 }),
}
export const MYDATA_INSTITUTION = '하늘내과의원(가상)'
export const MYDATA_PRESCRIPTIONS = [
  { name: '아스피린', dispensedAt: '2026-09-02', institution: '하늘내과의원(가상)' },
  { name: '스타틴', dispensedAt: '2026-09-02', institution: '하늘내과의원(가상)' },
]

// 모의 모드의 권장 시간대 이유. 서버 모드는 backend/app/seed/supplements.json의 timingReason을 받는다(같은 문구).
export const MOCK_TIMING_GUIDE: Record<string, { timing: Timing; reason: string }> = {
  '오메가-3': { timing: 'morning', reason: '기름에 녹는 성분이라 식사 직후에 먹어야 흡수가 잘 되고 비린 트림도 줄어듭니다. 식후라면 점심·저녁도 괜찮지만 잊지 않도록 아침으로 정했습니다.' },
  '난소화성말토덱스트린': { timing: 'lunch', reason: '식이섬유가 식사 중 당과 지방의 흡수를 늦추는 원리라 식사와 함께 물에 타서 먹습니다. 다른 끼니와 함께여도 되지만 점심으로 정했습니다.' },
  '밀크씨슬': { timing: 'morning', reason: '주성분 실리마린이 물에 잘 녹지 않아 식후에 먹어야 흡수에 유리하고 속도 덜 불편합니다.' },
  '철분': { timing: 'morning', reason: '빈속에 먹을 때 흡수가 가장 잘 됩니다. 커피·차·우유·칼슘제와는 2시간쯤 떨어뜨려 드세요. 속이 불편하면 식후로 바꿔도 됩니다.' },
  '비타민D': { timing: 'morning', reason: '기름에 녹는 비타민이라 지방이 든 식사 뒤에 먹어야 흡수가 잘 됩니다.' },
  '비타민B12': { timing: 'morning', reason: '물에 녹는 비타민이라 언제 먹어도 되지만 잊지 않도록 아침으로 정했습니다.' },
  '비타민C': { timing: 'lunch', reason: '물에 녹는 비타민이라 언제 먹어도 됩니다. 빈속에는 속이 쓰릴 수 있어 점심 식후로 정했습니다.' },
}
