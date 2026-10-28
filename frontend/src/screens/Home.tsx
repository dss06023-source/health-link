import { useEffect, useState } from 'react'
import type { Route } from '../App'
import { getCenters } from '../api'
import { checkupTarget, interpret } from '../data/rules'
import { latestCheckup, useStore, ymd } from '../store'
import type { CheckupCenter } from '../types'
import { Disclaimer, Icon } from '../ui'

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

  return (
    <>
      <section className="card hero-alert">
        <div className="dday">
          {t.isTarget && !t.done ? <div><b className="num">D-{t.daysLeft}</b><span className="small">12월 31일 마감</span></div>
            : <div><b className="num">{t.done ? '완료' : t.year + 1}</b><span className="small">{t.done ? `${t.year}년 검진` : '다음 대상 연도'}</span></div>}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="row">
            <span className={`pill ${t.isTarget && !t.done ? 'caution' : 'normal'}`}><span className="dot" />
              {t.isTarget ? (t.done ? '올해 검진 완료' : '올해 검진 대상 · 미수검') : '올해는 대상 아님'}</span>
            {t.extras.map((e) => <span key={e} className="pill plain">{e}</span>)}
          </span>
          <h2>{t.isTarget && !t.done
            ? `${p.name} 님은 ${t.year}년 일반건강검진 대상입니다. 아직 받지 않으셨어요.`
            : t.done ? `${t.year}년 검진을 받으셨습니다. 결과를 바탕으로 영양 구성을 관리하고 있어요.`
              : `${p.birthYear % 2 ? '홀수' : '짝수'}년생은 ${t.year + 1}년에 검진 대상입니다.`}</h2>
          <p className="muted">{p.birthYear % 2 ? '홀수' : '짝수'}년에 태어난 분은 {p.birthYear % 2 ? '홀수' : '짝수'}년에 무료로 받습니다. 비용은 건강보험이 부담합니다.</p>
          {s.reservedCenter && <p><b>예약됨</b> · {s.reservedCenter.name} {s.reservedCenter.slot}</p>}
        </div>
        <div className="stack">
          {t.isTarget && !t.done
            ? <a className="btn" href="#centers">근처 검진기관 보기</a>
            : <button className="btn" onClick={() => go('results')}>검진 해석 보기</button>}
          <button className="btn ghost" onClick={() => go('upload')}>결과지 등록</button>
        </div>
      </section>

      <div className="grid-3">
        <button className="card stack" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go('intake')}>
          <span className="muted small">오늘 복용</span>
          <span><b className="num" style={{ fontSize: '2rem' }}>{takenToday}</b><span className="muted"> / {active.length}개</span></span>
          <div className="bar"><i style={{ width: `${active.length ? (takenToday / active.length) * 100 : 0}%` }} /></div>
        </button>
        <button className="card stack" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go('results')}>
          <span className="muted small">최근 검진 · {last.date}</span>
          <span><b className="num" style={{ fontSize: '2rem', color: flagged ? 'var(--caution)' : 'var(--accent)' }}>{flagged}</b><span className="muted"> 개 항목 관리 필요</span></span>
          <span className="small muted">{last.items.length}개 항목 중</span>
        </button>
        <button className="card stack" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go('report')}>
          <span className="muted small">다음 확인</span>
          <b style={{ fontSize: '1.15rem' }}>{s.followup ? '중간 점검 결과 도착' : '복용 6개월 뒤 중간 점검'}</b>
          <span className="small muted">{s.followup ? `${s.followup.date} · 변화 리포트에서 비교` : '약국 간이검사(혈당·지질)로 변화를 미리 확인합니다'}</span>
        </button>
      </div>

      <section className="card" id="centers">
        <div className="card-head">
          <div><h2>가까운 검진기관</h2><p className="muted small">{p.region} 기준 · 국민건강보험공단 지정 기관</p></div>
          <span className="pill plain"><Icon name="pin" size={14} />거리순</span>
        </div>
        <div className="stack">
          {centers.map((c) => (
            <div key={c.id} className="center-row">
              <div style={{ minWidth: 0 }}>
                <div className="row"><b>{c.name}</b><span className="muted small num">{c.distanceKm}km</span>
                  {c.tags.map((t) => <span key={t} className="pill plain">{t}</span>)}</div>
                <p className="small muted">{c.address}</p>
                {c.bookingUrl && <div className="slots"><a className="chip" style={{ padding: '5px 12px', fontSize: '.82rem', textDecoration: 'none' }} href={c.bookingUrl} target="_blank" rel="noreferrer">예약 안내 열기</a></div>}
                <div className="slots">{c.slots.map((sl) => (
                  <button key={sl} className="chip" style={{ padding: '5px 12px', fontSize: '.82rem' }} onClick={() => setPick({ c, slot: sl })}>{sl}</button>
                ))}</div>
              </div>
            </div>
          ))}
          {!centers.length && <p className="muted">검진기관을 불러오는 중입니다.</p>}
        </div>
      </section>

      <Disclaimer />

      {pick && (
        <div className="modal-back" onClick={() => setPick(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rsv-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="rsv-title">예약을 요청할까요?</h2>
            <div className="soft stack" style={{ gap: 4 }}>
              <b>{pick.c.name}</b><span className="small muted">{pick.c.address}</span><span className="num">{pick.slot}</span>
            </div>
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
