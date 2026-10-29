import criteria from './checkup_criteria.json'
import schedule from './checkup_schedule.json'
import type {
  CancerScreening, Checkup, CheckupItem, CheckupTarget, ConfirmTest, CurrentReview, InterpretedItem, Recommendation, Sex, Status,
  Supplement, UserProfile, Warning,
} from '../types'

// 국가건강검진(일반) 판정 기준을 단순화한 규칙표. 시연용이며 진단 기준이 아니다.
interface ItemRule {
  code: string
  name: string
  unit: string
  group: string
  plain: Record<Status, string>
}

// 판정 구간은 백엔드와 같은 원본(건강검진 실시기준 별표 4)을 그대로 읽는다.
type Band = { lt?: number; le?: number; status: Status }
type BySex<T> = T | Record<Sex, T>
interface Criterion { low?: BySex<Band[]>; high?: BySex<Band[]>; normalRange: BySex<string> }
const CRITERIA = (criteria as unknown as { items: Record<string, Criterion> }).items

const pickSex = <T,>(v: BySex<T>, sex: Sex): T =>
  v && typeof v === 'object' && !Array.isArray(v) && 'M' in v ? (v as Record<Sex, T>)[sex] : (v as T)
const hits = (b: Band, v: number) => (b.lt !== undefined ? v < b.lt : b.le !== undefined ? v <= b.le : true)

export function judge(code: string, v: number, sex: Sex): Status {
  const c = CRITERIA[code.toLowerCase()]
  if (!c) return 'normal'
  if (c.low) {
    const band = pickSex(c.low, sex).find((b) => hits(b, v))
    if (band) return band.status
  }
  if (!c.high) return 'normal'
  return pickSex(c.high, sex).find((b) => hits(b, v))?.status ?? 'danger'
}

const rangeText = (code: string, sex: Sex) => {
  const c = CRITERIA[code.toLowerCase()]
  return c ? pickSex(c.normalRange, sex) : ''
}

