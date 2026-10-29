import type {
  Checkup, CheckupCenter, CheckupItem, IntakeLog, Recommendation, Supplement, Timing, UserProfile, Warning,
} from '../types'

// backend/(FastAPI, docs/api.md) 응답을 화면이 쓰는 모양으로 바꾼다.
const BASE = import.meta.env.VITE_API_BASE ?? ''

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null) as { detail?: string } | null
    throw new Error(err?.detail ?? `${path} 요청 실패 (${res.status})`)
  }
  return res.json() as Promise<T>
}
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

type Slot = Timing | 'bedtime'
const toTiming = (slots: Slot[]): Timing => (slots[0] === 'bedtime' ? 'evening' : slots[0] ?? 'morning')
const firstEntry = (o: Record<string, string>) => Object.entries(o)[0] ?? ['', '']

interface RUser {
  name: string; birthYear: number; gender: 'M' | 'F'; medications: string[]; lastCheckupDate: string | null
  lifestyle: { smoking: boolean; drinkingPerWeek: number; exercisePerWeek: number; lowSunlight: boolean }
}
interface RCheckupRow { id: number; date: string; source: string; status: string }
interface RCheckup { id: number; date: string; source: string; items: { code: string; name: string; value: number; unit: string }[] }
interface RSupp { id: number; supplementId: string; name: string; ingredients: Record<string, string>; timeSlots: Slot[]; paused: boolean; startedAt: string }
interface RReason { code: string; name: string; value: number; unit: string }
interface RWarning { level: 'info' | 'caution'; message: string; type: string; ingredient?: string; drugs?: string[] }
interface RRec {
  supplementId: string; name: string; ingredients: Record<string, string>; timeSlots: Slot[]; claim: string
  reasons: RReason[]; lifestyleReasons: string[]; alreadyTaking: boolean
}
interface RRecs { recommendations: RRec[]; excluded: { name: string; message: string }[]; warnings: (RWarning & { supplementId?: string })[]; notes?: { message: string }[] }

export interface RemoteExtras {
  checkupIds: Record<string, number>
  recs: Recommendation[]
  warnings: Warning[]
  notes: string[]
  medOptions: string[]
  compareNote: string | null
}

const mapCheckup = (c: RCheckup): Checkup => ({
  id: String(c.id), date: c.date, source: c.source === 'photo' ? 'ocr' : 'pdf',
  label: `${c.date.slice(0, 4)} 일반건강검진`,
  items: c.items.map((i) => ({ code: i.code.toUpperCase(), name: i.name, value: i.value, unit: i.unit })),
})

const WARN_TITLE: Record<string, string> = { duplicate: '성분 중복', interaction: '약과 함께 먹을 때 주의', condition: '검진 수치 때문에 주의', spacing: '복용 간격' }
const mapWarning = (w: RWarning): Warning => ({
  level: w.level,
  title: w.type === 'duplicate' && w.ingredient ? `${w.ingredient} 중복`
    : w.type === 'interaction' && w.drugs?.length ? `${w.drugs.join('·')}과 함께 복용` : WARN_TITLE[w.type] ?? '확인 필요',
  detail: w.message,
})

