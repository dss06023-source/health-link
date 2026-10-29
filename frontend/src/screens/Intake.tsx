import { useEffect, useState } from 'react'
import { notifySupported, requestNotify } from '../reminders'
import { TIMING_LABEL } from '../data/rules'
import { MOCK_TIMING_GUIDE } from '../data/mock'
import { addDays, useStore, ymd } from '../store'
import type { Supplement, Timing } from '../types'
import { Icon, Sheet, Snackbar } from '../ui'

const TIMINGS: Timing[] = ['morning', 'lunch', 'evening']

// 이름 끝 글자 받침에 맞춰 조사를 고른다(숫자·영문 끝은 받침 없는 것으로 본다).
function josa(word: string, withFinal: string, without: string) {
  const c = word.charCodeAt(word.length - 1) - 0xac00
  return word + (c >= 0 && c <= 11171 && c % 28 ? withFinal : without)
}

// 권장 시간대와 이유. 서버가 보낸 값이 없으면(모의 모드) 이름으로 찾는다.
function guideOf(x: Supplement): { timing: Timing; reason: string } | null {
  if (x.recommendedTiming && x.timingReason) return { timing: x.recommendedTiming, reason: x.timingReason }
  return MOCK_TIMING_GUIDE[x.name] ?? null
}
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
  const [removing, setRemoving] = useState<Supplement | null>(null)
  const [moving, setMoving] = useState<{ x: Supplement; to: Timing; guide: { timing: Timing; reason: string } } | null>(null)
  // 권장 시간대에서 벗어나게 바꿀 때만 이유를 보여 주고 한 번 더 묻는다.
  const changeTiming = (x: Supplement, to: Timing) => {
    if (to === x.timing) return
    const guide = guideOf(x)
    if (guide && guide.timing !== to) setMoving({ x, to, guide })
    else s.updateSupplement(x.id, { timing: to })
  }
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
        <div className="actions"><a className="btn" href="#recommend">맞춤 추천 보기</a></div>
      </section>
    )
  }

  return (
    <>
      <div>
        <h2 className="subhead">오늘 복용 <span>{today.getMonth() + 1}월 {today.getDate()}일 {WEEKDAYS[today.getDay()]}요일 · <span className="num">{active.filter((x) => s.intake[key]?.[x.id]).length} / {active.length}</span> · 눌러서 체크</span></h2>
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
                <div className="actions"><button className="btn flat sm" onClick={() => remind(t)}>알림 미리보기</button></div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="small muted row note-line">
        <Icon name="bell" size={16} />알림 시각이 지나도 체크하지 않으면 화면 아래에 알림이 뜹니다.{' '}
        {perm === 'default' && <button className="btn flat sm strong" onClick={async () => setPerm(await requestNotify())}>브라우저 알림도 받기</button>}
        {perm === 'granted' && <span>브라우저 알림 켜짐</span>}
        {perm === 'denied' && <span>브라우저 알림이 막혀 있어 화면 안에서만 알립니다.</span>}
      </p>

      <div className="cols even">
        <section className="sec">
          <div className="sec-head"><h2>최근 30일</h2></div>
          <p className="stat"><b className="num">{Math.round(rate * 100)}%</b><span>계획 대비 실제 복용</span></p>
          <p className="small">30일 동안 계획한 복용의 {Math.round(rate * 100)}%를 챙기셨습니다.
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

        <div>
          <h2 className="subhead">구성 관리 <span>시간대 변경, 일시정지, 중단</span></h2>
          <ul className="list">
            {s.supplements.map((x: Supplement) => (
              <li key={x.id} className="li manage">
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}><b>{x.name}</b>{x.paused && <span className="tag">일시정지</span>}</div>
                  <span className="small muted">{x.ingredient} {x.dose} · {Number(x.startDate.slice(5, 7))}/{Number(x.startDate.slice(8))}부터</span>
                  {guideOf(x) && (
                    <p className="small timing-why"><b>{TIMING_LABEL[guideOf(x)!.timing]} 권장</b> · {guideOf(x)!.reason}</p>
                  )}
                </div>
                <div className="seg" role="group" aria-label={`${x.name} 복용 시간대`}>
                  {TIMINGS.map((t) => (
                    <button key={t} aria-pressed={x.timing === t} onClick={() => changeTiming(x, t)}>{TIMING_LABEL[t]}</button>
                  ))}
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <button className="switch" role="switch" aria-checked={!x.paused} aria-label={`${x.name} 복용 중`} onClick={() => s.updateSupplement(x.id, { paused: !x.paused })} />
                  <button className="icon-btn sm" aria-label={`${x.name} 중단`} onClick={() => setRemoving(x)}><Icon name="x" size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {toast && <Snackbar text={toast} onClose={() => setToast(null)} />}
      {moving && (
        <Sheet title={`${josa(moving.x.name, '을', '를')} ${TIMING_LABEL[moving.to]}으로 바꿀까요?`} onClose={() => setMoving(null)}
          actions={<><button className="btn flat" onClick={() => setMoving(null)}>취소</button>
            <button className="btn flat strong" onClick={() => { s.updateSupplement(moving.x.id, { timing: moving.to }); setMoving(null) }}>바꾸기</button></>}>
          <p>{josa(moving.x.name, '은', '는')} {moving.guide.reason}</p>
          <p className="small muted">그래서 <b>{TIMING_LABEL[moving.guide.timing]}</b>에 드시길 권장합니다. 생활 리듬에 맞지 않으면 바꾸셔도 되고, 알림은 바꾼 시간대로 옵니다.</p>
        </Sheet>
      )}
      {removing && (
        <Sheet title={`${removing.name} 복용을 그만둘까요?`} onClose={() => setRemoving(null)}
          actions={<><button className="btn flat" onClick={() => setRemoving(null)}>취소</button>
            <button className="btn flat danger" onClick={() => { s.removeSupplement(removing.id); setRemoving(null) }}>그만두기</button></>}>
          <p className="small muted">구성에서 빠지고 알림도 멈춥니다. 잠시 쉬려면 스위치로 일시정지하세요.</p>
        </Sheet>
      )}
    </>
  )
}
