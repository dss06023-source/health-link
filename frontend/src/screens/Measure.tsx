import { useState } from 'react'
import type { Route } from '../App'
import { interim, MEASURE_ITEMS, MEASURE_NOTE, MEASURE_TYPES, toCodes } from '../data/measure'
import type { InterimRow } from '../data/measure'
import { STATUS_LABEL } from '../data/rules'
import { latestCheckup, useStore, ymd } from '../store'
import type { MeasureType } from '../types'
import { Icon, StatusText, Value } from '../ui'

const TYPES = Object.keys(MEASURE_TYPES) as MeasureType[]

// 기준선(점선)과 검진 값(빈 점) 뒤로 측정값을 잇는 작은 추이선.
function Trend({ row }: { row: InterimRow }) {
  const vals = [...(row.checkupValue !== null ? [row.checkupValue] : []), ...row.points.map((p) => p.value)]
  if (vals.length < 2) return null
  const W = 300, H = 64, pad = 8
  const lo = Math.min(...vals, row.limit) * 0.97, hi = Math.max(...vals, row.limit) * 1.02
  const x = (i: number) => pad + (i * (W - pad * 2)) / (vals.length - 1)
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2)
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const hasBase = row.checkupValue !== null
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 420, height: 'auto', display: 'block' }}
      role="img" aria-label={`${row.name} 검진 ${row.checkupValue ?? '-'}, 최근 평균 ${row.recent ?? '-'}`}>
      <line x1={0} x2={W} y1={y(row.limit)} y2={y(row.limit)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth="1.1" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {hasBase && <circle cx={x(0)} cy={y(vals[0])} r={4.5} fill="var(--surface)" stroke="var(--fg)" strokeWidth="1.8" />}
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r={4.5} fill="var(--accent)" />
    </svg>
  )
}

