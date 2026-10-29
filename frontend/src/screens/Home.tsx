import { useEffect, useState } from 'react'
import type { Route } from '../App'
import { getCenters } from '../api'
import { checkupTarget, interpret } from '../data/rules'
import { latestCheckup, useStore, ymd } from '../store'
import type { CheckupCenter } from '../types'
import { Disclaimer, Icon, Sheet } from '../ui'

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

  const toCenters = () => document.getElementById('centers')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <>
      <section className="sec">
        <p>
          {due ? <>{p.name} 님은 <b>{t.year}년 일반건강검진 대상</b>이고, 아직 받지 않으셨어요. 12월 31일에 마감합니다.</>
            : t.done ? <>최근 결과는 {last.date} 검진이고, 기준을 벗어난 항목은 <b>{flagged}개</b>입니다.</>
              : <>{odd}년생은 {t.year + 1}년에 검진 대상입니다.</>}
        </p>
        <p className="small muted">{odd}년에 태어난 분은 {odd}년에 무료로 받습니다. 비용은 건강보험이 부담합니다.
          {t.extras.length > 0 && <> 올해 추가 검사: {t.extras.join(', ')}.</>}</p>
        <div className="actions">
          <button className="btn flat" onClick={() => go('upload')}>결과지 등록</button>
          {due ? <button className="btn" onClick={toCenters}>근처 검진기관 보기</button>
            : <button className="btn" onClick={() => go('results')}>검진 해석 보기</button>}
        </div>
      </section>

      <div>
        <h2 className="subhead">할 일</h2>
        <ol className="list">
          {todo.map((x) => {
            const act = x.act
            const body = <>
              <span className={`tick${x.done ? ' on' : ''}`} role="img" aria-label={x.done ? '완료' : '남음'}>{x.done && <Icon name="check" size={14} />}</span>
              <span className="li-main"><b>{x.title}</b><small>{x.sub}</small></span>
              {act && <span className="li-end">{act.label}<Icon name="chevron" size={16} /></span>}
            </>
            return (
              <li key={x.title}>
                {act ? <button className="li" onClick={() => (act.to === '#centers' ? toCenters() : go(act.to as Route))}>{body}</button> : <div className="li">{body}</div>}
              </li>
            )
          })}
        </ol>
      </div>

      <div id="centers">
        <h2 className="subhead">가까운 검진기관 <span>{p.region} 기준 · 거리순 · 공단 지정 기관</span></h2>
        <ul className="list">
          {centers.map((c) => (
            <li key={c.id} className="li center">
              <div className="li-main">
                <span className="row" style={{ gap: '2px 10px' }}><b>{c.name}</b><span className="num small muted">{c.distanceKm}km</span></span>
                <small>{c.address}{c.tags.length ? ` · ${c.tags.join(' · ')}` : ''}</small>
                <div className="slots">
                  {c.slots.map((sl) => <button key={sl} className="chip" onClick={() => setPick({ c, slot: sl })}>{sl}</button>)}
                  {c.bookingUrl && <a className="chip" href={c.bookingUrl} target="_blank" rel="noreferrer">예약 안내 열기</a>}
                </div>
              </div>
            </li>
          ))}
          {!centers.length && <li className="li muted">검진기관을 불러오는 중입니다.</li>}
        </ul>
      </div>

      <Disclaimer />

      {pick && (
        <Sheet title="예약을 요청할까요?" onClose={() => setPick(null)}
          actions={<><button className="btn flat" onClick={() => setPick(null)}>취소</button>
            <button className="btn flat strong" onClick={() => { s.reserve(pick.c.name, pick.slot); setPick(null) }}>예약 요청</button></>}>
          <div className="picked"><b>{pick.c.name}</b><span className="small muted">{pick.c.address}</span><span className="num">{pick.slot}</span></div>
          <p className="small muted">시연에서는 실제 기관으로 예약이 전송되지 않습니다. 정식 서비스에서는 기관 예약 시스템과 연결됩니다.</p>
        </Sheet>
      )}
    </>
  )
}
