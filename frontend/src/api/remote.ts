import type { JobType,
  Address, AddressHit, CenterPlace, Checkup, CheckupCenter, CheckupItem, CurrentReview, IntakeLog, Measurement, MydataResult, MydataState, Recommendation, ReminderTimes,
  Supplement, Timing, UserProfile, Warning,
} from '../types'
import type { UploadResult } from './index'
import { regionLabel } from '../data/regions'

// backend/(FastAPI, docs/api.md) 응답을 화면이 쓰는 모양으로 바꾼다.
const BASE = import.meta.env.VITE_API_BASE ?? ''

// 로그인이 안 됐거나 세션이 끝났을 때(401). 화면은 이것을 받으면 로그인 화면으로 간다.
export class AuthError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null) as { detail?: string } | null
    const message = typeof err?.detail === 'string' ? err.detail : `${path} 요청 실패 (${res.status})`
    if (res.status === 401 && !path.startsWith('/api/auth/login')) throw new AuthError(message)
    throw new Error(message)
  }
  return res.json() as Promise<T>
}
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

type Slot = Timing | 'bedtime'
const toTiming = (slots: Slot[]): Timing => (slots[0] === 'bedtime' ? 'evening' : slots[0] ?? 'morning')
const firstEntry = (o: Record<string, string>) => Object.entries(o)[0] ?? ['', '']

interface RUser {
  name: string; birthYear: number; gender: 'M' | 'F'; heightCm?: number | null; weightKg?: number | null; medications: string[]; lastCheckupDate: string | null
  jobType?: JobType; confirmedTargetYear?: number | null
  address?: Address
  onboarded?: boolean // 새로 가입한 계정은 false. 시작 화면을 먼저 보여 준다.
  liverHighRisk?: boolean; packYears?: number | null; cancerSpecialCase?: string[]; colonoscopyYear?: number | null
  currentSupplements?: string[]; conditions?: string[]; allergies?: string[]; customAllergies?: string[]
  lifestyle: {
    smoking: boolean | 'never' | 'past' | 'current'; drinkingPerWeek: number; exercisePerWeek: number; lowSunlight: boolean
    drinksPerSession?: number; sleepHours?: number; diet?: string[]; pregnant?: boolean; breastfeeding?: boolean
  }
}
interface ROptions {
  supplements: { id: string; name: string }[]
  lifestyle: { key: string; options?: { value: string; label: string }[] }[]
  conditions: { value: string; label: string }[]
  allergies: { value: string; label: string }[]
}

// 입력 화면은 보기 이름(한글)을 쓰고 서버는 코드를 쓴다. GET /api/options로 둘을 잇는다.
// 약 이름은 서버와 화면이 같아서 바꾸지 않는다.
const codes = { supplement: new Map<string, string>(), condition: new Map<string, string>(), allergy: new Map<string, string>(), diet: new Map<string, string>() }
const loadOptions = (o: ROptions) => {
  codes.supplement = new Map(o.supplements.map((x) => [x.name, x.id]))
  codes.condition = new Map(o.conditions.map((x) => [x.label, x.value]))
  codes.allergy = new Map(o.allergies.map((x) => [x.label, x.value]))
  codes.diet = new Map((o.lifestyle.find((f) => f.key === 'diet')?.options ?? []).map((x) => [x.label, x.value]))
}
const toCode = (m: Map<string, string>, labels: string[] = []) => labels.flatMap((l) => (m.has(l) ? [m.get(l)!] : []))
const toLabel = (m: Map<string, string>, values: string[] = []) => {
  const back = new Map([...m].map(([l, v]) => [v, l]))
  return values.flatMap((v) => (back.has(v) ? [back.get(v)!] : []))
}
interface RCheckupRow { id: number; date: string; source: string; status: string }
interface RCheckup { id: number; date: string; source: string; items: { code: string; name: string; value: number; unit: string }[] }
interface RSupp { id: number; supplementId: string; name: string; ingredients: Record<string, string>; timeSlots: Slot[]; recommendedSlots?: Slot[]; altSlots?: Slot[]; timingReason?: string; slotNote?: string | null; paused: boolean; startedAt: string }
interface RReason { code: string; name: string; value: number; unit: string }
interface RWarning { level: 'info' | 'caution'; message: string; type: string; ingredient?: string; drugs?: string[] }
interface RRec {
  supplementId: string; name: string; ingredients: Record<string, string>; timeSlots: Slot[]; claim: string
  reasons: RReason[]; lifestyleReasons: string[]; alreadyTaking: boolean
}
interface RRecs { recommendations: RRec[]; excluded: { name: string; message: string }[]; warnings: (RWarning & { supplementId?: string })[]; notes?: { message: string }[]
  current?: { name: string; status: 'keep' | 'conflict'; message: string; cautions: string[] }[]
  purchaseChecks?: { type: 'avoid' | 'caution' | 'amount'; check: string; message: string }[] }

