import { useEffect, useState } from 'react'
import type { Route } from '../App'
import { getCenters } from '../api'
import { checkupTarget, interpret } from '../data/rules'
import { latestCheckup, useStore, ymd } from '../store'
import type { CheckupCenter } from '../types'
import { Disclaimer, Icon, PenLine } from '../ui'

export default function Home({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const p = s.profile!
  const t = checkupTarget(p)
  const [centers, setCenters] = useState<CheckupCenter[]>([])
  const [pick, setPick] = useState<{ c: CheckupCenter; slot: string } | null>(null)
  useEffect(() => { getCenters().then(setCenters) }, [])

  const last = latestCheckup(s)
  const flagged = interpret(last.items, p.sex).filter((i) => i.status !== 'normal').length
  const today = ymd(new Date())
  const active = s.supplements.filter((x) => !x.paused)
  const takenToday = active.filter((x) => s.intake[today]?.[x.id]).length
  const due = t.isTarget && !t.done
  const odd = p.birthYear % 2 ? '홀수' : '짝수'

  const todo: { done: boolean; title: string; sub: string; act?: { label: string; to: Route | '#centers' } }[] = [
    due
      ? { done: !!s.reservedCenter, title: s.reservedCenter ? `${s.reservedCenter.name} 예약 요청함` : '검진기관 예약하기', sub: s.reservedCenter ? s.reservedCenter.slot : '아래 목록에서 가까운 기관과 시간을 고릅니다.', act: s.reservedCenter ? undefined : { label: '기관 보기', to: '#centers' } }
      : { done: true, title: `${t.done ? t.year : t.year - 1}년 검진 받음`, sub: `최근 결과 ${last.date}` },
    { done: s.checkups.some((c) => c.source !== 'sample'), title: '결과지 등록하기', sub: '종이 결과지 사진이나 공단 PDF를 올리면 수치를 읽어 옵니다.', act: { label: '등록', to: 'upload' } },
    { done: false, title: `결과 해석 확인 · 기준 벗어남 ${flagged}개`, sub: `${last.items.length}개 항목 중`, act: { label: '해석 보기', to: 'results' } },
    { done: active.length > 0 && takenToday === active.length, title: `오늘 영양제 ${takenToday} / ${active.length}개 먹음`, sub: active.length ? '시간대별로 체크합니다.' : '추천을 받고 복용을 시작하면 여기에 표시됩니다.', act: { label: active.length ? '복용 체크' : '추천 받기', to: active.length ? 'intake' : 'recommend' } },
    { done: !!s.followup, title: s.followup ? '중간 점검 결과 도착' : '복용 6개월 뒤 중간 점검', sub: s.followup ? `${s.followup.date} · 변화 리포트에서 비교합니다.` : '약국 간이검사(혈당·지질)로 변화를 미리 확인합니다.', act: { label: '리포트', to: 'report' } },
  ]

  return (
    <>
      <section className="notice">
        <p className="headline">
          {due ? <>{p.name} 님은 <PenLine>{t.year}년 일반건강검진 대상</PenLine>입니다. 아직 받지 않으셨습니다.</>
            : t.done ? <>{t.year}년 검진을 받으셨습니다. 결과를 바탕으로 영양 구성을 관리하고 있습니다.</>
              : <>{odd}년생은 {t.year + 1}년에 검진 대상입니다.</>}
        </p>
        <div className="dday">
          {due ? <><span className="big">D-{t.daysLeft}</span><span className="muted">12월 31일 마감</span></>
            : <span className="muted">{t.done ? `${t.year}년 검진 완료` : `다음 대상 연도 ${t.year + 1}년`}</span>}
          {t.extras.length > 0 && <span className="muted">· 올해 추가 검사: {t.extras.join(', ')}</span>}
        </div>
        <p className="muted">{odd}년에 태어난 분은 {odd}년에 무료로 받습니다. 비용은 건강보험이 부담합니다.</p>
        <div className="row">
          {due ? <a className="btn" href="#centers" onClick={(e) => { e.preventDefault(); document.getElementById('centers')?.scrollIntoView({ behavior: 'smooth' }) }}>근처 검진기관 보기</a>
            : <button className="btn" onClick={() => go('results')}>검진 해석 보기</button>}
          <button className="btn ghost" onClick={() => go('upload')}>결과지 등록</button>
        </div>
      </section>

      <section className="sec">
        <div className="sec-head"><h2>할 일</h2><p>검진부터 변화 확인까지 순서대로</p></div>
        <ol className="rows todo">
          {todo.map((x) => (
            <li key={x.title}>
              <span className={`tick${x.done ? ' on' : ''}`} aria-label={x.done ? '완료' : '남음'}>{x.done && <Icon name="check" size={14} />}</span>
              <div><b>{x.title}</b><small>{x.sub}</small></div>
              {x.act && (x.act.to === '#centers'
                ? <a className="go" href="#centers" onClick={(e) => { e.preventDefault(); document.getElementById('centers')?.scrollIntoView({ behavior: 'smooth' }) }}>{x.act.label}</a>
                : <button className="go" onClick={() => go(x.act!.to as Route)}>{x.act.label}</button>)}
            </li>
          ))}
        </ol>
      </section>

      <section className="sec" id="centers">
        <div className="sec-head"><h2>가까운 검진기관</h2><p>{p.region} 기준 · 거리순 · 국민건강보험공단 지정 기관</p></div>
        <ul className="rows">
          {centers.map((c) => (
            <li key={c.id} className="center">
              <div className="row" style={{ gap: '4px 12px' }}><b>{c.name}</b><span className="num muted">{c.distanceKm}km</span></div>
              <span className="meta">{c.address}{c.tags.length ? ` · ${c.tags.join(' · ')}` : ''}</span>
              <div className="slots">
                {c.slots.map((sl) => <button key={sl} className="chip" onClick={() => setPick({ c, slot: sl })}>{sl}</button>)}
                {c.bookingUrl && <a className="chip" href={c.bookingUrl} target="_blank" rel="noreferrer">예약 안내 열기</a>}
              </div>
            </li>
          ))}
          {!centers.length && <li className="muted">검진기관을 불러오는 중입니다.</li>}
        </ul>
      </section>

      <Disclaimer />

      {pick && (
        <div className="modal-back" onClick={() => setPick(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rsv-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="rsv-title">예약을 요청할까요?</h2>
            <div className="picked"><b>{pick.c.name}</b><span className="small muted">{pick.c.address}</span><span className="num">{pick.slot}</span></div>
            <p className="small muted">시연에서는 실제 기관으로 예약이 전송되지 않습니다. 정식 서비스에서는 기관 예약 시스템과 연결됩니다.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setPick(null)}>취소</button>
              <button className="btn" onClick={() => { s.reserve(pick.c.name, pick.slot); setPick(null) }}>예약 요청</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
