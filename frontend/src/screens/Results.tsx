import { useState } from 'react'
import type { Route } from '../App'
import { interpret } from '../data/rules'
import { latestCheckup, useStore } from '../store'
import type { InterpretedItem } from '../types'
import { Disclaimer, Ring, StatusPill } from '../ui'

const ORDER = { danger: 0, caution: 1, normal: 2 }

function Delta({ now, prev }: { now: number; prev?: number }) {
  if (prev === undefined) return null
  const d = Math.round((now - prev) * 10) / 10
  if (!d) return <span className="small muted">이전과 같음</span>
  return <span className="small muted num">이전 {prev} → {d > 0 ? '+' : ''}{d}</span>
}

function Metric({ it, prev, open, onToggle }: { it: InterpretedItem; prev?: number; open: boolean; onToggle: () => void }) {
  return (
    <button className="metric" aria-expanded={open} onClick={onToggle}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{it.name}</b><StatusPill status={it.status} />
      </div>
      <span className="val num" style={{ color: it.status === 'normal' ? 'var(--fg)' : `var(--${it.status})` }}>
        {it.value}<small>{it.unit}</small>
      </span>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small muted">기준 {it.rangeText}</span>
        <Delta now={it.value} prev={prev} />
      </div>
      {open && <p className="small" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>{it.plain}</p>}
    </button>
  )
}

export default function Results({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const p = s.profile!
  const last = latestCheckup(s)
  const prevCheck = s.checkups.length > 1 ? s.checkups[s.checkups.length - 2] : undefined
  const items = interpret(last.items, p.sex)
  const prevVal = (code: string) => prevCheck?.items.find((i) => i.code === code)?.value
  const flagged = items.filter((i) => i.status !== 'normal').sort((a, b) => ORDER[a.status] - ORDER[b.status])
  const normalCount = items.length - flagged.length
  const [open, setOpen] = useState<string | null>(flagged[0]?.code ?? null)
  const groups = [...new Set(items.map((i) => i.group))]

  return (
    <>
      <section className="card summary">
        <Ring value={normalCount / items.length} label={`${normalCount}/${items.length}`} sub="정상 항목" size={120} />
        <div className="stack" style={{ gap: 8 }}>
          <span className="row"><span className="pill plain">{last.label} · {last.date}</span>{prevCheck && <span className="pill plain">{prevCheck.date} 결과와 비교</span>}</span>
          <h2>{flagged.length
            ? `${flagged.slice(0, 3).map((f) => f.name).join(', ')}${flagged.length > 3 ? ` 외 ${flagged.length - 3}개` : ''} 항목을 신경 쓰셔야 합니다.`
            : '모든 항목이 정상 범위입니다.'}</h2>
          <p className="muted">{flagged.some((f) => f.group === '이상지질혈증') && flagged.some((f) => f.group === '간')
            ? '혈액 속 지방과 간 수치가 함께 올라가 있습니다. 술과 단 음식을 줄이는 것이 공통 해법이고, 영양제는 그다음입니다.'
            : '항목을 누르면 수치의 뜻과 생활에서 할 수 있는 일을 볼 수 있습니다.'}</p>
          <div className="row"><button className="btn" onClick={() => go('recommend')}>이 결과로 영양 구성 추천받기</button></div>
        </div>
      </section>

      {flagged.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>먼저 챙길 항목</h2><span className="small muted">눌러서 쉬운 설명 보기</span></div>
          <div className="metric-grid">
            {flagged.map((it) => <Metric key={it.code} it={it} prev={prevVal(it.code)} open={open === it.code} onToggle={() => setOpen(open === it.code ? null : it.code)} />)}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>전체 항목</h2><span className="small muted">국가건강검진 판정 기준</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>분류</th><th>항목</th><th>결과</th><th>기준</th><th>{prevCheck ? `${prevCheck.date.slice(0, 4)}년` : '이전'}</th><th>판정</th></tr></thead>
            <tbody>
              {groups.flatMap((g) => items.filter((i) => i.group === g).map((it, k) => (
                <tr key={it.code}>
                  <td className="muted small">{k === 0 ? g : ''}</td>
                  <td><b>{it.name}</b></td>
                  <td><b className="num">{it.value}</b> <span className="small muted">{it.unit}</span></td>
                  <td className="small muted">{it.rangeText}</td>
                  <td className="small muted num">{prevVal(it.code) ?? '-'}</td>
                  <td><StatusPill status={it.status} /></td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </section>
      <Disclaimer />
    </>
  )
}
