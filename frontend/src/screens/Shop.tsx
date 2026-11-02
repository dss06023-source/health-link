import { useMemo, useState } from 'react'
import type { Route } from '../App'
import { direction, interpret, purchaseChecks, recommend, STATUS_LABEL } from '../data/rules'
import { DISCLOSURE, shopLink } from '../data/shopLinks'
import { latestCheckup, useStore } from '../store'
import type { InterpretedItem, Recommendation, Sex, Warning } from '../types'
import { CautionList, Sheet } from '../ui'

// 제품을 사기 전에 원재료 표시에서 확인할 성분. 맞춤 추천 화면과 구매 탭이 같이 쓴다.
export function ProductChecks({ checks }: { checks: Warning[] }) {
  return checks.length
    ? <><p className="small muted">입력하신 약·질환·검진 수치·이미 먹는 영양제를 기준으로 했습니다. 제품 뒷면의 원재료명과 영양·기능정보에서 찾아보십시오.</p><CautionList items={checks} keywords /></>
    : <p className="small muted">입력하신 약·질환·검진 수치·이미 먹는 영양제와 부딪히는 성분이 없습니다. 제품의 1일 섭취량만 지키십시오.</p>
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

// 영양제 구매: 맞춤 추천에 든 영양제만 쿠팡 링크로 보여 준다. 링크를 누르면 확인할 성분 창이 먼저 뜬다.
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
  const [picked, setPicked] = useState<Recommendation | null>(null)
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

      {picked && link && (
        <Sheet title={`${picked.name} 사기 전에 확인하십시오`} onClose={() => setPicked(null)}
          actions={<><button className="btn flat" onClick={() => setPicked(null)}>닫기</button>
            <a className="btn flat strong" href={link.url} target="_blank" rel="noreferrer sponsored" onClick={() => setPicked(null)}>확인했습니다, 쿠팡으로 이동</a></>}>
          <ProductChecks checks={checks} />
          {link.partner && <p className="small muted">{DISCLOSURE}</p>}
        </Sheet>
      )}
    </>
  )
}