export const ITEM_RULES: ItemRule[] = [
  {
    code: 'SBP', name: '수축기 혈압', unit: 'mmHg', group: '혈압',
    plain: {
      normal: '심장이 피를 내보낼 때의 압력이 적정합니다.',
      caution: '고혈압 전 단계입니다. 짠 음식을 줄이고 걷기를 늘리면 내려갈 수 있습니다.',
      danger: '고혈압이 의심됩니다. 재측정 후 진료를 받아 보세요.',
    },
  },
  {
    code: 'DBP', name: '이완기 혈압', unit: 'mmHg', group: '혈압',
    plain: {
      normal: '심장이 쉴 때의 압력이 적정합니다.',
      caution: '조금 높습니다. 수축기 혈압과 함께 지켜봐야 합니다.',
      danger: '고혈압이 의심됩니다. 진료를 권합니다.',
    },
  },
  {
    code: 'FBS', name: '공복 혈당', unit: 'mg/dL', group: '당뇨',
    plain: {
      normal: '빈속일 때 혈액 속 당이 적정합니다.',
      caution: '공복혈당장애(당뇨 전 단계) 범위입니다. 단 음료와 야식을 줄이는 것이 먼저입니다.',
      danger: '당뇨가 의심됩니다. 확진 검사가 필요합니다.',
    },
  },
  {
    code: 'TC', name: '총콜레스테롤', unit: 'mg/dL', group: '이상지질혈증',
    plain: {
      normal: '혈액 속 콜레스테롤 총량이 적정합니다.',
      caution: '경계 수준입니다. 기름진 음식과 가공육을 줄여 보세요.',
      danger: '높습니다. LDL 수치와 함께 진료가 필요합니다.',
    },
  },
  {
    code: 'LDL', name: 'LDL 콜레스테롤', unit: 'mg/dL', group: '이상지질혈증',
    plain: {
      normal: '혈관 벽에 쌓이는 콜레스테롤이 적정합니다.',
      caution: '경계 수준입니다. 혈관 건강을 위해 관리가 필요합니다.',
      danger: '높습니다. 약물 치료가 필요한지 상담을 받아 보세요.',
    },
  },
  {
    code: 'HDL', name: 'HDL 콜레스테롤', unit: 'mg/dL', group: '이상지질혈증',
    plain: {
      normal: '혈관을 청소하는 좋은 콜레스테롤이 충분합니다.',
      caution: '좋은 콜레스테롤이 조금 부족합니다(경계). 걷기·자전거 같은 유산소 운동이 가장 효과적입니다.',
      danger: '좋은 콜레스테롤이 낮습니다. 유산소 운동이 가장 효과적입니다.',
    },
  },
  {
    code: 'TG', name: '중성지방', unit: 'mg/dL', group: '이상지질혈증',
    plain: {
      normal: '혈액 속 지방이 적정합니다.',
      caution: '경계 수준입니다. 술과 탄수화물 간식을 줄이면 빠르게 내려갑니다.',
      danger: '높습니다. 음주와 단 음식을 줄이고 3~6개월 뒤 다시 확인하세요.',
    },
  },
  {
    code: 'AST', name: 'AST', unit: 'IU/L', group: '간',
    plain: {
      normal: '간세포 손상 지표가 정상입니다.',
      caution: '약간 높습니다. 음주나 과로 여부를 확인해 보세요.',
      danger: '간 손상이 의심됩니다. 진료를 권합니다.',
    },
  },
  {
    code: 'ALT', name: 'ALT', unit: 'IU/L', group: '간',
    plain: {
      normal: '간 기능 지표가 정상입니다.',
      caution: '약간 높습니다. 지방간의 초기 신호일 수 있습니다.',
      danger: '높습니다. 지방간이나 간염 여부 확인이 필요합니다.',
    },
  },
  {
    code: 'GGT', name: '감마지티피', unit: 'IU/L', group: '간',
    plain: {
      normal: '술과 관련된 간 지표가 정상입니다.',
      caution: '음주와 관련이 큰 지표입니다. 주 2회 이상 마신다면 줄여 보세요.',
      danger: '많이 높습니다. 금주와 함께 진료를 받아 보세요.',
    },
  },
  {
    code: 'HB', name: '혈색소', unit: 'g/dL', group: '빈혈',
    plain: {
      normal: '산소를 나르는 혈색소가 적정합니다.',
      caution: '조금 벗어났습니다. 어지러움이 있다면 원인 확인이 필요합니다.',
      danger: '빈혈이 의심됩니다. 원인 검사를 받아 보세요.',
    },
  },
  {
    code: 'BMI', name: '체질량지수', unit: 'kg/m²', group: '비만',
    plain: {
      normal: '키에 비해 체중이 적정합니다.',
      caution: '경계 범위(25~29.9)입니다. 체중의 5%만 줄여도 혈압·혈당이 함께 좋아집니다.',
      danger: '30 이상이거나 18.5 미만입니다. 체중 관리 상담을 받아 보세요.',
    },
  },
  {
    code: 'WAIST', name: '허리둘레', unit: 'cm', group: '비만',
    plain: {
      normal: '복부 비만이 아닙니다.',
      caution: '복부 비만 기준에 가깝습니다.',
      danger: '복부 비만입니다. 내장지방은 혈당·중성지방과 함께 움직입니다.',
    },
  },
  {
    code: 'EGFR', name: '사구체여과율', unit: 'mL/min', group: '신장',
    plain: {
      normal: '콩팥이 노폐물을 잘 거르고 있습니다.',
      caution: '콩팥 기능이 다소 떨어졌습니다.',
      danger: '콩팥 기능 저하가 의심됩니다. 진료가 필요합니다.',
    },
  },
]

export function interpret(items: CheckupItem[], sex: Sex): InterpretedItem[] {
  return items.flatMap((it) => {
    const rule = ITEM_RULES.find((r) => r.code === it.code)
    if (!rule) return []
    const status = judge(it.code, it.value, sex)
    return [{ ...it, status, rangeText: rangeText(it.code, sex), plain: rule.plain[status], group: rule.group }]
  })
}

