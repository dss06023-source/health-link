import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Checkup, CheckupItem, IntakeLog, Recommendation, Supplement, UserProfile } from './types'
import { FOLLOWUP_ITEMS, OCR_RESULT, PAST_CHECKUP, SAMPLE_PROFILE } from './data/mock'

export interface AppState {
  profile: UserProfile | null
  checkups: Checkup[]
  followup: Checkup | null
  supplements: Supplement[]
  intake: IntakeLog
  reservedCenter: { name: string; slot: string } | null
}

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// 날짜 문자열로 결정되는 의사난수(시연 데이터가 새로고침마다 바뀌지 않도록)
const pseudo = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 1000; return h / 1000 }

function seededIntake(supps: Supplement[], from: Date, to: Date): IntakeLog {
  const log: IntakeLog = {}
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    const key = ymd(d)
    log[key] = Object.fromEntries(supps.map((s) => [s.id, pseudo(key + s.id) < 0.87]))
  }
  return log
}

// 첫 화면: 2026년 검진을 이미 올리고 6개월째 복용 중인 상태
function fullDemo(): AppState {
  const today = new Date()
  const start = addDays(today, -186)
  const supplements: Supplement[] = [
    { id: 'omega3', name: '오메가-3', ingredient: 'EPA·DHA', dose: '1,000mg', timing: 'evening', paused: false, startDate: ymd(start) },
    { id: 'fiber', name: '난소화성말토덱스트린', ingredient: '식이섬유', dose: '5g', timing: 'lunch', paused: false, startDate: ymd(start) },
    { id: 'milkthistle', name: '밀크씨슬', ingredient: '실리마린', dose: '130mg', timing: 'morning', paused: false, startDate: ymd(start) },
    { id: 'vitd', name: '비타민D', ingredient: '콜레칼시페롤', dose: '1,000IU', timing: 'morning', paused: false, startDate: ymd(start) },
  ]
  const intake = seededIntake(supplements, start, addDays(today, -1))
  intake[ymd(today)] = { milkthistle: true, vitd: true }
  return {
    profile: { ...SAMPLE_PROFILE, lastCheckupYear: today.getFullYear() },
    checkups: [PAST_CHECKUP, { id: 'c-now', date: ymd(addDays(start, -2)), source: 'ocr', label: `${today.getFullYear()} 일반건강검진`, items: OCR_RESULT }],
    followup: { id: 'f1', date: ymd(addDays(today, -8)), source: 'followup', label: '6개월 중간 점검', items: FOLLOWUP_ITEMS },
    supplements,
    intake,
    reservedCenter: null,
  }
}

// "처음부터 시연": 검진 전 상태(개인정보 입력부터)
function freshDemo(): AppState {
  return { profile: null, checkups: [PAST_CHECKUP], followup: null, supplements: [], intake: {}, reservedCenter: null }
}

const KEY = 'health-itda-demo-v1'
function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as AppState
  } catch { /* 저장소를 못 쓰면 기본 시연 상태로 시작 */ }
  return fullDemo()
}

interface Actions {
  setProfile: (p: UserProfile) => void
  addCheckup: (items: CheckupItem[], source: Checkup['source']) => void
  addSupplements: (recs: Recommendation[]) => void
  updateSupplement: (id: string, patch: Partial<Supplement>) => void
  removeSupplement: (id: string) => void
  toggleIntake: (date: string, id: string) => void
  reserve: (name: string, slot: string) => void
  addFollowup: () => void
  resetFresh: () => void
  resetFull: () => void
}

const Ctx = createContext<(AppState & Actions) | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<AppState>(load)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* 무시 */ } }, [s])

  const actions = useMemo<Actions>(() => ({
    setProfile: (p) => set((x) => ({ ...x, profile: p })),
    addCheckup: (items, source) => set((x) => {
      const now = new Date()
      const c: Checkup = { id: `c${Date.now()}`, date: ymd(now), source, label: `${now.getFullYear()} 일반건강검진`, items }
      return { ...x, checkups: [...x.checkups, c], profile: x.profile && { ...x.profile, lastCheckupYear: now.getFullYear() } }
    }),
    addSupplements: (recs) => set((x) => ({
      ...x,
      supplements: [
        ...x.supplements,
        ...recs.filter((r) => !x.supplements.some((s) => s.id === r.id)).map((r) => ({
          id: r.id, name: r.name, ingredient: r.ingredient, dose: r.dose, timing: r.timing, paused: false, startDate: ymd(new Date()),
        })),
      ],
    })),
    updateSupplement: (id, patch) => set((x) => ({ ...x, supplements: x.supplements.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
    removeSupplement: (id) => set((x) => ({ ...x, supplements: x.supplements.filter((s) => s.id !== id) })),
    toggleIntake: (date, id) => set((x) => ({ ...x, intake: { ...x.intake, [date]: { ...x.intake[date], [id]: !x.intake[date]?.[id] } } })),
    reserve: (name, slot) => set((x) => ({ ...x, reservedCenter: { name, slot } })),
    addFollowup: () => set((x) => ({ ...x, followup: { id: `f${Date.now()}`, date: ymd(new Date()), source: 'followup', label: '6개월 중간 점검(가상)', items: FOLLOWUP_ITEMS } })),
    resetFresh: () => set(freshDemo()),
    resetFull: () => set(fullDemo()),
  }), [])

  return <Ctx.Provider value={{ ...s, ...actions }}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('StoreProvider 밖에서 useStore를 썼습니다.')
  return v
}

export const latestCheckup = (s: AppState) => s.checkups[s.checkups.length - 1]
