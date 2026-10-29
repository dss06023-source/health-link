import type { Route } from '../App'
import { checkupGuide } from '../data/checkupGuide'
import { checkupTarget, confirmTest } from '../data/rules'
import { latestCheckup, useStore } from '../store'
import { Disclaimer } from '../ui'

export default function Guide({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const p = s.profile!
  const t = checkupTarget(p)
  const sections = checkupGuide(p, t, confirmTest(latestCheckup(s), p.sex))
  return (
    <>
      <section className="sec">
        <p>{p.name} 님({t.year - p.birthYear}세 · {p.sex === 'M' ? '남' : '여'})의 출생연도, 직장 유형, 암검진 입력값에 맞는 안내만 모았습니다.</p>
        <p className="small muted">국민건강보험공단 「2026년 건강검진 안내」 기준입니다. 정보가 바뀌었다면 내 정보에서 고쳐 주세요.</p>
        <div className="actions"><button className="btn flat" onClick={() => go('home')}>홈으로</button></div>
      </section>
      {sections.map((g) => (
        <div key={g.id}>
          <h2 className="subhead">{g.title}{g.why && <span>{g.why}</span>}</h2>
          <ul className="list">
            {g.items.map((x) => <li key={x} className="li"><span className="li-main">{x}</span></li>)}
          </ul>
        </div>
      ))}
      <Disclaimer />
    </>
  )
}