// 검진 대상 판정. 기준은 checkup_schedule.json(공단 검진대상조회 안내문)이고, 서버 checkup_schedule.py와 같은 규칙이다.
// 일반건강검진: 만 20세 이상, 출생연도 짝·홀이 검진연도와 같은 해에 대상(2년 주기). 나이는 검진연도 - 출생연도.
// 예외: 비사무직 직장가입자는 매년, 공단 조회에서 대상으로 나온 해는 그 결과를 따른다.
type AgeRule = { id: string; name: string; sex?: Sex; ages?: number[]; bands?: number[][]; from?: number; to?: number; every?: number; note?: string }
type CancerRule = { id: string; name: string; test: string; sex?: Sex; minAge: number; maxAge?: number; cycle: string; highRisk?: string; highRiskText?: string; packYears?: number; colonoscopyExcludeYears?: number }
const SCHEDULE = schedule as unknown as {
  ageItems: AgeRule[]; cancers: CancerRule[]
  confirmTest: { targets: { name: string; codes: string[] }[]; where: string }
  notes: Record<'missedLastYear' | 'missedWorker' | 'overLimit', string>
}
export const CANCERS = SCHEDULE.cancers.map((c) => ({ id: c.id, name: c.name }))

const ageHit = (r: AgeRule, age: number, sex: Sex) =>
  (!r.sex || r.sex === sex) && (r.ages ? r.ages.includes(age)
    : r.bands ? r.bands.some(([lo, hi]) => lo <= age && age <= hi)
      : age >= r.from! && age <= (r.to ?? 200) && (age - r.from!) % r.every! === 0)

function cancerScreenings(p: UserProfile, year: number): CancerScreening[] {
  const age = year - p.birthYear
  const parity = p.birthYear % 2 === year % 2 || p.confirmedTargetYear === year
  const smoking = p.lifestyle.smokingStatus ?? (p.lifestyle.smoking ? 'current' : 'never')
  return SCHEDULE.cancers.flatMap((c): CancerScreening[] => {
    if ((c.sex && c.sex !== p.sex) || age < c.minAge || age > (c.maxAge ?? 200)) return []
    const base = { id: c.id, name: c.name, test: c.test }
    if (p.cancerSpecialCase?.includes(c.id)) return [{ ...base, status: 'excluded', note: '암 산정특례자는 해당 암검진에서 빠집니다. 원하면 추가등록할 수 있습니다.' }]
    if (c.colonoscopyExcludeYears && p.colonoscopyYear && year - p.colonoscopyYear < c.colonoscopyExcludeYears)
      return [{ ...base, status: 'excluded', note: `${p.colonoscopyYear}년 대장내시경 뒤 5년이 지나지 않아 빠집니다. 원하면 추가등록할 수 있습니다.` }]
    if ((c.highRisk === 'liver' && !p.liverHighRisk) || (c.highRisk === 'lung' && !((p.packYears ?? 0) >= c.packYears! && smoking !== 'never')))
      return [{ ...base, status: 'highRiskOnly', note: `고위험군만 대상: ${c.highRiskText}` }]
    if (c.highRisk === 'lung' && smoking === 'past')
      return [{ ...base, status: 'maybe', note: '담배를 끊었다면 30갑년 이상으로 폐암검진을 받은 적이 있고 끊은 지 15년 이내일 때만 대상입니다.' }]
    if (c.cycle === 'biennial' && !parity) return [{ ...base, status: 'notThisYear', nextYear: year + 1 }]
    return [{ ...base, status: 'target', ...(c.cycle === 'halfYearly' && { note: '상·하반기 각 1회' }) }]
  })
}

export function checkupTarget(p: UserProfile, today = new Date()): CheckupTarget {
  const year = today.getFullYear()
  const age = year - p.birthYear
  const parity = age >= 20 && p.birthYear % 2 === year % 2
  const yearly = p.jobType === 'nonOffice'
  const reason: CheckupTarget['reason'] = p.confirmedTargetYear === year ? 'confirmed'
    : yearly && age >= 20 ? 'nonOffice' : parity ? 'parity' : null
  const isTarget = reason !== null
  const done = p.lastCheckupYear === year
  const nextYear = isTarget && !done ? year : yearly ? year + 1 : year + (parity ? 2 : 1)
  const deadline = `${year}-12-31`
  const daysLeft = Math.ceil((new Date(`${year}-12-31T23:59:59`).getTime() - today.getTime()) / 86400000)
  // 연령대에 1회인 검사(우울증 35~39세, 40~70대 10년마다)는 해당 연령대를 알려 준다.
  const items = isTarget ? SCHEDULE.ageItems.filter((r) => ageHit(r, age, p.sex)).map(({ id, name, note, bands }) => {
    const band = bands?.find(([lo, hi]) => lo <= age && age <= hi)
    return { id, name, note: band ? `${band[0]}~${band[1]}세 중 1회` : note }
  }) : []
  const notes: string[] = []
  if (done) notes.push(SCHEDULE.notes.overLimit)
  else if (!isTarget && age >= 20 && p.lastCheckupYear !== year - 1) {
    notes.push(SCHEDULE.notes.missedLastYear)
    if (p.jobType === 'office' || p.jobType === 'nonOffice') notes.push(SCHEDULE.notes.missedWorker)
  }
  return { year, isTarget, reason, nextYear, done, deadline, daysLeft, items, cancers: cancerScreenings(p, year), notes }
}

