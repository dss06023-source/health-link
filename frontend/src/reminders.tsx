import { useEffect, useState } from 'react'
import { USE_API } from './api'
import { remote } from './api/remote'
import { TIMING_LABEL } from './data/rules'
import { useStore, ymd } from './store'
import type { Timing } from './types'
import { Icon } from './ui'

const TIMINGS: Timing[] = ['morning', 'lunch', 'evening']

interface Due { timing: Timing; time: string; items: { id: string; name: string }[] }

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export const notifySupported = () => typeof Notification !== 'undefined'

// 브라우저 알림 권한 요청. 시연 링크(iframe)처럼 막힌 곳에서는 조용히 실패한다.
export async function requestNotify(): Promise<NotificationPermission | 'unsupported'> {
  if (!notifySupported()) return 'unsupported'
  try { return await Notification.requestPermission() } catch { return 'denied' }
}

// 알림 시각이 지났는데 체크하지 않은 영양제가 있으면 화면 아래에 알림을 띄운다(30초마다 확인).
// 서버 연결 모드는 GET /api/reminders/due, 시연 모드는 화면의 기록으로 같은 규칙을 계산한다.
export function ReminderWatcher() {
  const s = useStore()
  const [due, setDue] = useState<Due[]>([])
  const [closed, setClosed] = useState<string[]>([])
  const [notified, setNotified] = useState<string[]>([])
  const [tick, setTick] = useState(0)
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(t) }, [])

  const today = ymd(new Date())
  const taken = s.intake[today]
  useEffect(() => {
    let alive = true
    const now = new Date()
    const local = (): Due[] => TIMINGS.flatMap((t) => {
      const until = s.snoozed[`${today}:${t}`]
      if (s.reminderTimes[t] > hm(now) || (until && now < new Date(until))) return []
      const items = s.supplements.filter((x) => !x.paused && x.timing === t && x.startDate <= today && !taken?.[x.id])
      return items.length ? [{ timing: t, time: s.reminderTimes[t], items: items.map((x) => ({ id: x.id, name: x.name })) }] : []
    })
    if (!USE_API) { setDue(local()); return }
    remote.dueReminders().then((r) => {
      if (!alive) return
      setDue(r.due.map((d) => ({
        timing: (d.timeSlot === 'bedtime' ? 'evening' : d.timeSlot) as Timing,
        time: d.time,
        items: d.items.map((i) => ({ id: String(i.supplementId), name: i.name })),
      })))
    }, () => alive && setDue(local()))
    return () => { alive = false }
  }, [tick, today, taken, s.supplements, s.reminderTimes, s.snoozed])

  const open = due.filter((d) => !closed.includes(`${today}:${d.timing}`))
  const first = open[0]
  const body = first && `${TIMING_LABEL[first.timing]} ${first.time} 복용 시간입니다 · ${first.items.map((i) => i.name).join(', ')}`

  // 브라우저 알림은 시간대마다 한 번만.
  useEffect(() => {
    if (!first || !body || !notifySupported() || Notification.permission !== 'granted') return
    const key = `${today}:${first.timing}`
    if (notified.includes(key)) return
    try { new Notification('건강잇다', { body, tag: key }) } catch { /* 알림을 못 띄우는 환경 */ }
    setNotified((x) => [...x, key])
  }, [first, body, today, notified])

  if (!first) return null
  const close = () => setClosed((x) => [...x, `${today}:${first.timing}`])
  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon name="bell" />
      <div className="stack" style={{ gap: 10 }}>
        <div><b className="small">건강잇다 복용 알림</b><p className="small">{body}</p></div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => { first.items.forEach((i) => s.toggleIntake(today, i.id)); close() }}>다 먹었어요</button>
          <button className="btn ghost sm" onClick={() => s.snooze(first.timing, 30)}>30분 뒤 다시</button>
        </div>
      </div>
      <button className="btn ghost sm icon" aria-label="알림 닫기" onClick={close}><Icon name="x" size={14} /></button>
    </div>
  )
}
