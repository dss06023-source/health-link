import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  Checkup, CheckupItem, IntakeLog, Measurement, MydataResult, MydataState, Recommendation, ReminderTimes, Supplement, Timing, UserProfile,
} from './types'
import { FOLLOWUP_ITEMS, MYDATA_CHECKUP, MYDATA_INSTITUTION, MYDATA_PRESCRIPTIONS, OCR_RESULT, PAST_CHECKUP, SAMPLE_PROFILE, SUPPLEMENT_OPTIONS } from './data/mock'
import { seededMeasurements } from './data/measure'
import { CURRENT_INFO } from './data/rules'
import { USE_API } from './api'
import { AuthError, auth, loadAll, remote } from './api/remote'
import type { Account, RemoteExtras } from './api/remote'

export interface AppState {
  profile: UserProfile | null
  checkups: Checkup[]
  followup: Checkup | null
  supplements: Supplement[]
  intake: IntakeLog
  reservedCenter: { name: string; slot: string } | null
  measurements: Measurement[]
  reminderTimes: ReminderTimes
  mydata: MydataState
}

const DEFAULT_TIMES: ReminderTimes = { morning: '08:00', lunch: '12:30', evening: '19:30' }
const NEW_FIELDS = { measurements: [] as Measurement[], reminderTimes: DEFAULT_TIMES, mydata: { connected: false, lastSyncAt: null } as MydataState }
const byDate = (a: Checkup, b: Checkup) => a.date.localeCompare(b.date)

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
// 내 정보의 '먹고 있는 영양제'와 복용 관리 목록은 하나다(서버 current_supplements와 같은 규칙).
// 보기에 있는 이름은 복용 관리 목록을 따르고, 복용 관리에 없는 보기(유산균 등)는 내 정보에만 남는다.
const isOption = (name: string) => SUPPLEMENT_OPTIONS.includes(name)
function withTaking(current: string[], supplements: Supplement[]) {
  return [...new Set([...current, ...supplements.map((x) => x.name).filter(isOption)])]
}

// 내 정보에서 고른 영양제는 복용 관리에도 넣는다(서버 sync_supplements와 같은 규칙).
// 약·질환과 부딪히는 것도 먹고 있다고 했으니 넣고, 경고는 추천·복용 관리 화면에서 보여 준다.
function syncCurrent(x: AppState): AppState {
  const p = x.profile
  if (!p) return x
  const add = p.currentSupplements.filter((n) => CURRENT_INFO[n] && !x.supplements.some((m) => m.name === n || m.id === CURRENT_INFO[n].id))
  return {
    ...x,
    supplements: [
      ...x.supplements,
      ...add.map((n) => { const i = CURRENT_INFO[n]; return { id: i.id, name: n, ingredient: i.ingredient, dose: i.dose, timing: i.timing, paused: false, startDate: ymd(new Date()) } }),
    ],
  }
}

function fullDemo(): AppState {
  const today = new Date()
  const start = addDays(today, -186)
  const supplements: Supplement[] = [
    { id: 'omega3', name: '오메가-3', ingredient: 'EPA·DHA', dose: '1,000mg', timing: 'morning', paused: false, startDate: ymd(start) },
    { id: 'fiber', name: '난소화성말토덱스트린', ingredient: '식이섬유', dose: '5g', timing: 'lunch', paused: false, startDate: ymd(start) },
    { id: 'milkthistle', name: '밀크씨슬', ingredient: '실리마린', dose: '130mg', timing: 'morning', paused: false, startDate: ymd(start) },
    { id: 'vitd', name: '비타민D', ingredient: '콜레칼시페롤', dose: '1,000IU', timing: 'morning', paused: false, startDate: ymd(start) },
  ]
  const intake = seededIntake(supplements, start, addDays(today, -1))
  intake[ymd(today)] = { milkthistle: true, vitd: true }
  const v = (items: CheckupItem[]) => Object.fromEntries(items.map((i) => [i.code, i.value]))
  const measurements = seededMeasurements(addDays(start, 7), addDays(today, -1), v(OCR_RESULT), v(FOLLOWUP_ITEMS), SAMPLE_PROFILE.heightCm ?? 175)
  return syncCurrent({
    ...NEW_FIELDS,
    measurements,
    profile: { ...SAMPLE_PROFILE, lastCheckupYear: today.getFullYear(), currentSupplements: withTaking(SAMPLE_PROFILE.currentSupplements, supplements) },
    checkups: [PAST_CHECKUP, { id: 'c-now', date: ymd(addDays(start, -2)), source: 'ocr', label: `${today.getFullYear()} 일반건강검진`, items: OCR_RESULT }],
    followup: { id: 'f1', date: ymd(addDays(today, -8)), source: 'followup', label: '6개월 중간 점검', items: FOLLOWUP_ITEMS },
    supplements,
    intake,
    reservedCenter: null,
  })
}