// 가장 최근 검진에서 고혈압·당뇨병 질환의심이면 다음 해 3월 31일까지 확진검사 1회 무료.
export function confirmTest(c: Checkup | undefined, sex: Sex, today = new Date()): ConfirmTest | null {
  if (!c) return null
  const y = Number(c.date.slice(0, 4))
  if (today > new Date(`${y + 1}-03-31T23:59:59`)) return null
  const diseases = SCHEDULE.confirmTest.targets.filter((t) =>
    t.codes.some((code) => { const it = c.items.find((i) => i.code.toLowerCase() === code); return !!it && judge(it.code, it.value, sex) === 'danger' }))
    .map((t) => t.name)
  if (!diseases.length) return null
  return { diseases, deadline: `${y + 1}-03-31`, where: SCHEDULE.confirmTest.where,
    message: `${c.date} 검진에서 ${diseases.join('·')} 질환의심이 나와 ${y + 1}년 3월 31일까지 확진검사를 1회 무료로 받을 수 있습니다.` }
}

// ---- 추천 규칙표 ----
const byCode = (items: InterpretedItem[], code: string) => items.find((i) => i.code === code)
const flagged = (i?: InterpretedItem) => !!i && i.status !== 'normal'

interface RecRule {
  id: string
  name: string
  ingredient: string
  dose: string
  timing: Recommendation['timing']
  claim: string
  when: (items: InterpretedItem[], p: UserProfile) => string[] | null
  reason: string
}

const REC_RULES: RecRule[] = [
  {
    id: 'omega3', name: '오메가-3', ingredient: 'EPA·DHA', dose: '1,000mg', timing: 'evening',
    claim: '혈중 중성지질 개선·혈행 개선에 도움을 줄 수 있음',
    reason: '중성지방이나 LDL 콜레스테롤이 기준보다 높습니다.',
    when: (it) => { const c = ['TG', 'LDL'].filter((k) => flagged(byCode(it, k))); return c.length ? c : null },
  },
  {
    id: 'fiber', name: '난소화성말토덱스트린', ingredient: '식이섬유', dose: '5g', timing: 'lunch',
    claim: '식후 혈당 상승 억제에 도움을 줄 수 있음',
    reason: '공복 혈당이 당뇨 전 단계 범위입니다.',
    when: (it) => (flagged(byCode(it, 'FBS')) ? ['FBS'] : null),
  },
  {
    id: 'milkthistle', name: '밀크씨슬', ingredient: '실리마린', dose: '130mg', timing: 'morning',
    claim: '간 건강에 도움을 줄 수 있음',
    reason: '간 수치(ALT·감마지티피)가 기준보다 높습니다.',
    when: (it) => { const c = ['AST', 'ALT', 'GGT'].filter((k) => flagged(byCode(it, k))); return c.length ? c : null },
  },
  {
    id: 'iron', name: '철분', ingredient: '푸마르산제일철', dose: '12mg', timing: 'morning',
    claim: '체내 산소 운반과 혈액 생성에 필요',
    reason: '혈색소가 기준보다 낮습니다.',
    when: (it, p) => { const hb = byCode(it, 'HB'); const lo = p.sex === 'M' ? 13 : 12; return hb && hb.value < lo ? ['HB'] : null },
  },
  {
    id: 'vitd', name: '비타민D', ingredient: '콜레칼시페롤', dose: '1,000IU', timing: 'morning',
    claim: '뼈의 형성과 유지에 필요',
    reason: '실내 생활이 많아 햇빛으로 만드는 비타민D가 부족하기 쉽습니다.',
    when: (_it, p) => (p.lifestyle.lowOutdoor ? ['생활습관'] : null),
  },
  {
    id: 'b12', name: '비타민B12', ingredient: '시아노코발라민', dose: '2.4µg', timing: 'morning',
    claim: '정상적인 엽산 대사에 필요',
    reason: '메트포르민·위산억제제를 오래 복용하거나 채식을 하면 B12가 부족해지기 쉽습니다.',
    when: (_it, p) => (p.medications.some((m) => m === '메트포르민' || m === '위산억제제') ? ['복용 약']
      : p.lifestyle.diet?.includes('채식') ? ['식습관'] : null),
  },
  {
    id: 'vitc', name: '비타민C', ingredient: '아스코르브산', dose: '100mg', timing: 'lunch',
    claim: '유해산소로부터 세포를 보호하는 데 필요',
    reason: '흡연자는 비타민C 소모가 많습니다.',
    when: (_it, p) => (p.lifestyle.smoking ? ['생활습관'] : null),
  },
]

