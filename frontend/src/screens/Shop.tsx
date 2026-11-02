import { useMemo, useState } from 'react'
import type { Route } from '../App'
import { avoidReasons, direction, interpret, purchaseChecks, recommend, STATUS_LABEL } from '../data/rules'
import { DISCLOSURE, shopLink } from '../data/shopLinks'
import PRODUCT_INGREDIENTS from '../data/product_ingredients.json'
import { latestCheckup, useStore } from '../store'
import type { InterpretedItem, Recommendation, Sex, Supplement, Warning } from '../types'
import { CautionList, Sheet } from '../ui'

// 제품을 사기 전에 원재료 표시에서 확인할 성분. 맞춤 추천 화면과 구매 탭이 같이 쓴다.
export function ProductChecks({ checks }: { checks: Warning[] }) {
  return checks.length
    ? <><p className="small muted">입력하신 약·질환·검진 수치·이미 먹는 영양제를 기준으로 했습니다. 제품 뒷면의 원재료명과 영양·기능정보에서 찾아보십시오.</p><CautionList items={checks} keywords /></>
    : <p className="small muted">입력하신 약·질환·검진 수치·이미 먹는 영양제와 부딪히는 성분이 없습니다. 제품의 1일 섭취량만 지키십시오.</p>
}

// 구매 탭에서 고른 영양제와 관계있는 확인 항목만 앞에 둔다. 그 영양제 성분(supplements.json ingredients)이 걸린 항목이 관계있는 것이다.
// 다른 성분을 섞은 복합 제품도 있어 나머지는 접어 둔다. 종합비타민은 제품마다 성분이 크게 달라 전부 보여 준다.
const MIXED = ['종합비타민']
export function splitChecks(name: string, checks: Warning[]): { mine: Warning[]; rest: Warning[] } {
  const keys = (PRODUCT_INGREDIENTS as Record<string, string[]>)[name]
  if (!keys || MIXED.includes(name)) return { mine: checks, rest: [] }
  const mine = checks.filter((c) => !c.keys || c.keys.some((k) => keys.includes(k)))
  return { mine, rest: checks.filter((c) => !mine.includes(c)) }
}
function ChecksFor({ name, checks }: { name: string; checks: Warning[] }) {
  const { mine, rest } = splitChecks(name, checks)
  return (
    <>
      {mine.length
        ? <><p className="small muted">{name} 성분과 입력하신 약·질환·검진 수치·이미 먹는 영양제를 기준으로 했습니다. 제품 뒷면의 원재료명과 영양·기능정보에서 찾아보십시오.</p><CautionList items={mine} keywords /></>
        : <p className="small muted">{name} 한 가지만 든 제품이면 입력하신 약·질환·검진 수치·이미 먹는 영양제와 부딪히는 성분이 없습니다. 제품의 1일 섭취량만 지키십시오.</p>}
      {rest.length > 0 && (
        <details className="more-checks">
          <summary>다른 성분을 섞은 복합 제품이면 함께 확인할 것 {rest.length}가지</summary>
          <CautionList items={rest} keywords />
        </details>
      )}
    </>
  )
}

// 영양제 이름 위에 근거 수치를 판정 색으로 보여 준다("공복혈당 108mg/dL ▲ 높음 · 경계" → 바나바잎 추출물).
// 색만으로 구분하지 않도록 기준보다 높은지 낮은지와 판정 글자, 기준치를 함께 쓴다.
const DIR = { high: '▲ 높음', low: '▼ 낮음' }
function Because({ items, sex }: { items: InterpretedItem[]; sex: Sex }) {
  if (!items.length) return null
  return (
    <span className="because">
      {items.map((it) => {
        const d = direction(it.code, it.value, sex)
        return (
          <span key={it.code} className={`ev ${it.status}`}>
            <span>{it.name}{it.rangeText && <small>기준 {it.rangeText}</small>}</span>
            <span><b>{it.value}</b>{it.unit}<i>{d ? `${DIR[d]} · ` : ''}{STATUS_LABEL[it.status]}</i></span>
          </span>
        )
      })}
    </span>
  )
}

// 맞춤 추천에서 스위치로 뺀 영양제. 구매 화면이 같은 구성을 보여 주도록 이 탭(세션) 동안만 기억한다.
const OFF_KEY = 'itda-rec-off'
export function readOff(): string[] {
  try { return JSON.parse(sessionStorage.getItem(OFF_KEY) ?? '[]') } catch { return [] }
}
export function saveOff(ids: string[]) {
  try { sessionStorage.setItem(OFF_KEY, JSON.stringify(ids)) } catch { /* 저장 못 해도 추천 화면은 그대로 동작 */ }
}

