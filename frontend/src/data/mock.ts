import type { Checkup, CheckupCenter, CheckupItem, UserProfile } from '../types'

// 모든 인물·수치는 시연용 가상 데이터다.
export const SAMPLE_PROFILE: UserProfile = {
  name: '박지훈',
  birthYear: 1980,
  sex: 'M',
  region: '서울 마포구',
  lastCheckupYear: 2024,
  medications: ['아스피린'],
  currentSupplements: ['종합비타민'],
  lifestyle: { smoking: false, drinkingPerWeek: 2, exercisePerWeek: 1, lowOutdoor: true },
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
  { id: 'h1', name: '마포연세내과의원', address: '서울 마포구 월드컵북로 21', distanceKm: 0.6, slots: ['11/3(화) 08:30', '11/4(수) 09:00', '11/6(금) 08:00'], tags: ['일반', '위내시경'] },
  { id: 'h2', name: '한빛건강검진센터 홍대점', address: '서울 마포구 양화로 156', distanceKm: 1.4, slots: ['11/2(월) 08:00', '11/7(토) 08:30'], tags: ['일반', '위내시경', '대장'] },
  { id: 'h3', name: '서울숲가정의학과', address: '서울 마포구 서강로 77', distanceKm: 2.1, slots: ['11/5(목) 09:30'], tags: ['일반'] },
]

export const MEDICATION_OPTIONS = ['아스피린', '와파린', '스타틴', '메트포르민', '레보티록신', '혈압약']
export const SUPPLEMENT_OPTIONS = ['종합비타민', '오메가-3', '비타민D', '칼슘', '철분', '홍국']