// 사용자가 이미 먹는 영양제 이름 → 추천 id
export const ALREADY: Record<string, string> = { '오메가-3': 'omega3', '비타민D': 'vitd', '철분': 'iron', '비타민B군': 'b12', '비타민C': 'vitc' }

export function recommend(items: InterpretedItem[], p: UserProfile): Recommendation[] {
  return REC_RULES.flatMap((r) => {
    const codes = r.when(items, p)
    if (!codes) return []
    const rec: Recommendation = {
      id: r.id, name: r.name, ingredient: r.ingredient, dose: r.dose, timing: r.timing,
      reasonCodes: codes, reason: r.reason, claim: r.claim,
    }
    const dup = Object.entries(ALREADY).find(([n, id]) => id === r.id && p.currentSupplements.includes(n))
    if (dup) rec.skipped = `이미 ${dup[0]}을(를) 드시고 있어 추가하지 않습니다.`
    return [rec]
  })
}

// 이미 먹는 영양제(내 정보의 보기) → 복용 관리에 넣을 때 쓰는 정보와 안내용 목적(backend seed/supplements.json의 purpose와 같은 말).
// id가 추천 규칙과 같으면 추천 줄에서 '이미 복용 중'으로 보인다.
export const CURRENT_INFO: Record<string, { id: string; purpose: string; ingredient: string; dose: string; timing: Supplement['timing']; cautions?: string[] }> = {
  '종합비타민': { id: 'multivitamin', purpose: '영양 보충', ingredient: '비타민·무기질', dose: '1정', timing: 'morning' },
  '비타민B군': { id: 'b12', purpose: '에너지 대사', ingredient: '비타민B1·B2·B6·B12', dose: '1정', timing: 'morning' },
  '비타민C': { id: 'vitc', purpose: '항산화', ingredient: '비타민C', dose: '100mg', timing: 'lunch' },
  '비타민D': { id: 'vitd', purpose: '뼈 건강', ingredient: '비타민D', dose: '10μg', timing: 'morning' },
  '비타민K': { id: 'vitamin_k', purpose: '혈액응고와 뼈 건강', ingredient: '비타민K', dose: '70μg', timing: 'morning', cautions: ['항응고제 등을 먹고 있으면 전문가와 상담하세요.'] },
  '칼슘': { id: 'calcium', purpose: '뼈와 치아 건강', ingredient: '칼슘', dose: '300mg', timing: 'evening' },
  '마그네슘': { id: 'magnesium', purpose: '신경과 근육 기능', ingredient: '마그네슘', dose: '100mg', timing: 'evening' },
  '아연': { id: 'zinc', purpose: '면역 기능', ingredient: '아연', dose: '8.5mg', timing: 'lunch' },
  '철분': { id: 'iron', purpose: '혈액 생성', ingredient: '철', dose: '12mg', timing: 'morning' },
  '엽산': { id: 'folic_acid', purpose: '혈액 생성', ingredient: '엽산', dose: '400μg', timing: 'morning' },
  '오메가-3': { id: 'omega3', purpose: '혈중 중성지질과 혈행 개선', ingredient: 'EPA·DHA', dose: '1,000mg', timing: 'evening', cautions: ['항응고제·항혈소판제·혈압강하제 등 의약품을 먹고 있으면 전문가와 상담하세요.'] },
  '유산균': { id: 'probiotics', purpose: '장 건강', ingredient: '프로바이오틱스', dose: '10억 CFU', timing: 'morning', cautions: ['질환이 있거나 의약품을 먹고 있으면 전문가와 상담하세요.'] },
  '루테인': { id: 'lutein', purpose: '눈 건강', ingredient: '루테인', dose: '20mg', timing: 'morning', cautions: ['흡연자는 먹기 전에 전문가와 상담하세요.'] },
  '밀크씨슬': { id: 'milkthistle', purpose: '간 건강', ingredient: '실리마린', dose: '130mg', timing: 'morning' },
  '홍국': { id: 'red_yeast_rice', purpose: '콜레스테롤 관리', ingredient: '모나콜린K', dose: '8mg', timing: 'evening' },
  '코엔자임Q10': { id: 'coq10', purpose: '혈압 관리', ingredient: '코엔자임Q10', dose: '100mg', timing: 'morning' },
}