export async function loadAll() {
  const today = new Date()
  const from = new Date(today); from.setDate(from.getDate() - 40)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const [user, rows, supps, logs, recs, meds] = await Promise.all([
    call<RUser>('/api/users/me'),
    call<RCheckupRow[]>('/api/checkups'),
    call<RSupp[]>('/api/supplements'),
    call<{ logs: { date: string; supplementId: number; taken: boolean }[] }>(`/api/intake-logs?from=${iso(from)}&to=${iso(today)}`),
    call<RRecs>('/api/recommendations').catch(() => null),
    call<{ name: string }[]>('/api/medications'),
  ])
  const confirmed = rows.filter((r) => r.status === 'confirmed').sort((a, b) => a.date.localeCompare(b.date))
  const checkups = (await Promise.all(confirmed.map((r) => call<RCheckup>(`/api/checkups/${r.id}`)))).map(mapCheckup)
  const compare = checkups.length >= 2
    ? await call<{ note: string }>('/api/reports/compare').catch(() => null) : null

  const profile: UserProfile = {
    name: user.name, birthYear: user.birthYear, sex: user.gender, region: '서울',
    lastCheckupYear: user.lastCheckupDate ? Number(user.lastCheckupDate.slice(0, 4)) : null,
    medications: user.medications, currentSupplements: [],
    lifestyle: { smoking: user.lifestyle.smoking, drinkingPerWeek: user.lifestyle.drinkingPerWeek, exercisePerWeek: user.lifestyle.exercisePerWeek, lowOutdoor: user.lifestyle.lowSunlight },
  }
  const supplements: Supplement[] = supps.map((x) => {
    const [ing, amt] = firstEntry(x.ingredients)
    return { id: String(x.id), name: x.name, ingredient: ing, dose: amt, timing: toTiming(x.timeSlots), paused: x.paused, startDate: x.startedAt }
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
    warnings: [
      ...(recs?.excluded ?? []).map((e): Warning => ({ level: 'danger', title: `${e.name} 제외`, detail: e.message })),
      ...(recs?.warnings ?? []).map(mapWarning),
    ],
    notes: (recs?.notes ?? []).map((n) => n.message),
    medOptions: meds.map((m) => m.name),
    compareNote: compare?.note ?? null,
  }
  return { state: { profile, checkups, supplements, intake }, extras }
}

export const remote = {
  getCenters: async (): Promise<CheckupCenter[]> =>
    (await call<{ id: number; name: string; address: string; distanceKm: number; bookingUrl: string }[]>('/api/checkup-centers'))
      .map((c) => ({ id: String(c.id), name: c.name, address: c.address, distanceKm: c.distanceKm, slots: [], tags: [], bookingUrl: c.bookingUrl })),
  upload: async (file: File) => {
    const body = new FormData(); body.append('file', file)
    const r = await call<{ id: number; ocr: { fields: CheckupItem[] } }>('/api/checkups/upload', { method: 'POST', body })
    return { id: r.id, items: r.ocr.fields.map((f) => ({ code: f.code.toUpperCase(), name: f.name, value: f.value, unit: f.unit })) }
  },
  confirm: (id: number, items: CheckupItem[]) =>
    call(`/api/checkups/${id}`, json('PATCH', { values: Object.fromEntries(items.map((i) => [i.code.toLowerCase(), i.value])), confirm: true })),
  saveProfile: (p: UserProfile) => call('/api/users/me', json('PUT', {
    name: p.name, birthYear: p.birthYear, gender: p.sex, medications: p.medications,
    lifestyle: { smoking: p.lifestyle.smoking, drinkingPerWeek: p.lifestyle.drinkingPerWeek, exercisePerWeek: p.lifestyle.exercisePerWeek, lowSunlight: p.lifestyle.lowOutdoor },
  })),
  addSupplement: (supplementId: string) =>
    call('/api/supplements', json('POST', { supplementId, source: 'recommendation' })).catch(() => null), // 이미 복용 중이면 409
  patchSupplement: (id: string, patch: { timing?: Timing; paused?: boolean }) =>
    call(`/api/supplements/${id}`, json('PATCH', { ...(patch.timing && { timeSlots: [patch.timing] }), ...(patch.paused !== undefined && { paused: patch.paused }) })),
  removeSupplement: (id: string) => call(`/api/supplements/${id}`, { method: 'DELETE' }),
  intake: (id: string, timing: Timing, taken: boolean, date: string) =>
    call('/api/intake-logs', json('POST', { supplementId: Number(id), timeSlot: timing, taken, date })),
  reset: () => call('/api/demo/reset', { method: 'POST' }),
}
