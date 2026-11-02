import type { IntakeLog, Pack, Supplement } from '../types'

// 다 떨어지기 며칠 전부터 재구매를 안내할지(서버 main.REMIND_DAYS와 같은 값)
export const REMIND_DAYS = 7

const day = (s: string) => new Date(`${s}T00:00:00`)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 한 통이 언제 다 떨어지는지(backend main.pack_status와 같은 계산). 서버가 계산해 보냈으면 그 값을 쓴다.
// 하루 먹는 알 수 = 1회 알 수 × 하루 횟수, 남은 알 = 한 통 알 수 − 시작일부터 체크한 복용 × 1회 알 수,
// 다 떨어지는 날 = 오늘 + 버림((남은 알 + 오늘 먹은 알) ÷ 하루 먹는 알 수). 시연 모드는 영양제마다 하루 1번이다.
export function packStatus(x: Supplement, intake: IntakeLog, today = new Date()): Required<Pack> | null {
  const p = x.pack
  if (!p) return null
  if (p.runOutDate && p.daysLeft !== undefined && p.perDay && p.remaining !== undefined && p.remindNow !== undefined) return p as Required<Pack>
  const t = iso(today)
  const perDay = p.perDose
  const takenDays = Object.entries(intake).filter(([d, v]) => d >= p.startedAt && v[x.id]).map(([d]) => d)
  const remaining = Math.max(p.count - takenDays.length * p.perDose, 0)
  const start = p.startedAt > t ? day(p.startedAt) : day(t)
  const extra = iso(start) === t && takenDays.includes(t) ? p.perDose : 0
  const runOut = new Date(start); runOut.setDate(runOut.getDate() + Math.floor((remaining + extra) / perDay))
  const daysLeft = Math.round((runOut.getTime() - day(t).getTime()) / 86400000)
  return { ...p, perDay, remaining, runOutDate: iso(runOut), daysLeft, remindNow: daysLeft <= REMIND_DAYS }
}

// '11월 4일' 같은 짧은 날짜
export const md = (s: string) => `${Number(s.slice(5, 7))}월 ${Number(s.slice(8, 10))}일`