const josa = (w: string, a: string, b: string) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 === 0 ? b : a }

// 이미 먹는 영양제 중 피해야 하는 조합(backend logic.supplement_warnings의 avoid와 같은 기준). 없으면 빈 배열.
export function avoidReasons(name: string, p: UserProfile, items: InterpretedItem[]): string[] {
  const out: string[] = []
  if (name === '홍국' && p.medications.includes('스타틴')) out.push('홍국에 스타틴과 같은 성분(모나콜린K)이 있어 작용이 겹칩니다.')
  if (name === '홍국' && (p.conditions?.includes('간질환') || ['AST', 'ALT', 'GGT'].some((c) => flagged(byCode(items, c)))))
    out.push('간 수치가 기준 밖이거나 간 질환이 있으면 홍국 섭취를 피해야 합니다.')
  if ((name === '홍국' || name === '루테인') && p.pregnant) out.push(`임신·수유 중에는 ${name} 섭취를 피해야 합니다.`)
  return out
}

// 이미 먹는 영양제 중 추천 구성에 없는 것을 계속 먹어도 되는지 알려 준다(backend logic.review_current와 같은 문구).
export function reviewCurrent(p: UserProfile, items: InterpretedItem[], recs: Recommendation[]): CurrentReview[] {
  return p.currentSupplements.filter((n) => !recs.some((r) => r.name === n || ALREADY[n] === r.id || CURRENT_INFO[n]?.id === r.id)).map((name) => {
    const avoid = avoidReasons(name, p, items)
    if (avoid.length) return { name, status: 'conflict', message: `${avoid.join(' ')} 드시고 있다고 하셔서 복용 관리에는 넣어 두었습니다. 계속 드실지는 의사·약사와 상의하세요.`, cautions: [] }
    const info = CURRENT_INFO[name]
    const cautions = (info?.cautions ?? []).filter((c) => (p.medications.length > 0 && /의약품|항응고제/.test(c)) || (!!p.conditions?.length && c.includes('질환')) || (p.lifestyle.smoking && c.includes('흡연')))
    const lead = info ? `${info.purpose}${josa(info.purpose, '을', '를')} 위해 드신다면 계속 드셔도 됩니다. ` : ''
    return { name, status: 'keep', message: `${lead}입력하신 약·질환·검진 수치와 부딪히는 규칙이 없어 복용 관리에 함께 넣었습니다.${cautions.length ? ' 다만 아래 내용은 확인하세요.' : ''}`, cautions }
  })
}

