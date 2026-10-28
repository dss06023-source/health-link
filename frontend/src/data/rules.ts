import criteria from './checkup_criteria.json'
import type {
  CheckupItem, CheckupTarget, InterpretedItem, Recommendation, Sex, Status,
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

function judge(code: string, v: number, sex: Sex): Status {
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

// 일반건강검진: 만 20세 이상, 출생연도 짝·홀이 검진연도와 같은 해에 대상(2년 주기).
export function checkupTarget(p: UserProfile, today = new Date()): CheckupTarget {
  const year = today.getFullYear()
  const age = year - p.birthYear
  const isTarget = age >= 20 && p.birthYear % 2 === year % 2
  const deadline = `${year}-12-31`
  const daysLeft = Math.ceil((new Date(`${year}-12-31T23:59:59`).getTime() - today.getTime()) / 86400000)
  const extras: string[] = []
  if (isTarget && age >= 40) extras.push('위암 검진(위내시경)')
  if (isTarget && age >= 50) extras.push('대장암 검진(분변잠혈)')
  if (age === 40 || age === 66) extras.push('생애전환기 검진')
  return { year, isTarget, done: p.lastCheckupYear === year, deadline, daysLeft, extras }
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
    reason: '메트포르민을 오래 복용하면 B12 흡수가 줄어들 수 있습니다.',
    when: (_it, p) => (p.medications.includes('메트포르민') ? ['복용 약'] : null),
  },
  {
    id: 'vitc', name: '비타민C', ingredient: '아스코르브산', dose: '100mg', timing: 'lunch',
    claim: '유해산소로부터 세포를 보호하는 데 필요',
    reason: '흡연자는 비타민C 소모가 많습니다.',
    when: (_it, p) => (p.lifestyle.smoking ? ['생활습관'] : null),
  },
]

// 사용자가 이미 먹는 영양제 이름 → 추천 id
const ALREADY: Record<string, string> = { '오메가-3': 'omega3', '비타민D': 'vitd', '철분': 'iron' }

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

export function checkWarnings(names: string[], p: UserProfile, items: InterpretedItem[]): Warning[] {
  const has = (n: string) => names.includes(n) || p.currentSupplements.includes(n)
  const med = (m: string) => p.medications.includes(m)
  const w: Warning[] = []
  if (has('오메가-3') && (med('와파린') || med('아스피린')))
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
  if (items.some((i) => i.status === 'danger' && ['SBP', 'FBS', 'LDL', 'EGFR'].includes(i.code)))
    w.push({ level: 'caution', title: '진료가 먼저 필요한 항목이 있습니다', detail: '영양제는 치료를 대신하지 않습니다. 빨간색 항목은 병원에서 먼저 확인하세요.' })
  return w
}

export const TIMING_LABEL: Record<Supplement['timing'], string> = { morning: '아침', lunch: '점심', evening: '저녁' }
export const STATUS_LABEL: Record<Status, string> = { normal: '정상', caution: '주의', danger: '관리 필요' }
