import type { Route } from '../App'
import { interpret, STATUS_LABEL } from '../data/rules'
import { latestCheckup, useStore } from '../store'
import type { Checkup, Status } from '../types'
import { Disclaimer, StatusText, Value } from '../ui'

// 비교에 쓰는 핵심 항목과 정상 기준선. HDL만 높을수록 좋다.
const KEYS: { code: string; limit: number; higherBetter?: boolean }[] = [
  { code: 'TG', limit: 150 }, { code: 'LDL', limit: 130 }, { code: 'FBS', limit: 100 }, { code: 'ALT', limit: 35 },
  { code: 'GGT', limit: 63 }, { code: 'TC', limit: 200 }, { code: 'SBP', limit: 120 }, { code: 'HDL', limit: 60, higherBetter: true },
]
const RANK: Record<Status, number> = { normal: 0, caution: 1, danger: 2 }
type Tone = '' | 'toward' | 'worse' | 'slightly-worse'
const TONE_TITLE: Record<Tone, string | undefined> = {
  '': undefined, toward: '정상 범위 쪽으로 움직였습니다', worse: '판정이 나빠졌습니다', 'slightly-worse': '판정은 같지만 수치가 나빠졌습니다',
}

function Spark({ points, limit, labels }: { points: number[]; limit: number; labels: string[] }) {
  const W = 320, H = 84, padX = 34, top = 16, bottom = 22
  const lo = Math.min(...points, limit) * 0.92, hi = Math.max(...points, limit) * 1.05
  const x = (i: number) => padX + (i * (W - padX * 2)) / (points.length - 1)
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom)
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 560, height: 'auto', display: 'block', margin: '0 auto' }} role="img" aria-label={points.join(' → ')}>
      <line x1={padX - 20} x2={W - padX + 20} y1={y(limit)} y2={y(limit)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth="1.2" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={i === points.length - 1 ? 5.5 : 4} fill={i === points.length - 1 ? 'var(--accent)' : 'var(--surface)'} stroke="var(--accent)" strokeWidth="2" />
          <text x={x(i)} y={y(v) - 9} textAnchor="middle" style={{ fill: 'var(--fg)', fontWeight: 600 }}>{v}</text>
          <text x={x(i)} y={H - 4} textAnchor="middle">{labels[i]}</text>
        </g>
      ))}
    </svg>
  )
}