export function checkWarnings(names: string[], p: UserProfile, items: InterpretedItem[]): Warning[] {
  const has = (n: string) => names.includes(n) || p.currentSupplements.includes(n)
  const med = (m: string) => p.medications.includes(m)
  const w: Warning[] = []
  if (has('오메가-3') && (med('와파린') || med('아스피린') || med('클로피도그렐') || med('기타 항응고제')))
    w.push({ level: 'danger', title: '오메가-3 + 항응고·항혈소판제', detail: '피가 멈추는 시간이 길어질 수 있습니다. 복용 전 담당 의사나 약사와 상의하세요.' })
  if (p.currentSupplements.includes('홍국') && med('스타틴'))
    w.push({ level: 'danger', title: '홍국 + 스타틴', detail: '홍국에 스타틴과 같은 성분(모나콜린K)이 있어 작용이 겹칩니다. 둘 중 하나는 중단을 상의하세요.' })
  if (has('철분') && med('레보티록신'))
    w.push({ level: 'caution', title: '철분 + 갑상선약', detail: '함께 먹으면 갑상선약 흡수가 줄어듭니다. 4시간 이상 간격을 두세요.' })
  if (has('철분') && p.currentSupplements.includes('칼슘'))
    w.push({ level: 'caution', title: '철분 + 칼슘', detail: '서로 흡수를 방해합니다. 아침·저녁으로 나눠 드세요.' })
  if (has('비타민D') && p.currentSupplements.includes('종합비타민'))
    w.push({ level: 'info', title: '비타민D 중복', detail: '종합비타민에도 비타민D가 들어 있습니다. 합친 양이 하루 4,000IU를 넘지 않는지 라벨을 확인하세요.' })
  if (has('밀크씨슬') && p.lifestyle.drinkingPerWeek >= 2)
    w.push({ level: 'info', title: '간 수치는 절주가 먼저', detail: '주 2회 이상 음주하신다면 영양제보다 절주의 효과가 훨씬 큽니다.' })
  if (has('비타민K') && med('와파린'))
    w.push({ level: 'danger', title: '비타민K + 와파린', detail: '비타민K는 와파린의 효과를 약하게 만듭니다. 시작하거나 끊기 전에 담당 의사와 상의하세요.' })
  const minerals = ['칼슘', '철분', '마그네슘', '아연'].filter(has)
  if (minerals.length && med('항생제'))
    w.push({ level: 'caution', title: `${minerals.join('·')} + 항생제`, detail: '일부 항생제(테트라사이클린·퀴놀론 계열)는 미네랄과 함께 먹으면 흡수가 줄어듭니다. 2시간 이상 간격을 두고, 약사에게 확인하세요.' })
  if (minerals.length && med('골다공증약'))
    w.push({ level: 'caution', title: `${minerals.join('·')} + 골다공증약`, detail: '먹는 골다공증약은 다른 것과 함께 먹으면 흡수가 크게 줄어듭니다. 약을 먼저 먹고 최소 30분 뒤에 드세요.' })
  if (has('칼슘') && med('레보티록신'))
    w.push({ level: 'caution', title: '칼슘 + 갑상선약', detail: '함께 먹으면 갑상선약 흡수가 줄어듭니다. 4시간 이상 간격을 두세요.' })
  if (has('마그네슘') && p.conditions?.includes('신장질환'))
    w.push({ level: 'caution', title: '마그네슘 + 신장질환', detail: '콩팥 기능이 떨어져 있으면 마그네슘이 몸에 쌓일 수 있습니다. 복용 전 담당 의사와 상의하세요.' })
  if (has('오메가-3') && p.allergies?.includes('갑각류'))
    w.push({ level: 'caution', title: '갑각류 알레르기', detail: '크릴오일 등 일부 오메가-3 제품은 갑각류가 원료입니다. 원료를 확인하세요.' })
  if (p.pregnant)
    w.push({ level: 'caution', title: '임신·수유 중', detail: '임신·수유 중에는 필요한 영양소와 피해야 할 성분이 다릅니다. 영양제는 산부인과 의사와 상의한 뒤 시작하세요.' })
  if (items.some((i) => i.status === 'danger' && ['SBP', 'FBS', 'LDL', 'EGFR'].includes(i.code)))
    w.push({ level: 'caution', title: '진료가 먼저 필요한 항목이 있습니다', detail: '영양제는 치료를 대신하지 않습니다. 질환의심 항목은 병원에서 먼저 확인하세요.' })
  return w
}

export const TIMING_LABEL: Record<Supplement['timing'], string> = { morning: '아침', lunch: '점심', evening: '저녁' }
export const STATUS_LABEL: Record<Status, string> = { normal: '정상', caution: '경계', danger: '질환의심' }