export interface RemoteExtras {
  checkupIds: Record<string, number>
  recs: Recommendation[]
  current: CurrentReview[]
  purchaseChecks: Warning[]
  warnings: Warning[]
  notes: string[]
  medOptions: string[]
  compareNote: string | null
}

const smokingStatus = (v: RUser['lifestyle']['smoking']) => (v === true ? 'current' : v === false ? 'never' : v)

const mapCheckup = (c: RCheckup): Checkup => ({
  id: String(c.id), date: c.date, source: c.source === 'photo' ? 'ocr' : 'pdf',
  label: `${c.date.slice(0, 4)} 일반건강검진`,
  items: c.items.map((i) => ({ code: i.code.toUpperCase(), name: i.name, value: i.value, unit: i.unit })),
})

const WARN_TITLE: Record<string, string> = { duplicate: '성분 중복', interaction: '약과 함께 먹을 때 주의', condition: '검진 수치 때문에 주의', spacing: '복용 간격' }
// 제품 살 때 확인할 성분: 피해야 할 원료(avoid)는 빨강, 상의할 원료(caution)는 노랑, 상한에 가까운 성분(amount)은 안내.
const CHECK_LEVEL = { avoid: 'danger', caution: 'caution', amount: 'info' } as const
const mapWarning = (w: RWarning): Warning => ({
  level: w.level,
  title: w.type === 'duplicate' && w.ingredient ? `${w.ingredient} 중복`
    : w.type === 'interaction' && w.drugs?.length ? `${w.drugs.join('·')}과 함께 복용` : WARN_TITLE[w.type] ?? '확인 필요',
  detail: w.message,
})