export default function Measure({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const p = s.profile!
  const base = latestCheckup(s)
  const today = ymd(new Date())
  const [type, setType] = useState<MeasureType>('bp')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [fasting, setFasting] = useState(true)
  const [day, setDay] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const rows = interim(s.measurements, base, p.sex, p.heightCm, today)
  const measured = rows.filter((r) => r.points.length)
  const since = s.measurements.filter((m) => m.measuredAt.slice(0, 10) >= base.date).length
  const improved = measured.filter((r) => r.trend === 'improved').length
  const worsened = measured.filter((r) => r.trend === 'worsened').length
  const recent = [...s.measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)).slice(0, 8)

  function save(e: React.FormEvent) {
    e.preventDefault()
    const spec = MEASURE_TYPES[type]
    const values: Record<string, number> = {}
    for (const f of spec.fields) {
      const v = Number(vals[f.key])
      if (!vals[f.key] || Number.isNaN(v) || v < f.min || v > f.max) { setError(`${f.label} 값은 ${f.min}~${f.max} ${f.unit} 사이로 입력해 주세요.`); return }
      values[f.key] = v
    }
    if (day > today) { setError('앞으로의 날짜는 기록할 수 없습니다.'); return }
    s.addMeasurement({ type, values, measuredAt: `${day}T${new Date().toTimeString().slice(0, 5)}`, fasting: type === 'glucose' ? fasting : null })
    setError(null); setVals({}); setSaved(`${spec.label} 기록을 저장했습니다.`)
  }

  return (
    <>
      <section className="summary-lines">
        <p className="lead">
          {base.date} 검진 이후 집에서 잰 기록 <b className="num">{since}건</b>.
          {measured.length > 0
            ? <> 최근 30일 평균으로 보면 기준치에 가까워진 항목 <b>{improved}개</b>, 멀어진 항목 <b>{worsened}개</b>입니다.</>
            : <> 아직 기록이 없습니다. 혈압·혈당·체중을 재서 넣으면 다음 검진 전에 변화를 볼 수 있습니다.</>}
        </p>
        <p className="muted small">국가검진은 2년에 한 번이라, 그 사이를 가정용 혈압계·혈당계·체중계·줄자로 채웁니다.</p>
      </section>

      <div className="cols">
        <section className="sec">
          <div className="sec-head"><h2>검진 값과 최근 평균</h2><p>점선은 정상 기준선 · 빈 점은 검진 값</p></div>
          <ul className="rows">
            {MEASURE_ITEMS.map((it) => {
              const r = rows.find((x) => x.code === it.code)!
              return (
                <li key={r.code} className="chg">
                  <div className="name"><b>{r.name}</b><small>{r.unit} · 기록 {r.points.length}건</small></div>
                  <div className="vals">
                    <span className="old">{r.checkupValue !== null && r.checkupStatus ? <Value status={r.checkupStatus} seed={r.code} faded>{r.checkupValue}</Value> : '-'}</span>
                    <span className="arrow" aria-hidden="true">→</span>
                    <span className="new">{r.recent !== null && r.recentStatus ? <Value status={r.recentStatus} seed={r.code + 'm'}>{r.recent}</Value> : '-'}</span>
                    {r.change !== null && <span className="delta">{r.change > 0 ? '+' : ''}{r.change}</span>}
                  </div>
                  <div className="chart-cell" style={{ minWidth: 0 }}><Trend row={r} /></div>
                  <p className="verdict">
                    {r.trend === null ? '기록 없음'
                      : <><b>{r.trend === 'improved' ? '좋아짐' : r.trend === 'worsened' ? '나빠짐' : '변화 없음'}</b>
                        {' · '}{r.checkupStatus !== r.recentStatus && r.checkupStatus ? <>{STATUS_LABEL[r.checkupStatus]} → </> : null}
                        {r.recentStatus && <StatusText status={r.recentStatus} />}</>}
                  </p>
                </li>
              )
            })}
          </ul>
          <div className="callout"><p className="small muted">{MEASURE_NOTE}</p></div>
        </section>

        <section className="sec">
          <div className="sec-head"><h2>오늘 잰 값 기록</h2></div>
          <form className="stack" onSubmit={save}>
            <div className="seg" role="group" aria-label="측정 종류">
              {TYPES.map((t) => (
                <button type="button" key={t} aria-pressed={type === t} onClick={() => { setType(t); setVals({}); setError(null); setSaved(null) }}>{MEASURE_TYPES[t].label}</button>
              ))}
            </div>
            {MEASURE_TYPES[type].fields.map((f) => (
              <div key={f.key} className="field">
                <label htmlFor={`m-${f.key}`}>{f.label} ({f.unit})</label>
                <input id={`m-${f.key}`} type="number" inputMode="decimal" step="0.1" min={f.min} max={f.max}
                  value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
              </div>
            ))}
            {type === 'glucose' && (
              <div className="seg" role="group" aria-label="공복 여부">
                <button type="button" aria-pressed={fasting} onClick={() => setFasting(true)}>공복 8시간 이상</button>
                <button type="button" aria-pressed={!fasting} onClick={() => setFasting(false)}>식후</button>
              </div>
            )}
            {type === 'glucose' && !fasting && <p className="small muted">식후 혈당은 기록만 하고 공복혈당 기준과 비교하지 않습니다.</p>}
            {type === 'weight' && !p.heightCm && <p className="small muted">키 정보가 없어 체질량지수로 바꾸지 못합니다.</p>}
            <div className="field">
              <label htmlFor="m-day">측정한 날</label>
              <input id="m-day" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
            </div>
            {error && <div className="alert"><Icon name="alert" /><div><p className="small">{error}</p></div></div>}
            {saved && !error && <p className="small" role="status">{saved}</p>}
            <div><button className="btn" type="submit">기록하기</button></div>
          </form>

          <div className="sec-head" style={{ marginTop: 12 }}><h2>최근 기록</h2></div>
          {!recent.length && <p className="muted small">아직 기록이 없습니다.</p>}
          <ul className="rows">
            {recent.map((m) => {
              const codes = toCodes(m, p.heightCm)
              const spec = MEASURE_TYPES[m.type]
              const text = spec.fields.map((f) => `${m.values[f.key]}`).join('/') + ` ${spec.fields[0].unit}`
              return (
                <li key={m.id} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <span style={{ minWidth: 0 }}>
                    <b>{spec.label}</b> <span className="num">{text}</span>
                    {m.type === 'glucose' && <span className="small muted"> · {m.fasting ? '공복' : '식후'}</span>}
                    {codes.BMI !== undefined && <span className="small muted"> · BMI {codes.BMI}</span>}
                    <br /><span className="small muted">{m.measuredAt.slice(0, 10)}</span>
                  </span>
                  <button className="btn ghost sm" aria-label={`${m.measuredAt.slice(0, 10)} ${spec.label} 기록 삭제`} onClick={() => s.removeMeasurement(m.id)}><Icon name="x" size={14} /></button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <div className="row">
        <button className="btn" onClick={() => go('report')}>변화 리포트 보기</button>
        <button className="btn ghost" onClick={() => go('intake')}>복용 관리로</button>
      </div>
    </>
  )
}
