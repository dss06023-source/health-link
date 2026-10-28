import { useState } from 'react'
import type { Route } from '../App'
import { interpret } from '../data/rules'
import { latestCheckup, useStore } from '../store'
import { Disclaimer, Judge, Value } from '../ui'

function Delta({ now, prev }: { now: number; prev?: number }) {
  if (prev === undefined) return <span>-</span>
  const d = Math.round((now - prev) * 10) / 10
  return <span><span className="num">{prev}</span> {d ? <span className="num">({d > 0 ? '+' : ''}{d})</span> : '(같음)'}</span>
}

export default function Results({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const p = s.profile!
  const last = latestCheckup(s)
  const prevCheck = s.checkups.length > 1 ? s.checkups[s.checkups.length - 2] : undefined
  const items = interpret(last.items, p.sex)
  const prevVal = (code: string) => prevCheck?.items.find((i) => i.code === code)?.value
  const danger = items.filter((i) => i.status === 'danger')
  const caution = items.filter((i) => i.status === 'caution')
  const flagged = danger.length + caution.length
  const [only, setOnly] = useState(false)
  const shown = only ? items.filter((i) => i.status !== 'normal') : items
  const groups = [...new Set(shown.map((i) => i.group))]

  return (
    <>
      <section className="summary-lines">
        <p className="lead">
          {flagged
            ? <>{items.length}개 항목 중 <b>{flagged}개</b>가 기준을 벗어났습니다.
              {danger.length > 0 && <> 질환의심 <b>{danger.length}개</b>({danger.map((d) => d.name).join(', ')}),</>}
              {caution.length > 0 && <> 경계 <b>{caution.length}개</b>입니다.</>}</>
            : `${items.length}개 항목이 모두 정상 범위입니다.`}
        </p>
        <p className="muted">{flagged && items.some((f) => f.status !== 'normal' && f.group === '이상지질혈증') && items.some((f) => f.status !== 'normal' && f.group === '간')
          ? '혈액 속 지방과 간 수치가 함께 올라가 있습니다. 술과 단 음식을 줄이는 것이 공통 해법이고, 영양제는 그다음입니다.'
          : '표의 각 줄 오른쪽에 수치의 뜻을 쉬운 말로 적었습니다.'}</p>
        <div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={() => go('recommend')}>이 결과로 영양 구성 추천받기</button></div>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2>검진 결과</h2>
          <div className="seg" role="group" aria-label="보기">
            <button aria-pressed={!only} onClick={() => setOnly(false)}>전체 {items.length}</button>
            <button aria-pressed={only} onClick={() => setOnly(true)}>기준 벗어남 {flagged}</button>
          </div>
        </div>
        <div className="sheet">
          <div className="sheet-top"><b>{last.label}</b><span>{last.date} · 국가건강검진 판정 기준{prevCheck ? ` · ${prevCheck.date.slice(0, 4)}년 결과와 비교` : ''}</span></div>
          <div className="table-wrap">
            <table className="lab">
              <thead><tr><th>항목</th><th>결과</th><th>참고치</th><th>판정</th><th>{prevCheck ? `${prevCheck.date.slice(0, 4)}년` : '이전'}</th><th>쉬운 설명</th></tr></thead>
              <tbody>
                {groups.flatMap((g) => [
                  <tr key={g} className="grp"><td colSpan={6}>{g}</td></tr>,
                  ...shown.filter((i) => i.group === g).map((it) => (
                    <tr key={it.code}>
                      <td className="name">{it.name}</td>
                      <td className="val"><Value status={it.status} seed={it.code}>{it.value}</Value><span className="unit">{it.unit}</span></td>
                      <td className="ref">{it.rangeText}</td>
                      <td className="jd"><Judge status={it.status} /></td>
                      <td className="prev">{prevCheck && <span className="lbl-short">{prevCheck.date.slice(0, 4)}년 </span>}<Delta now={it.value} prev={prevVal(it.code)} /></td>
                      <td className={`note${it.status !== 'normal' ? ' flag' : ''}`}>{it.plain}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <Disclaimer />
    </>
  )
}