// "처음부터 시연": 검진 전 상태(개인정보 입력부터)
function freshDemo(): AppState {
  return { profile: null, checkups: [PAST_CHECKUP], followup: null, supplements: [], intake: {}, reservedCenter: null, ...NEW_FIELDS }
}

const KEY = 'health-itda-demo-v1'
function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    // 기능이 늘기 전에 저장된 상태에는 새 항목을 기본값으로 채운다.
    if (raw) return syncCurrent({ ...NEW_FIELDS, ...(JSON.parse(raw) as Partial<AppState>) } as AppState)
  } catch { /* 저장소를 못 쓰면 기본 시연 상태로 시작 */ }
  return fullDemo()
}

interface Actions {
  setProfile: (p: UserProfile) => void
  addCheckup: (items: CheckupItem[], source: Checkup['source'], remoteId?: number | null) => void
  addSupplements: (recs: Recommendation[]) => void
  updateSupplement: (id: string, patch: Partial<Supplement>) => void
  removeSupplement: (id: string) => void
  toggleIntake: (date: string, id: string) => void
  reserve: (name: string, slot: string) => void
  addFollowup: () => void
  resetFresh: () => void
  resetFull: () => void
  addMeasurement: (m: Omit<Measurement, 'id'>) => void
  removeMeasurement: (id: string) => void
  setReminderTimes: (t: ReminderTimes) => void
  snooze: (timing: Timing, minutes: number) => void
  mydataConnect: () => void
  mydataDisconnect: () => void
  mydataSync: (applyMedications: boolean) => Promise<MydataResult>
}

// 서버 연결 모드의 계정. undefined는 확인 중, null은 로그인 전.
interface AccountActions {
  account: Account | null | undefined
  login: (username: string, password: string) => Promise<void>
  signup: (username: string, password: string) => Promise<void>
  startGuest: () => Promise<void>
  logout: () => Promise<void>
  deleteAccount: () => Promise<void>
}

