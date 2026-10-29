import { useMemo, useState } from 'react'
import type { Route } from '../App'
import { MEDICATION_OPTIONS, SUPPLEMENT_OPTIONS } from '../data/mock'
import { checkWarnings, interpret, recommend, reviewCurrent, TIMING_LABEL } from '../data/rules'
import { latestCheckup, useStore } from '../store'
import { CautionList, Disclaimer, Value } from '../ui'

// 기능성 문구는 고시 원문("~수 있음", "~에 필요")으로 저장하고, 화면에서만 합니다체로 바꾼다.
function politeClaim(claim: string) {
  return claim.replace(/필요, /g, '필요하며, ').replace(/있음$/, '있습니다.').replace(/필요$/, '필요합니다.')
}

export default function Recommend({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const p = s.profile!
  const items = interpret(latestCheckup(s).items, p.sex)
  const local = useMemo(() => recommend(items, p), [items, p])
  const recs = s.remote?.recs ?? local
  const [off, setOff] = useState<string[]>([])
  const chosen = recs.filter((r) => !r.skipped && !off.includes(r.id))
  const warnings = s.remote?.warnings ?? checkWarnings([...chosen.map((r) => r.name), ...s.supplements.filter((x) => !x.paused).map((x) => x.name)], p, items)
  const itemOf = (code: string) => items.find((i) => i.code === code)
  const already = chosen.filter((r) => s.supplements.some((x) => x.id === r.id)).length
  // 이미 먹는 영양제 중 추천 구성에 없는 것: 계속 먹어도 되는지, 피해야 하는지
  const current = s.remote?.current ?? reviewCurrent(p, items, recs)
  const weight = items.some((i) => (i.code === 'BMI' || i.code === 'WAIST') && i.status !== 'normal')

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className="cols">
      <div className="page">
        <section className="sec">
          <div className="sec-head"><h2>추천 구성 {chosen.length}가지</h2></div>
          <p className="small muted">왼쪽은 근거가 된 수치, 오른쪽은 영양제입니다. 스위치로 빼거나 넣습니다.</p>
          <div className="links">
            {recs.map((r) => {
              const isOff = off.includes(r.id)
              const evid = r.reasonCodes.map(itemOf).filter((x) => !!x)
              const other = r.reasonCodes.filter((c) => !itemOf(c))
              return (
                <div key={r.id} className={`link-row${r.skipped || isOff ? ' off' : ''}`}>
                  <div className="evid">
                    {evid.length > 0 && <div className="vals">{evid.map((it) => (
                      <span key={it.code} className="item">{it.name}<Value status={it.status}>{it.value}</Value></span>
                    ))}</div>}
                    {other.length > 0 && <span className="life">{other.join(' · ')}</span>}
                    <span className="why">{r.reason}</span>
                  </div>
                  <span className={`wire${evid.length ? '' : ' soft'}`} aria-hidden="true" />
                  <div className="supp">
                    <b>{r.name}</b>
                    <span className="dose">{r.ingredient} {r.dose} · {TIMING_LABEL[r.timing]}</span>
                    {r.skipped ? <span className="skip">{r.skipped}</span> : <span className="claim">기능성: {politeClaim(r.claim)}</span>}
                  </div>
                  {!r.skipped && (
                    <button className="switch" role="switch" aria-checked={!isOff} aria-label={`${r.name} 포함`} onClick={() => setOff(toggle(off, r.id))} />
                  )}
                </div>
              )
            })}
            {current.map((x) => (
              <div key={x.name} className={`link-row current ${x.status}`}>
                <div className="evid"><span className="life">이미 먹는 영양제</span></div>
                <span className="wire soft" aria-hidden="true" />
                <div className="supp">
                  <b>{x.name}</b>
                  <span className={x.status === 'conflict' ? 'skip danger' : 'claim'}>{x.message}</span>
                  {x.cautions.map((c) => <span key={c} className="claim">확인: {c}</span>)}
                </div>
              </div>
            ))}
            {!recs.length && <p className="muted" style={{ padding: '14px 0' }}>지금 수치와 생활습관으로는 추가할 영양제가 없습니다.</p>}
          </div>
          <div className="actions">
            <button className="btn" disabled={!chosen.length}
              onClick={() => { s.addSupplements(chosen); go('intake') }}>
              {already === chosen.length && chosen.length ? '복용 관리로 이동' : '이 구성으로 복용 시작'}
            </button>
          </div>
        </section>

        {weight && (
          <section className="sec tint-caution">
            <h2>영양제보다 먼저</h2>
            <p className="small">체질량지수나 허리둘레가 기준을 넘었습니다. 체중을 5%(약 4kg)만 줄여도 중성지방·혈당·간 수치가 함께 내려가는 경우가 많습니다. 하루 30분 걷기와 저녁 탄수화물 줄이기부터 시작해 보세요.</p>
          </section>
        )}
      </div>

      <div className="page">
        <section className="sec">
          <div className="sec-head"><h2>함께 먹을 때 주의할 점</h2><span className="count">{warnings.length ? `${warnings.length}건` : '없음'}</span></div>
          {warnings.length ? <CautionList items={warnings} /> : <p className="muted small">복용 약, 이미 먹는 영양제와 겹치거나 부딪히는 성분이 없습니다.</p>}
        </section>

        <section className="sec">
          <div className="sec-head"><h2>추천에 쓴 정보</h2></div>
          <div className="field"><span className="label">복용 중인 약</span>
            <div className="chips">{(s.remote?.medOptions ?? [...MEDICATION_OPTIONS, ...p.medications.filter((m) => !MEDICATION_OPTIONS.includes(m))]).map((m) => (
              <button key={m} className="chip" aria-pressed={p.medications.includes(m)} onClick={() => s.setProfile({ ...p, medications: toggle(p.medications, m) })}>{m}</button>
            ))}</div></div>
          <div className="field"><span className="label">이미 먹는 영양제</span>
            <div className="chips">{SUPPLEMENT_OPTIONS.map((m) => (
              <button key={m} className="chip" aria-pressed={p.currentSupplements.includes(m)} onClick={() => s.setProfile({ ...p, currentSupplements: toggle(p.currentSupplements, m) })}>{m}</button>
            ))}</div></div>
          {s.remote?.notes.map((n) => <p key={n} className="small muted">{n}</p>)}
          <p className="small muted">음주 주 {p.lifestyle.drinkingPerWeek}회 · {p.lifestyle.smokingStatus === 'past' ? '과거 흡연' : p.lifestyle.smoking ? '흡연' : '비흡연'} · {p.lifestyle.lowOutdoor ? '주로 실내 생활' : '실외 활동 있음'}{p.conditions?.length ? ` · 진단: ${p.conditions.join(', ')}` : ''}{p.allergies?.length ? ` · 알레르기: ${p.allergies.join(', ')}` : ''}</p>
        </section>
        <Disclaimer />
      </div>
    </div>
  )
}
