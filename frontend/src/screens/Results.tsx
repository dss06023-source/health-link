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

  const prevYear = prevCheck?.date.slice(0, 4)

  return (
    <>
      <section className="sec">
        <p>
          {flagged
            ? <>{items.length}개 항목 중 {danger.length > 0 && <>질환의심 <b>{danger.length}개</b>({danger.map((d) => d.name).join(', ')}){caution.length > 0 && ', '}</>}
              {caution.length > 0 && <>경계 <b>{caution.length}개</b></>}입니다.</>
            : `${items.length}개 항목이 모두 정상 범위입니다.`}
        </p>
        <p className="small muted">{flagged && items.some((f) => f.status !== 'normal' && f.group === '이상지질혈증') && items.some((f) => f.status !== 'normal' && f.group === '간')
          ? '혈액 속 지방과 간 수치가 함께 올라가 있습니다. 술과 단 음식을 줄이는 것이 공통 해법이고, 영양제는 그다음입니다.'
          : '각 항목 아래에 수치의 뜻을 쉬운 말로 적었습니다.'}</p>
        <div className="actions"><button className="btn" onClick={() => go('recommend')}>이 결과로 영양 구성 추천받기</button></div>
      </section>

      <div className="stack" style={{ gap: 6 }}>
        <div className="seg wide" role="group" aria-label="보기">
          <button aria-pressed={!only} onClick={() => setOnly(false)}>전체 {items.length}</button>
          <button aria-pressed={only} onClick={() => setOnly(true)}>기준 벗어남 {flagged}</button>
        </div>
        <p className="small muted" style={{ textAlign: 'center' }}>국가건강검진 판정 기준{prevYear ? ` · 괄호는 ${prevYear}년 대비 변화` : ''}</p>
      </div>

      <div className="groups">
        {groups.map((g) => (
          <div key={g}>
            <h2 className="subhead">{g}</h2>
            <ul className="list lab">
              {shown.filter((i) => i.group === g).map((it) => (
                <li key={it.code} className="li">
                  <span className="li-main">
                    <b>{it.name}</b>
                    <small>참고치 {it.rangeText}{prevCheck && <> · {prevYear}년 <Delta now={it.value} prev={prevVal(it.code)} /></>}</small>
                    <small className={it.status !== 'normal' ? 'flag' : undefined}>{it.plain}</small>
                  </span>
                  <span className="li-val">
                    <span className="num-line"><Value status={it.status}>{it.value}</Value><span className="unit">{it.unit}</span></span>
                    <Judge status={it.status} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Disclaimer />
    </>
  )
}
