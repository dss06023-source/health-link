import type { Checkup, Measurement, MeasureType, Sex, Status } from '../types'
import { judge } from './rules'

// 중간 점검: 집에서 잰 값을 검진 항목과 같은 기준으로 본다. backend/app/measure.py와 같은 규칙.
export const MEASURE_TYPES: Record<MeasureType, { label: string; fields: { key: string; label: string; unit: string; min: number; max: number }[] }> = {
  bp: { label: '혈압', fields: [{ key: 'sbp', label: '수축기', unit: 'mmHg', min: 60, max: 250 }, { key: 'dbp', label: '이완기', unit: 'mmHg', min: 30, max: 150 }] },
  glucose: { label: '혈당', fields: [{ key: 'fbs', label: '혈당', unit: 'mg/dL', min: 30, max: 600 }] },
  weight: { label: '체중', fields: [{ key: 'weightKg', label: '체중', unit: 'kg', min: 20, max: 300 }] },
  waist: { label: '허리둘레', fields: [{ key: 'waist', label: '허리둘레', unit: 'cm', min: 40, max: 200 }] },
}

export const MEASURE_ITEMS: { code: string; name: string; unit: string; limit: number }[] = [
  { code: 'SBP', name: '수축기 혈압', unit: 'mmHg', limit: 120 },
  { code: 'DBP', name: '이완기 혈압', unit: 'mmHg', limit: 80 },
  { code: 'FBS', name: '공복혈당', unit: 'mg/dL', limit: 100 },
  { code: 'BMI', name: '체질량지수', unit: 'kg/m²', limit: 25 },
  { code: 'WAIST', name: '허리둘레', unit: 'cm', limit: 90 },
]

export const MEASURE_NOTE = '가정 측정값은 측정 기기·시간·자세가 검진과 달라 참고용입니다. 영양제의 효과를 뜻하지 않습니다.'

// 측정 한 건 → 검진 항목 코드 값. 식후 혈당은 공복혈당 기준과 비교하지 않는다.
export function toCodes(m: Measurement, heightCm?: number): Record<string, number> {
  const v = m.values
  if (m.type === 'bp') return { SBP: v.sbp, DBP: v.dbp }
  if (m.type === 'glucose') return m.fasting ? { FBS: v.fbs } : {}
  if (m.type === 'weight') return heightCm ? { BMI: Math.round((v.weightKg / (heightCm / 100) ** 2) * 10) / 10 } : {}
  return { WAIST: v.waist }
}

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const RANK: Record<Status, number> = { normal: 0, caution: 1, danger: 2 }

export interface InterimRow {
  code: string; name: string; unit: string; limit: number
  checkupValue: number | null; checkupStatus: Status | null
  points: { date: string; value: number }[]
  recent: number | null; recentStatus: Status | null
  trend: 'improved' | 'worsened' | 'same' | null; change: number | null
}

// 기준 검진 이후 측정의 최근 days일 평균을 검진 값과 비교한다(최근 기록이 없으면 마지막 3건).
export function interim(ms: Measurement[], base: Checkup, sex: Sex, heightCm: number | undefined, today: string, days = 30): InterimRow[] {
  const from = new Date(`${today}T12:00`); from.setDate(from.getDate() - days + 1)
  const windowStart = ymdLocal(from)
  const after = ms.filter((m) => m.measuredAt.slice(0, 10) >= base.date).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  return MEASURE_ITEMS.map((it) => {
    const points = after.flatMap((m) => {
      const v = toCodes(m, heightCm)[it.code]
      return v === undefined ? [] : [{ date: m.measuredAt.slice(0, 10), value: v }]
    })
    const inWindow = points.filter((p) => p.date >= windowStart).map((p) => p.value)
    const sample = inWindow.length ? inWindow : points.slice(-3).map((p) => p.value)
    const recent = sample.length ? Math.round((sample.reduce((a, b) => a + b, 0) / sample.length) * 10) / 10 : null
    const cv = base.items.find((i) => i.code === it.code)?.value ?? null
    const checkupStatus = cv === null ? null : judge(it.code, cv, sex)
    const recentStatus = recent === null ? null : judge(it.code, recent, sex)
    let trend: InterimRow['trend'] = null, change: number | null = null
    if (recent !== null && cv !== null && checkupStatus && recentStatus) {
      change = Math.round((recent - cv) * 10) / 10
      const r = RANK[recentStatus] - RANK[checkupStatus]
      trend = r < 0 ? 'improved' : r > 0 ? 'worsened' : checkupStatus !== 'normal' && change ? (change < 0 ? 'improved' : 'worsened') : 'same'
    }
    return { ...it, checkupValue: cv, checkupStatus, points, recent, recentStatus, trend, change }
  })
}

// 시연 모드용: 기준 검진값에서 목표값 쪽으로 서서히 움직이는 측정 기록(2주마다 혈압·체중, 4주마다 혈당·허리둘레).
export function seededMeasurements(from: Date, to: Date, start: Record<string, number>, end: Record<string, number>, heightCm: number): Measurement[] {
  const out: Measurement[] = []
  const span = to.getTime() - from.getTime() || 1
  let n = 0
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 14), n++) {
    const t = (d.getTime() - from.getTime()) / span
    const wob = ((n * 5) % 7 - 3) / 3
    const at = (k: string, spread: number) => start[k] + (end[k] - start[k]) * t + wob * spread
    const day = ymdLocal(d)
    const when = `${day}T07:30`
    out.push({ id: `m${day}bp`, type: 'bp', measuredAt: when, values: { sbp: Math.round(at('SBP', 3)), dbp: Math.round(at('DBP', 2)) }, fasting: null })
    out.push({ id: `m${day}w`, type: 'weight', measuredAt: when, values: { weightKg: Math.round(at('BMI', 0.15) * (heightCm / 100) ** 2 * 10) / 10 }, fasting: null })
    if (n % 2 === 0) {
      out.push({ id: `m${day}g`, type: 'glucose', measuredAt: when, values: { fbs: Math.round(at('FBS', 3)) }, fasting: true })
      out.push({ id: `m${day}wa`, type: 'waist', measuredAt: when, values: { waist: Math.round(at('WAIST', 0.6) * 10) / 10 }, fasting: null })
    }
  }
  return out
}