// 영양제 구매: 맞춤 추천에 든 영양제와 복용 관리에 있는 영양제를 쿠팡 링크로 보여 준다. 링크를 누르면 확인할 성분 창이 먼저 뜬다.
export default function Shop({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const p = s.profile!
  const items = interpret(latestCheckup(s).items, p.sex)
  const local = useMemo(() => recommend(items, p), [items, p])
  const checks = s.remote?.purchaseChecks ?? purchaseChecks(p, items)
  // 빼야 할 원료로 안내된 영양제(예: 스타틴을 먹는 사람의 홍국)는 추천에 들어 있더라도 링크를 띄우지 않는다.
  const blocked = (r: Recommendation) => checks.some((c) => c.level === 'danger' && c.title.includes(r.name))
  const off = readOff()
  const recs = (s.remote?.recs ?? local).filter((r) => !r.skipped && !off.includes(r.id) && !blocked(r))
  // 추천 근거가 된 검진 수치. 근거 코드 중 검진 항목이 아닌 것(흡연 등)은 이유 문장으로 대신한다.
  const evidence = (r: Recommendation) => r.reasonCodes.map((c) => items.find((i) => i.code === c)).filter((x): x is InterpretedItem => !!x)
  // 복용 관리에 있는 영양제(다 떨어져 가면 다시 사도록). 위 추천 목록에 이미 있는 것은 빼고, 쉬는 중인 것도 뺀다.
  // 피해야 할 조합(예: 스타틴+홍국)이면 계속 드실지 의사·약사와 상의할 때까지 링크를 띄우지 않는다.
  const taking = s.supplements.filter((m) => !m.paused && !recs.some((r) => r.name === m.name || r.id === m.id))
  const conflict = (m: Supplement) =>
    s.remote?.current?.some((c) => c.name === m.name && c.status === 'conflict')
    || avoidReasons(m.name, p, items).length > 0
    || checks.some((c) => c.level === 'danger' && c.title.includes(m.name))
  const [picked, setPicked] = useState<{ name: string } | null>(null)
  const link = picked && shopLink(picked.name)

  return (
    <>
      <section className="sec">
        <div className="callout"><p className="small">{DISCLOSURE}</p></div>
      </section>
      <section className="sec">
        <div className="sec-head"><h2>추천받은 영양제 {recs.length}가지</h2></div>
        <p className="small muted">맞춤 추천 구성에 넣은 영양제만 보여 드립니다. 제품은 성분과 1일 섭취량을 보고 직접 고르십시오.</p>
        {recs.length
          ? <ul className="list">
              {recs.map((r) => (
                <li key={r.id}><button type="button" className="li" onClick={() => setPicked(r)}>
                  <span className="li-main">
                    <Because items={evidence(r)} sex={p.sex} />
                    <b>{r.name}</b><small>{r.ingredient} {r.dose}</small>
                  </span>
                  <span className="li-end strong">쿠팡에서 보기</span>
                </button></li>
              ))}
            </ul>
          : <p className="muted">지금 추천받은 영양제가 없습니다.</p>}
        <div className="actions"><button className="btn flat" onClick={() => go('recommend')}>맞춤 추천 보기</button></div>
      </section>
      <section className="sec">
        <div className="sec-head"><h2>복용 중인 영양제 {taking.length}가지</h2></div>
        <p className="small muted">복용 관리에 넣은 영양제입니다. 다 떨어져 가면 같은 성분으로 다시 고르십시오.</p>
        {taking.length
          ? <ul className="list">
              {taking.map((m) => conflict(m)
                ? <li key={m.id}><div className="li">
                    <span className="li-main"><b>{m.name}</b><small>{m.ingredient} {m.dose}</small>
                      <small className="muted">입력하신 약·질환·검진 수치와 맞지 않는 조합이라 링크를 띄우지 않습니다. 계속 드실지 의사·약사와 상의하십시오.</small></span>
                    <span className="li-end danger">상의 필요</span>
                  </div></li>
                : <li key={m.id}><button type="button" className="li" onClick={() => setPicked(m)}>
                    <span className="li-main"><b>{m.name}</b><small>{m.ingredient} {m.dose}</small></span>
                    <span className="li-end strong">쿠팡에서 보기</span>
                  </button></li>)}
            </ul>
          : <p className="muted">복용 관리에 넣은 영양제가 없습니다.</p>}
        <div className="actions"><button className="btn flat" onClick={() => go('intake')}>복용 관리 보기</button></div>
      </section>

      {picked && link && (
        <Sheet title={`${picked.name} 사기 전에 확인하십시오`} onClose={() => setPicked(null)}
          actions={<><button className="btn flat" onClick={() => setPicked(null)}>닫기</button>
            <a className="btn flat strong" href={link.url} target="_blank" rel="noreferrer sponsored" onClick={() => setPicked(null)}>확인했습니다, 쿠팡으로 이동</a></>}>
          <ChecksFor name={picked.name} checks={checks} />
          {link.partner && <p className="small muted">{DISCLOSURE}</p>}
        </Sheet>
      )}
    </>
  )
}