export default function Report({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const p = s.profile!
  // 중간 점검(가상)이 있으면 최신 검진과 비교하고, 없으면 최근 검진 2건을 비교한다.
  const n = s.checkups.length
  const after = s.followup ?? (s.remote && n >= 2 ? latestCheckup(s) : null)
  const base = s.followup ? latestCheckup(s) : after ? s.checkups[n - 2] : latestCheckup(s)
  const prior = s.followup ? (n > 1 ? s.checkups[n - 2] : null) : after && n > 2 ? s.checkups[n - 3] : null

  if (!after) {
    return (
      <section className="sec">
        <span className="muted small">기준 검진 · {base.date}</span>
        <h2>복용 6개월 뒤 중간 점검 결과가 들어오면 여기서 비교합니다</h2>
        <p className="muted">다음 국가검진(2년 뒤)까지 기다리지 않도록, 약국·보건소 간이검사로 혈당과 지질을 중간에 확인하는 방식을 가정했습니다.</p>
        <div className="actions">
          <button className="btn flat" onClick={() => go('measure')}>집에서 잰 기록 보기</button>
          {s.remote
            ? <button className="btn" onClick={() => go('upload')}>새 결과지 등록하기</button>
            : <button className="btn" onClick={s.addFollowup}>중간 점검 결과 넣어 보기 (가상)</button>}
        </div>
      </section>
    )
  }

  const series: Checkup[] = [...(prior ? [prior] : []), base, after]
  const labels = series.map((c) => (c === s.followup ? '중간점검' : c.date.slice(0, 4)))
  const iBase = interpret(base.items, p.sex)
  const iAfter = interpret(after.items, p.sex)
  const rows = KEYS.filter((k) => series.every((c) => c.items.some((i) => i.code === k.code))).map((k) => {
    const b = iBase.find((i) => i.code === k.code)!
    const a = iAfter.find((i) => i.code === k.code)!
    const points = series.map((c) => c.items.find((i) => i.code === k.code)!.value)
    const better = k.higherBetter ? a.value > b.value : a.value < b.value
    // 변화량 색(2026-10-29 사용자 결정): 경계·이상이던 수치가 정상 쪽으로 움직이면 파랑,
    // 판정이 한 단계 이상 나빠지면 빨강, 판정은 같은데 수치만 나빠지면 갈색.
    const worse = a.value !== b.value && !better
    const tone: Tone = b.status !== 'normal' && better ? 'toward'
      : worse && RANK[a.status] > RANK[b.status] ? 'worse'
      : worse ? 'slightly-worse' : ''
    return { ...k, b, a, points, better, tone, statusUp: RANK[a.status] < RANK[b.status] }
  })
  const improved = rows.filter((r) => r.better).length
  const statusUp = rows.filter((r) => r.statusUp)

  const startDates = s.supplements.map((x) => x.startDate).sort()
  const from = startDates[0] ?? base.date
  let planned = 0, taken = 0
  for (const [d, rec] of Object.entries(s.intake)) {
    if (d < from || d > after.date) continue
    for (const x of s.supplements) if (x.startDate <= d) { planned++; if (rec[x.id]) taken++ }
  }
  const rate = planned ? Math.round((taken / planned) * 100) : null

  return (
    <>
      <section className="sec">
        <p>
          {base.date} → {after.date}, 핵심 {rows.length}개 항목 중 <b>{improved}개</b>가 좋아졌습니다.
          {statusUp.length > 0 && <> 판정이 나아진 항목은 <b>{statusUp.map((r) => r.a.name).join(', ')}</b>입니다.</>}
        </p>
        <p className="small muted">같은 기간 복용률 <b className="num" style={{ color: 'var(--fg)' }}>{rate ?? '-'}%</b> · {s.supplements.map((x) => x.name).join(' · ')}</p>
      </section>

      <div>
        <h2 className="subhead">항목별 변화 <span>{after.label} · 점선은 정상 기준선{prior ? ` · ${prior.date.slice(0, 4)}년 검진부터` : ''}</span></h2>
        <ul className="list">
          {rows.map((r) => {
            const d = Math.round((r.a.value - r.b.value) * 10) / 10
            return (
              <li key={r.code} className="li chg">
                <div className="name"><b>{r.a.name}</b><small>{r.a.unit} · 기준 {r.a.rangeText}</small></div>
                <div className="vals">
                  <span className="old"><Value status={r.b.status} faded>{r.b.value}</Value></span>
                  <span className="arrow" aria-hidden="true">→</span>
                  <span className="new"><Value status={r.a.status}>{r.a.value}</Value></span>
                  <span className={`delta ${r.tone}`} title={TONE_TITLE[r.tone]}>{d > 0 ? '+' : ''}{d}</span>
                </div>
                <div className="chart-cell" style={{ minWidth: 0 }}><Spark points={r.points} limit={r.limit} labels={labels} /></div>
                <p className="verdict">
                  <b>{r.better ? '좋아짐' : d === 0 ? '변화 없음' : '나빠짐'}</b>
                  {' · '}{r.statusUp ? <>{STATUS_LABEL[r.b.status]} → <StatusText status={r.a.status} /></> : <StatusText status={r.a.status} />}
                </p>
              </li>
            )
          })}
        </ul>
        <p className="small muted foot-note">{s.remote?.compareNote ?? '수치 변화에는 식사, 음주, 운동, 체중, 검사 시점이 함께 영향을 줍니다. 이 비교는 영양제의 효과를 증명하지 않으며, 생활 관리를 이어 가기 위한 참고 자료입니다.'}</p>
      </div>
      <div className="actions">
        <button className="btn flat" onClick={() => go('intake')}>복용 관리로</button>
        <button className="btn flat strong" onClick={() => go('recommend')}>추천 구성 다시 보기</button>
      </div>
      <Disclaimer />
    </>
  )
}
