import { useMemo, useState } from 'react'
import type { Route } from '../App'
import { MEDICATION_OPTIONS, SUPPLEMENT_OPTIONS } from '../data/mock'
import { checkWarnings, interpret, recommend, TIMING_LABEL } from '../data/rules'
import { latestCheckup, useStore } from '../store'
import { Disclaimer, Icon, Notice } from '../ui'

// 영양제 종류별 아이콘 배경. 상태 색과 겹치지 않게 차분한 톤만 쓴다.
const TONE = ['var(--accent-soft)', 'var(--info-soft)', 'var(--caution-soft)', 'var(--surface-2)']

export default function Recommend({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const p = s.profile!
  const items = interpret(latestCheckup(s).items, p.sex)
  const recs = useMemo(() => recommend(items, p), [items, p])
  const [off, setOff] = useState<string[]>([])
  const chosen = recs.filter((r) => !r.skipped && !off.includes(r.id))
  const warnings = checkWarnings([...chosen.map((r) => r.name), ...s.supplements.filter((x) => !x.paused).map((x) => x.name)], p, items)
  const nameOf = (code: string) => items.find((i) => i.code === code)?.name ?? code
  const already = chosen.filter((r) => s.supplements.some((x) => x.id === r.id)).length
  const weight = items.some((i) => (i.code === 'BMI' || i.code === 'WAIST') && i.status !== 'normal')

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className="split">
      <div className="stack" style={{ gap: 20 }}>
        <section className="card">
          <div className="card-head">
            <div><h2>추천 구성 {chosen.length}가지</h2><p className="small muted">하루 {chosen.length}회분 · 근거가 된 검진 항목을 함께 표시합니다</p></div>
          </div>
          <div className="stack">
            {recs.map((r, i) => {
              const isOff = off.includes(r.id)
              return (
                <div key={r.id} className={`rec${r.skipped || isOff ? ' skipped' : ''}`}>
                  <span className="pillbox" style={{ background: TONE[i % TONE.length] }}><Icon name="capsule" size={24} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="row"><b>{r.name}</b><span className="small muted">{r.ingredient} {r.dose}</span></div>
                    <p className="small" style={{ marginTop: 4 }}>{r.skipped ?? r.reason}</p>
                    <div className="rec-meta">
                      {r.reasonCodes.map((c) => <span key={c} className="pill caution">{nameOf(c)}</span>)}
                      <span className="pill plain">{TIMING_LABEL[r.timing]}</span>
                    </div>
                    <p className="small muted" style={{ marginTop: 8 }}>기능성: {r.claim}</p>
                  </div>
                  {!r.skipped && (
                    <button className="switch" role="switch" aria-checked={!isOff} aria-label={`${r.name} 포함`} onClick={() => setOff(toggle(off, r.id))} />
                  )}
                </div>
              )
            })}
            {!recs.length && <p className="muted">지금 수치와 생활습관으로는 추가할 영양제가 없습니다.</p>}
          </div>
        </section>

        {weight && (
          <section className="card stack">
            <h2>영양제보다 먼저</h2>
            <p className="muted">체질량지수나 허리둘레가 기준을 넘었습니다. 체중을 5%(약 4kg)만 줄여도 중성지방·혈당·간 수치가 함께 내려가는 경우가 많습니다. 하루 30분 걷기와 저녁 탄수화물 줄이기부터 시작해 보세요.</p>
          </section>
        )}
      </div>

      <div className="stack" style={{ gap: 20 }}>
        <section className="card stack" style={{ gap: 14 }}>
          <div className="card-head" style={{ marginBottom: 0 }}><h2>함께 먹으면 안 되는 조합</h2>
            <span className={`pill ${warnings.some((w) => w.level === 'danger') ? 'danger' : warnings.length ? 'caution' : 'normal'}`}>{warnings.length ? `${warnings.length}건` : '없음'}</span></div>
          {warnings.map((w) => <Notice key={w.title} w={w} />)}
          {!warnings.length && <p className="muted small">복용 약, 이미 먹는 영양제와 겹치거나 부딪히는 성분이 없습니다.</p>}
        </section>

        <section className="card stack" style={{ gap: 14 }}>
          <h2>추천에 쓴 정보</h2>
          <div className="field"><label>복용 중인 약</label>
            <div className="chips">{MEDICATION_OPTIONS.map((m) => (
              <button key={m} className="chip" aria-pressed={p.medications.includes(m)} onClick={() => s.setProfile({ ...p, medications: toggle(p.medications, m) })}>{m}</button>
            ))}</div></div>
          <div className="field"><label>이미 먹는 영양제</label>
            <div className="chips">{SUPPLEMENT_OPTIONS.map((m) => (
              <button key={m} className="chip" aria-pressed={p.currentSupplements.includes(m)} onClick={() => s.setProfile({ ...p, currentSupplements: toggle(p.currentSupplements, m) })}>{m}</button>
            ))}</div></div>
          <p className="small muted">음주 주 {p.lifestyle.drinkingPerWeek}회 · {p.lifestyle.smoking ? '흡연' : '비흡연'} · {p.lifestyle.lowOutdoor ? '주로 실내 생활' : '실외 활동 있음'}</p>
          <button className="btn" disabled={!chosen.length}
            onClick={() => { s.addSupplements(chosen); go('intake') }}>
            {already === chosen.length && chosen.length ? '복용 관리로 이동' : '이 구성으로 복용 시작'}
          </button>
        </section>
        <Disclaimer />
      </div>
    </div>
  )
}