// 알림 미루기: `날짜:시간대` → 다시 알릴 시각(ISO). 새로고침하면 사라져도 되는 값이라 저장하지 않는다.
interface Remote { remote: RemoteExtras | null; remoteError: string | null; snoozed: Record<string, string> }
const Ctx = createContext<(AppState & Actions & Remote & AccountActions) | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<AppState>(USE_API ? freshDemo : load)
  const [extras, setExtras] = useState<RemoteExtras | null>(null)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [snoozed, setSnoozed] = useState<Record<string, string>>({})
  const [account, setAccount] = useState<Account | null | undefined>(USE_API ? undefined : null)
  const current = useRef(s)
  useEffect(() => { current.current = s }, [s])
  useEffect(() => { if (!USE_API) try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* 무시 */ } }, [s])

  // 서버 연결 모드: 바꾼 뒤에는 서버 상태를 통째로 다시 읽는다(시연 규모라 충분히 빠르다).
  // 불러오기가 여러 번 겹치면 마지막에 시작한 것만 화면에 반영한다(늦게 도착한 옛 응답이 덮어쓰지 않게).
  const loadSeq = useRef(0)
  // 저장 중인 복용 체크. 서버 응답이 오기 전에 끝난 불러오기에도 이 값을 얹는다.
  const pendingIntake = useRef<Record<string, boolean>>({})
  const withPending = (intake: IntakeLog) => {
    const out = { ...intake }
    for (const [k, v] of Object.entries(pendingIntake.current)) {
      const [date, id] = k.split('|')
      out[date] = { ...out[date], [id]: v }
    }
    return out
  }
  const refresh = useMemo(() => async () => {
    const my = ++loadSeq.current
    try {
      const { state, extras: ex } = await loadAll()
      if (my !== loadSeq.current) return
      set((x) => ({ ...x, ...state, intake: withPending(state.intake), followup: null }))
      setExtras(ex); setRemoteError(null)
    } catch (e) {
      if (e instanceof AuthError) { setAccount(null); return }
      setRemoteError(e instanceof Error ? e.message : '서버에 연결하지 못했습니다.')
    }
  }, [])
  // 처음 열 때 로그인 상태를 확인하고, 로그인돼 있으면 그 사람의 기록을 불러온다.
  useEffect(() => {
    if (!USE_API) return
    auth.me().then((a) => { setAccount(a); refresh() }, (e) => {
      if (e instanceof AuthError) setAccount(null)
      else setRemoteError(e instanceof Error ? e.message : '서버에 연결하지 못했습니다.')
    })
  }, [refresh])
  const run = (p: Promise<unknown>) => {
    p.then(refresh, (e) => { if (e instanceof AuthError) setAccount(null); else setRemoteError(e instanceof Error ? e.message : String(e)) })
  }
  // 계정이 바뀌면 화면의 이전 사람 기록을 비우고 새로 불러온다.
  const enter = async (a: Account) => { set(freshDemo()); setExtras(null); setRemoteError(null); setAccount(a); await refresh() }
  const leave = () => { set(freshDemo()); setExtras(null); setAccount(null) }
  const accountActions: AccountActions = {
    account,
    login: async (u, pw) => enter(await auth.login(u, pw)),
    signup: async (u, pw) => enter(await auth.signup(u, pw)),
    startGuest: async () => enter(await auth.guest()),
    logout: async () => { await auth.logout().catch(() => null); leave() },
    deleteAccount: async () => { await auth.deleteAccount(); leave() },
  }

  const local = useMemo<Actions>(() => ({
    // 내 정보에서 뺀 영양제는 복용 관리에서도 뺀다.
    setProfile: (p) => set((x) => syncCurrent({
      ...x, profile: p,
      supplements: x.supplements.filter((m) => !isOption(m.name) || p.currentSupplements.includes(m.name)),
    })),
    addCheckup: (items, source) => set((x) => {
      const now = new Date()
      const c: Checkup = { id: `c${Date.now()}`, date: ymd(now), source, label: `${now.getFullYear()} 일반건강검진`, items }
      return { ...x, checkups: [...x.checkups, c], profile: x.profile && { ...x.profile, lastCheckupYear: now.getFullYear() } }
    }),
    addSupplements: (recs) => set((x) => ({
      ...x,
      profile: x.profile && { ...x.profile, currentSupplements: withTaking(x.profile.currentSupplements, recs.map((r) => ({ name: r.name } as Supplement))) },
      supplements: [
        ...x.supplements,
        ...recs.filter((r) => !x.supplements.some((s) => s.id === r.id)).map((r) => ({
          id: r.id, name: r.name, ingredient: r.ingredient, dose: r.dose, timing: r.timing, paused: false, startDate: ymd(new Date()),
        })),
      ],
    })),
    updateSupplement: (id, patch) => set((x) => ({ ...x, supplements: x.supplements.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
    removeSupplement: (id) => set((x) => {
      const name = x.supplements.find((m) => m.id === id)?.name
      return {
        ...x,
        supplements: x.supplements.filter((m) => m.id !== id),
        profile: x.profile && { ...x.profile, currentSupplements: x.profile.currentSupplements.filter((n) => n !== name) },
      }
    }),
    toggleIntake: (date, id) => set((x) => ({ ...x, intake: { ...x.intake, [date]: { ...x.intake[date], [id]: !x.intake[date]?.[id] } } })),
    reserve: (name, slot) => set((x) => ({ ...x, reservedCenter: { name, slot } })),
    addFollowup: () => set((x) => ({ ...x, followup: { id: `f${Date.now()}`, date: ymd(new Date()), source: 'followup', label: '6개월 중간 점검(가상)', items: FOLLOWUP_ITEMS } })),
    resetFresh: () => set(freshDemo()),
    resetFull: () => set(fullDemo()),
    addMeasurement: (m) => set((x) => ({ ...x, measurements: [...x.measurements, { ...m, id: `m${Date.now()}` }] })),
    removeMeasurement: (id) => set((x) => ({ ...x, measurements: x.measurements.filter((m) => m.id !== id) })),
    setReminderTimes: (t) => set((x) => ({ ...x, reminderTimes: t })),
    snooze: (timing, minutes) => {
      const until = new Date(Date.now() + minutes * 60000)
      setSnoozed((x) => ({ ...x, [`${ymd(new Date())}:${timing}`]: until.toISOString() }))
    },
    mydataConnect: () => set((x) => ({ ...x, mydata: { connected: true, lastSyncAt: x.mydata.lastSyncAt } })),
    mydataDisconnect: () => set((x) => ({ ...x, mydata: { connected: false, lastSyncAt: x.mydata.lastSyncAt } })),
    mydataSync: async (apply) => {
      await new Promise((r) => setTimeout(r, 700))
      const x = current.current
      const meds = x.profile?.medications ?? []
      const has = x.checkups.some((c) => c.date === MYDATA_CHECKUP.date)
      const result: MydataResult = {
        imported: has ? [] : [{ date: MYDATA_CHECKUP.date, institution: MYDATA_INSTITUTION }],
        skipped: has ? [MYDATA_CHECKUP.date] : [],
        prescriptions: MYDATA_PRESCRIPTIONS.map((p) => ({ ...p, registered: meds.includes(p.name) })),
      }
      const add = apply ? MYDATA_PRESCRIPTIONS.map((p) => p.name).filter((n) => !meds.includes(n)) : []
      set((y) => ({
        ...y,
        checkups: has ? y.checkups : [...y.checkups, MYDATA_CHECKUP].sort(byDate),
        profile: y.profile && add.length ? { ...y.profile, medications: [...y.profile.medications, ...add] } : y.profile,
        mydata: { connected: true, lastSyncAt: ymd(new Date()) },
      }))
      return result
    },
  }), [])

  const actions: Actions = !USE_API ? local : {
    ...local,
    setProfile: (p) => { local.setProfile(p); setAccount((a) => a && { ...a, onboarded: true }); run(remote.saveProfile(p)) },
    addCheckup: (items, source, remoteId) => { if (remoteId != null) run(remote.confirm(remoteId, items)); else local.addCheckup(items, source) },
    addSupplements: (recs) => run(Promise.all(recs.map((r) => remote.addSupplement(r.id)))),
    updateSupplement: (id, patch) => { local.updateSupplement(id, patch); run(remote.patchSupplement(id, patch)) },
    removeSupplement: (id) => { local.removeSupplement(id); run(remote.removeSupplement(id)) },
    // 체크는 화면에 바로 반영하고 저장 요청만 보낸다(전체 다시 불러오기 없음). 실패하면 되돌린다.
    toggleIntake: (date, id) => {
      const x = current.current
      const supp = x.supplements.find((m) => m.id === id)
      if (!supp) return
      const next = !x.intake[date]?.[id]
      const key = `${date}|${id}`
      pendingIntake.current[key] = next
      loadSeq.current++ // 이미 진행 중인 불러오기는 이 체크 전 상태라 버린다
      set((y) => ({ ...y, intake: { ...y.intake, [date]: { ...y.intake[date], [id]: next } } }))
      remote.intake(id, supp.timing, next, date).then(() => {
        if (pendingIntake.current[key] === next) delete pendingIntake.current[key]
      }, (e) => {
        if (pendingIntake.current[key] !== next) return // 그 사이 다시 눌렀으면 새 값을 따른다
        delete pendingIntake.current[key]
        set((y) => ({ ...y, intake: { ...y.intake, [date]: { ...y.intake[date], [id]: !next } } }))
        if (e instanceof AuthError) setAccount(null)
        else setRemoteError(e instanceof Error ? e.message : String(e))
      })
    },
    resetFresh: () => run(remote.reset()),
    resetFull: () => run(remote.reset()),
    addMeasurement: (m) => run(remote.addMeasurement(m)),
    removeMeasurement: (id) => { local.removeMeasurement(id); run(remote.removeMeasurement(id)) },
    setReminderTimes: (t) => { local.setReminderTimes(t); run(remote.saveReminderTimes(t)) },
    snooze: (timing, minutes) => { local.snooze(timing, minutes); run(remote.snooze(timing, minutes)) },
    mydataConnect: () => run(remote.mydataConnect()),
    mydataDisconnect: () => run(remote.mydataDisconnect()),
    mydataSync: async (apply) => { const r = await remote.mydataSync(apply); await refresh(); return r },
  }

  return <Ctx.Provider value={{ ...s, ...actions, ...accountActions, remote: extras, remoteError, snoozed }}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('StoreProvider 밖에서 useStore를 썼습니다.')
  return v
}

// 새로 가입해 검진 결과가 하나도 없을 때는 빈 결과로 대신한다(화면은 hasCheckup으로 안내를 따로 보여 준다).
const NO_CHECKUP: Checkup = { id: 'none', date: '', source: 'sample', label: '검진 결과 없음', items: [] }
export const latestCheckup = (s: AppState) => s.checkups[s.checkups.length - 1] ?? NO_CHECKUP
export const hasCheckup = (s: AppState) => s.checkups.length > 0