export async function loadAll() {
  const today = new Date()
  const from = new Date(today); from.setDate(from.getDate() - 40)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` // 기기 날짜(한국 시간). UTC로 바꾸면 새벽에 오늘 기록이 빠진다.
  const [user, rows, supps, logs, recs, meds, ms, reminder, mydata, options] = await Promise.all([
    call<RUser>('/api/users/me'),
    call<RCheckupRow[]>('/api/checkups'),
    call<RSupp[]>('/api/supplements'),
    call<{ logs: { date: string; supplementId: number; taken: boolean }[] }>(`/api/intake-logs?from=${iso(from)}&to=${iso(today)}`),
    call<RRecs>('/api/recommendations').catch(() => null),
    call<{ name: string }[]>('/api/medications'),
    call<Measurement[]>('/api/measurements'),
    call<{ times: Record<string, string> }>('/api/reminders/settings'),
    call<MydataState>('/api/mydata'),
    call<ROptions>('/api/options'),
  ])
  loadOptions(options)
  // 서버 목록은 최신순(날짜·번호 내림차순)이다. 같은 날 올린 검진도 나중에 올린 것이 마지막이 되게 번호로 한 번 더 정렬한다.
  const confirmed = rows.filter((r) => r.status === 'confirmed').sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  const checkups = (await Promise.all(confirmed.map((r) => call<RCheckup>(`/api/checkups/${r.id}`)))).map(mapCheckup)
  const compare = checkups.length >= 2
    ? await call<{ note: string }>('/api/reports/compare').catch(() => null) : null

  const L = user.lifestyle
  const profile: UserProfile = {
    name: user.name, birthYear: user.birthYear, sex: user.gender,
    region: user.address ? regionLabel(user.address.sido, user.address.sigungu) : '서울', address: user.address,
    lastCheckupYear: user.lastCheckupDate ? Number(user.lastCheckupDate.slice(0, 4)) : null,
    medications: user.medications, currentSupplements: toLabel(codes.supplement, user.currentSupplements),
    lifestyle: {
      smoking: L.smoking === true || L.smoking === 'current', smokingStatus: smokingStatus(L.smoking),
      drinkingPerWeek: L.drinkingPerWeek, drinksPerSession: L.drinksPerSession, exercisePerWeek: L.exercisePerWeek,
      lowOutdoor: L.lowSunlight, sleepHours: L.sleepHours, diet: toLabel(codes.diet, L.diet),
    },
    conditions: toLabel(codes.condition, user.conditions),
    allergies: [...toLabel(codes.allergy, user.allergies), ...(user.customAllergies ?? [])],
    pregnant: !!(L.pregnant || L.breastfeeding),
    heightCm: user.heightCm ?? undefined, weightKg: user.weightKg ?? undefined,
    jobType: user.jobType, confirmedTargetYear: user.confirmedTargetYear ?? null,
    liverHighRisk: !!user.liverHighRisk, packYears: user.packYears ?? null,
    cancerSpecialCase: user.cancerSpecialCase ?? [], colonoscopyYear: user.colonoscopyYear ?? null,
  }
  const supplements: Supplement[] = supps.map((x) => {
    const [ing, amt] = firstEntry(x.ingredients)
    return { id: String(x.id), name: x.name, ingredient: ing, dose: amt, timing: toTiming(x.timeSlots), paused: x.paused, startDate: x.startedAt,
      recommendedTiming: x.recommendedSlots && toTiming(x.recommendedSlots), timingReason: x.timingReason,
      altTimings: x.altSlots?.map((slot) => toTiming([slot])), slotNote: x.slotNote }
  })
  const intake: IntakeLog = {}
  for (const l of logs.logs) (intake[l.date] ??= {})[String(l.supplementId)] = l.taken

  const extras: RemoteExtras = {
    checkupIds: Object.fromEntries(checkups.map((c) => [c.id, Number(c.id)])),
    recs: (recs?.recommendations ?? []).map((r) => {
      const [ing, amt] = firstEntry(r.ingredients)
      return {
        id: r.supplementId, name: r.name, ingredient: ing, dose: amt, timing: toTiming(r.timeSlots),
        reasonCodes: [...r.reasons.map((x) => x.code.toUpperCase()), ...(r.lifestyleReasons.length ? ['생활습관'] : [])],
        reason: [...r.reasons.map((x) => `${x.name} ${x.value}${x.unit}`), ...r.lifestyleReasons].join(' · '),
        claim: r.claim,
        skipped: r.alreadyTaking ? '이미 복용 중입니다.' : undefined,
      }
    }),
    current: (recs?.current ?? []).map((c) => ({ name: c.name, status: c.status, message: c.message, cautions: c.cautions })),
    purchaseChecks: (recs?.purchaseChecks ?? []).map((c): Warning => ({ level: CHECK_LEVEL[c.type], title: c.check, detail: c.message })),
    warnings: [
      ...(recs?.excluded ?? []).map((e): Warning => ({ level: 'danger', title: `${e.name} 제외`, detail: e.message })),
      ...(recs?.warnings ?? []).map(mapWarning),
    ],
    notes: (recs?.notes ?? []).map((n) => n.message),
    // 마이데이터로 들어온 처방명(아토르바스타틴 등)은 보기에 없으므로 뒤에 붙인다.
    medOptions: [...meds.map((m) => m.name), ...user.medications.filter((m) => !meds.some((x) => x.name === m))],
    compareNote: compare?.note ?? null,
  }
  const measurements: Measurement[] = ms.map((m) => ({ id: String(m.id), type: m.type, measuredAt: m.measuredAt, values: m.values, fasting: m.fasting }))
  const reminderTimes: ReminderTimes = { morning: reminder.times.morning, lunch: reminder.times.lunch, evening: reminder.times.evening }
  return {
    state: { profile: user.onboarded === false ? null : profile, checkups, supplements, intake, measurements, reminderTimes, mydata: { connected: mydata.connected, lastSyncAt: mydata.lastSyncAt ?? null } },
    extras,
  }
}

export const remote = {
  getCenters: async (): Promise<CheckupCenter[]> =>
    (await call<{ id: number | string; name: string; address: string; distanceKm: number; bookingUrl: string; kind?: string | null; exams?: string[]; phone?: string | null; lat: number; lng: number }[]>('/api/checkup-centers'))
      .map((c) => ({ id: String(c.id), name: c.name, address: c.address, distanceKm: c.distanceKm, slots: [], kind: c.kind ?? undefined, exams: c.exams ?? [],
        bookingUrl: c.bookingUrl, phone: c.phone ?? undefined, lat: c.lat, lng: c.lng })),
  getCenterPlace: (c: CheckupCenter) =>
    call<CenterPlace>(`/api/checkup-centers/place?${new URLSearchParams({ name: c.name, lat: String(c.lat), lng: String(c.lng) })}`),
  getConfig: () => call<{ kakaoJsKey: string | null }>('/api/config'),
  // 못 찾은 항목은 missing, 다시 볼 값은 needsReview로 온다. 수치를 하나도 못 찾으면 422(detail에 안내 문구).
  upload: async (files: File[]): Promise<UploadResult> => {
    const body = new FormData(); files.forEach((f) => body.append('files', f))
    const r = await call<{ id: number; ocr: { engine?: string; fields: (CheckupItem & { needsReview?: boolean })[]; missing?: CheckupItem[]; message?: string | null } }>('/api/checkups/upload', { method: 'POST', body })
    const item = (f: Pick<CheckupItem, 'code' | 'name' | 'unit'>, value: number) => ({ code: f.code.toUpperCase(), name: f.name, value, unit: f.unit })
    return {
      id: r.id,
      items: r.ocr.fields.map((f) => item(f, f.value)),
      missing: (r.ocr.missing ?? []).map((f) => item(f, NaN)),
      review: r.ocr.fields.filter((f) => f.needsReview).map((f) => f.code.toUpperCase()),
      engine: r.ocr.engine ?? null,
      message: r.ocr.message ?? null,
    }
  },
  confirm: (id: number, items: CheckupItem[]) =>
    call(`/api/checkups/${id}`, json('PATCH', { values: Object.fromEntries(items.map((i) => [i.code.toLowerCase(), i.value])), confirm: true })),
  // 보기에 없는 영양제·질환은 서버가 받지 않아 빼고 보낸다. 직접 입력한 알레르기는 customAllergies로 보낸다.
  // 화면은 임신·수유를 한 값으로 묻기 때문에, 둘 다 같은 값으로 보내 피해야 할 영양제를 넓게 뺀다.
  saveProfile: (p: UserProfile) => {
    const L = p.lifestyle
    const pregnant = p.sex === 'F' && !!p.pregnant
    return call('/api/users/me', json('PUT', {
      name: p.name, birthYear: p.birthYear, gender: p.sex, medications: p.medications,
      ...(p.heightCm && { heightCm: p.heightCm }), ...(p.weightKg && { weightKg: p.weightKg }),
      ...(p.address?.sido && { address: p.address }),
      ...(p.jobType && { jobType: p.jobType }), confirmedTargetYear: p.confirmedTargetYear ?? 0,
      liverHighRisk: !!p.liverHighRisk, packYears: p.packYears ?? 0, cancerSpecialCase: p.cancerSpecialCase ?? [], colonoscopyYear: p.colonoscopyYear ?? 0,
      currentSupplements: toCode(codes.supplement, p.currentSupplements),
      conditions: toCode(codes.condition, p.conditions),
      allergies: toCode(codes.allergy, p.allergies),
      customAllergies: (p.allergies ?? []).filter((a) => !codes.allergy.has(a)),
      lifestyle: {
        smoking: L.smokingStatus ?? L.smoking, drinkingPerWeek: L.drinkingPerWeek, exercisePerWeek: L.exercisePerWeek, lowSunlight: L.lowOutdoor,
        ...(L.drinksPerSession !== undefined && { drinksPerSession: L.drinksPerSession }),
        ...(L.sleepHours !== undefined && { sleepHours: L.sleepHours }),
        diet: toCode(codes.diet, L.diet),
        pregnant, breastfeeding: pregnant,
      },
    }))
  },
  addSupplement: (supplementId: string) =>
    call('/api/supplements', json('POST', { supplementId, source: 'recommendation' })).catch(() => null), // 이미 복용 중이면 409
  patchSupplement: (id: string, patch: { timing?: Timing; paused?: boolean }) =>
    call(`/api/supplements/${id}`, json('PATCH', { ...(patch.timing && { timeSlots: [patch.timing] }), ...(patch.paused !== undefined && { paused: patch.paused }) })),
  removeSupplement: (id: string) => call(`/api/supplements/${id}`, { method: 'DELETE' }),
  intake: (id: string, timing: Timing, taken: boolean, date: string) =>
    call('/api/intake-logs', json('POST', { supplementId: Number(id), timeSlot: timing, taken, date })),
  reset: () => call('/api/demo/reset', { method: 'POST' }),
  searchAddress: async (q: string) =>
    (await call<{ items: AddressHit[] }>(`/api/address/search?${new URLSearchParams({ q })}`)).items,

  // 중간 점검(가정 측정)
  addMeasurement: (m: Omit<Measurement, 'id'>) =>
    call('/api/measurements', json('POST', { type: m.type, values: m.values, measuredAt: m.measuredAt, fasting: m.fasting ?? undefined })),
  removeMeasurement: (id: string) => call(`/api/measurements/${id}`, { method: 'DELETE' }),

  // 복용 알림
  saveReminderTimes: (times: ReminderTimes) => call('/api/reminders/settings', json('PUT', { times })),
  dueReminders: () => call<{ due: { timeSlot: string; time: string; items: { supplementId: number; name: string }[] }[] }>('/api/reminders/due'),
  snooze: (timing: Timing, minutes: number) => call('/api/reminders/snooze', json('POST', { timeSlot: timing, minutes })),

  // 마이데이터(가상)
  mydataConnect: () => call('/api/mydata/connect', json('POST', { agree: true })),
  mydataDisconnect: () => call('/api/mydata/connect', { method: 'DELETE' }),
  mydataSync: async (applyMedications: boolean): Promise<MydataResult> => {
    const r = await call<{
      importedCheckups: { date: string; institution: string }[]; skippedCheckups: { date: string }[]
      prescriptions: { name: string; dispensedAt: string; institution: string; alreadyRegistered: boolean }[]
    }>('/api/mydata/sync', json('POST', { applyMedications }))
    return {
      imported: r.importedCheckups,
      skipped: r.skippedCheckups.map((x) => x.date),
      prescriptions: r.prescriptions.map((p) => ({ name: p.name, dispensedAt: p.dispensedAt, institution: p.institution, registered: p.alreadyRegistered })),
    }
  },
}

// 계정: 아이디+비밀번호. 세션은 서버가 HttpOnly 쿠키로 준다.
export interface Account { username: string | null; isGuest: boolean; name: string; onboarded: boolean }
const cred = (username: string, password: string) => json('POST', { username, password })
export const auth = {
  me: () => call<Account>('/api/auth/me'),
  signup: (username: string, password: string) => call<Account>('/api/auth/signup', cred(username, password)),
  login: (username: string, password: string) => call<Account>('/api/auth/login', cred(username, password)),
  guest: () => call<Account>('/api/auth/guest', { method: 'POST' }),
  logout: () => call('/api/auth/logout', { method: 'POST' }),
  deleteAccount: () => call('/api/auth/account', { method: 'DELETE' }),
}
