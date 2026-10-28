import { useEffect, useState } from 'react'
import { notifySupported, requestNotify } from '../reminders'
import { TIMING_LABEL } from '../data/rules'
import { addDays, useStore, ymd } from '../store'
import type { Supplement, Timing } from '../types'
import { Icon, PenLine } from '../ui'

const TIMINGS: Timing[] = ['morning', 'lunch', 'evening']
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function Intake() {
  const s = useStore()
  const today = new Date()
  const key = ymd(today)
  const active = s.supplements.filter((x) => !x.paused)
  const times = s.reminderTimes
  const setTimes = s.setReminderTimes
  const [perm, setPerm] = useState(() => (notifySupported() ? Notification.permission : 'unsupported'))
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t) }, [toast])

  // 최근 30일 복용률
  let planned = 0, taken = 0
  for (let i = 1; i <= 30; i++) {
    const d = ymd(addDays(today, -i))
    for (const x of active) if (x.startDate <= d) { planned++; if (s.intake[d]?.[x.id]) taken++ }
  }
  const rate = planned ? taken / planned : 0
  const missedBy = TIMINGS.map((t) => {
    let m = 0
    for (let i = 1; i <= 30; i++) {
      const d = ymd(addDays(today, -i))
      for (const x of active) if (x.timing === t && x.startDate <= d && !s.intake[d]?.[x.id]) m++
    }
    return { t, m }
  }).sort((a, b) => b.m - a.m)[0]
  const nowHM = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`

  // 달력: 이번 주 토요일까지 5주
  const end = addDays(today, 6 - today.getDay())
  const days = Array.from({ length: 35 }, (_, i) => addDays(end, i - 34))
  const level = (d: Date) => {
    const k = ymd(d)
    const list = active.filter((x) => x.startDate <= k)
    if (d > today || !list.length) return ''
    const n = list.filter((x) => s.intake[k]?.[x.id]).length
    return n === list.length ? 'all' : n ? 'some' : 'none'
  }

  const remind = (t: Timing) => {
    const names = active.filter((x) => x.timing === t).map((x) => x.name)
    setToast(names.length ? `${TIMING_LABEL[t]} ${times[t]} · ${names.join(', ')} 드실 시간입니다.` : `${TIMING_LABEL[t]}에 드실 영양제가 없습니다.`)
  }

  if (!s.supplements.length) {
    return (
      <section className="sec">
        <h2>아직 복용 중인 영양제가 없습니다</h2>
        <p className="muted">맞춤 추천 화면에서 구성을 고르면 여기에서 시간대별로 챙길 수 있습니다.</p>
        <div><a className="btn" href="#recommend">맞춤 추천 보기</a></div>
      </section>
    )
  }

  return (
    <>
      <section className="sec">
        <div className="sec-head">
          <h2>오늘 복용</h2>
          <p>{today.getMonth() + 1}월 {today.getDate()}일 {WEEKDAYS[today.getDay()]}요일 · <span className="num">{active.filter((x) => s.intake[key]?.[x.id]).length} / {active.length}</span> · 눌러서 체크</p>
        </div>
        <div className="strip">
          {TIMINGS.map((t) => {
            const list = active.filter((x) => x.timing === t)
            const done = list.filter((x) => s.intake[key]?.[x.id]).length
            const state = !list.length ? '' : done === list.length ? 'done' : times[t] < nowHM ? 'missed' : 'next'
            return (
              <div key={t} className="pouch">
                <div className="pouch-head">
                  <b>{TIMING_LABEL[t]}</b>
                  <input id={`time-${t}`} aria-label={`${TIMING_LABEL[t]} 알림 시각`} type="time" value={times[t]}
                    onChange={(e) => setTimes({ ...times, [t]: e.target.value })} />
                </div>
                {list.map((x) => {
                  const on = !!s.intake[key]?.[x.id]
                  return (
                    <button key={x.id} className="take" aria-pressed={on} onClick={() => s.toggleIntake(key, x.id)}>
                      <span className={`tick${on ? ' on' : ''}`}>{on && <Icon name="check" size={14} />}</span>
                      <span style={{ minWidth: 0 }}><b>{x.name}</b><small>{x.dose}</small></span>
                    </button>
                  )
                })}
                {!list.length && <p className="small muted" style={{ padding: '8px 0' }}>이 시간에 드실 영양제가 없습니다.</p>}
                <p className={`state ${state}`}>
                  {state === 'done' ? '다 드셨습니다' : state === 'missed' ? `${times[t]} 지남 · 아직 ${list.length - done}개` : state === 'next' ? `${times[t]}에 알림` : ''}
                </p>
                <div><button className="btn ghost sm" onClick={() => remind(t)}><Icon name="bell" size={16} />알림 미리보기</button></div>
              </div>
            )
          })}
        </div>
      </section>

      <p className="small muted row" style={{ gap: 10 }}>
        알림 시각이 지나도 체크하지 않으면 화면 아래에 알림이 뜹니다.
        {perm === 'default' && <button className="btn ghost sm" onClick={async () => setPerm(await requestNotify())}><Icon name="bell" size={16} />브라우저 알림도 받기</button>}
        {perm === 'granted' && <span>브라우저 알림 켜짐</span>}
        {perm === 'denied' && <span>브라우저 알림이 막혀 있어 화면 안에서만 알립니다.</span>}
      </p>

      <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <section className="sec">
          <div className="sec-head"><h2>최근 30일</h2><p>계획 대비 실제 복용</p></div>
          <p className="lead">30일 동안 계획한 복용의 <PenLine><b className="num">{Math.round(rate * 100)}%</b></PenLine>를 챙기셨습니다.
            {missedBy && missedBy.m > 0 && <> 가장 자주 빠진 때는 <b>{TIMING_LABEL[missedBy.t]}</b>입니다.</>}</p>
          <div className="cal">
            {WEEKDAYS.map((w) => <span key={w} className="wd">{w}</span>)}
            {days.map((d) => <span key={ymd(d)} className={`d ${level(d)}${ymd(d) === key ? ' today' : ''}`}><i />{d.getDate()}</span>)}
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--accent)' }} />모두 복용</span>
            <span><i style={{ background: 'linear-gradient(90deg, var(--accent) 50%, transparent 50%)', boxShadow: 'inset 0 0 0 1.5px var(--accent)' }} />일부 복용</span>
            <span><i style={{ boxShadow: 'inset 0 0 0 1.5px var(--muted)' }} />못 먹음</span>
          </div>
        </section>

        <section className="sec">
          <div className="sec-head"><h2>구성 관리</h2><p>시간대 변경, 일시정지, 중단</p></div>
          <ul className="rows">
            {s.supplements.map((x: Supplement) => (
              <li key={x.id} className="manage">
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}><b>{x.name}</b>{x.paused && <span className="tag">일시정지</span>}</div>
                  <span className="small muted">{x.ingredient} {x.dose} · {Number(x.startDate.slice(5, 7))}/{Number(x.startDate.slice(8))}부터</span>
                </div>
                <div className="seg" role="group" aria-label={`${x.name} 복용 시간대`}>
                  {TIMINGS.map((t) => (
                    <button key={t} aria-pressed={x.timing === t} onClick={() => s.updateSupplement(x.id, { timing: t })}>{TIMING_LABEL[t]}</button>
                  ))}
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <button className="switch" role="switch" aria-checked={!x.paused} aria-label={`${x.name} 복용 중`} onClick={() => s.updateSupplement(x.id, { paused: !x.paused })} />
                  <button className="btn ghost sm" aria-label={`${x.name} 중단`} onClick={() => s.removeSupplement(x.id)}><Icon name="x" size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {toast && (
        <div className="toast" role="status">
          <Icon name="bell" />
          <div><b className="small">건강잇다</b><p className="small">{toast}</p></div>
        </div>
      )}
    </>
  )
}
