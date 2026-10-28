import { useEffect, useState } from 'react'
import { TIMING_LABEL } from '../data/rules'
import { addDays, useStore, ymd } from '../store'
import type { Supplement, Timing } from '../types'
import { Icon, Ring } from '../ui'

const TIMINGS: Timing[] = ['morning', 'lunch', 'evening']
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function Intake() {
  const s = useStore()
  const today = new Date()
  const key = ymd(today)
  const active = s.supplements.filter((x) => !x.paused)
  const [times, setTimes] = useState<Record<Timing, string>>({ morning: '08:00', lunch: '12:30', evening: '19:30' })
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t) }, [toast])

  // 최근 30일 복용률
  let planned = 0, taken = 0
  for (let i = 1; i <= 30; i++) {
    const d = ymd(addDays(today, -i))
    for (const x of active) if (x.startDate <= d) { planned++; if (s.intake[d]?.[x.id]) taken++ }
  }
  const rate = planned ? taken / planned : 0

  // 달력: 이번 주 토요일까지 5주
  const end = addDays(today, 6 - today.getDay())
  const days = Array.from({ length: 35 }, (_, i) => addDays(end, i - 34))
  const level = (d: Date) => {
    const k = ymd(d)
    const list = active.filter((x) => x.startDate <= k)
    if (d > today || !list.length) return ''
    const n = list.filter((x) => s.intake[k]?.[x.id]).length
    return n === list.length ? 'l2' : n ? 'l1' : ''
  }

  const remind = (t: Timing) => {
    const names = active.filter((x) => x.timing === t).map((x) => x.name)
    setToast(names.length ? `${TIMING_LABEL[t]} ${times[t]} · ${names.join(', ')} 드실 시간입니다.` : `${TIMING_LABEL[t]}에 드실 영양제가 없습니다.`)
  }

  if (!s.supplements.length) {
    return (
      <section className="card stack" style={{ alignItems: 'flex-start' }}>
        <h2>아직 복용 중인 영양제가 없습니다</h2>
        <p className="muted">맞춤 추천 화면에서 구성을 고르면 여기에서 시간대별로 챙길 수 있습니다.</p>
        <a className="btn" href="#recommend">맞춤 추천 보기</a>
      </section>
    )
  }

  return (
    <>
      <div className="split">
        <section className="card">
          <div className="card-head">
            <div><h2>오늘 복용</h2><p className="small muted">{today.getMonth() + 1}월 {today.getDate()}일 {WEEKDAYS[today.getDay()]}요일 · 눌러서 체크</p></div>
            <span className="pill normal num">{active.filter((x) => s.intake[key]?.[x.id]).length} / {active.length}</span>
          </div>
          <div className="grid-3" style={{ gap: 16 }}>
            {TIMINGS.map((t) => (
              <div key={t} className="slot-col">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>{TIMING_LABEL[t]}</b>
                  <input id={`time-${t}`} aria-label={`${TIMING_LABEL[t]} 알림 시각`} type="time" value={times[t]}
                    onChange={(e) => setTimes({ ...times, [t]: e.target.value })}
                    style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px', background: 'var(--surface)' }} />
                </div>
                {active.filter((x) => x.timing === t).map((x) => {
                  const on = !!s.intake[key]?.[x.id]
                  return (
                    <button key={x.id} className="check" aria-pressed={on} onClick={() => s.toggleIntake(key, x.id)}>
                      <span className="box"><Icon name="check" size={16} /></span>
                      <span style={{ minWidth: 0 }}><b className="small">{x.name}</b><br /><span className="small muted">{x.dose}</span></span>
                    </button>
                  )
                })}
                {!active.some((x) => x.timing === t) && <p className="small muted">없음</p>}
                <button className="btn ghost sm" onClick={() => remind(t)}><Icon name="bell" size={16} />알림 미리보기</button>
              </div>
            ))}
          </div>
        </section>

        <section className="card stack" style={{ alignItems: 'center', gap: 16 }}>
          <div className="card-head" style={{ width: '100%', marginBottom: 0 }}><h2>최근 30일</h2><span className="small muted">계획 대비 실제 복용</span></div>
          <Ring value={rate} label={`${Math.round(rate * 100)}%`} sub="복용률" />
          <div className="cal" style={{ width: '100%' }}>
            {WEEKDAYS.map((w) => <span key={w} className="wd">{w}</span>)}
            {days.map((d) => <span key={ymd(d)} className={`d ${level(d)}${ymd(d) === key ? ' today' : ''}`}>{d.getDate()}</span>)}
          </div>
          <div className="row small muted" style={{ gap: 16 }}>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--accent)' }} />모두 복용</span>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--accent-soft)' }} />일부 복용</span>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--surface-2)' }} />못 먹음</span>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><div><h2>구성 관리</h2><p className="small muted">시간대 변경, 일시정지, 중단</p></div></div>
        {s.supplements.map((x: Supplement) => (
          <div key={x.id} className="manage-row">
            <div style={{ minWidth: 0 }}>
              <div className="row"><b>{x.name}</b>{x.paused && <span className="pill caution">일시정지</span>}</div>
              <span className="small muted">{x.ingredient} {x.dose} · {x.startDate}부터</span>
            </div>
            <div className="seg" role="group" aria-label={`${x.name} 복용 시간대`}>
              {TIMINGS.map((t) => (
                <button key={t} aria-pressed={x.timing === t} onClick={() => s.updateSupplement(x.id, { timing: t })}>{TIMING_LABEL[t]}</button>
              ))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="switch" role="switch" aria-checked={!x.paused} aria-label={`${x.name} 복용 중`} onClick={() => s.updateSupplement(x.id, { paused: !x.paused })} />
              <button className="btn ghost sm" aria-label={`${x.name} 중단`} onClick={() => s.removeSupplement(x.id)}><Icon name="x" size={14} /></button>
            </div>
          </div>
        ))}
      </section>

      {toast && (
        <div className="toast" role="status">
          <Icon name="bell" />
          <div><b className="small">건강잇다</b><p className="small">{toast}</p></div>
        </div>
      )}
    </>
  )
}
