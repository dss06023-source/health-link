import { useEffect, useState } from 'react'
import type { Route } from '../App'
import { getCenters } from '../api'
import { checkupTarget, confirmTest, interpret } from '../data/rules'
import { latestCheckup, useStore, ymd } from '../store'
import type { CancerScreening, CheckupCenter } from '../types'
import { Disclaimer, Icon, Sheet } from '../ui'
import CenterSheet from './CenterSheet'
import { md, packStatus } from '../data/pack'

const CANCER_STATUS: Record<CancerScreening['status'], string> = {
  target: '올해 대상', highRiskOnly: '해당 없음', maybe: '확인 필요', excluded: '대상 제외', notThisYear: '내년 대상',
}

// 주소 뒤 안내: [기관 종류] <검진 종류> … 예) [치과의원] <구강>
function centerLabel(c: CheckupCenter) {
  const parts = [c.kind && `[${c.kind}]`, ...c.exams.map((e) => `<${e === '일반' ? '일반검진' : e}>`)].filter(Boolean)
  return parts.length ? ` ${parts.join(' ')}` : ''
}

export default function Home({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const p = s.profile!
  const t = checkupTarget(p)
  const [centers, setCenters] = useState<CheckupCenter[] | null>(null)
  const [pick, setPick] = useState<{ c: CheckupCenter; slot: string } | null>(null)
  const [info, setInfo] = useState<CheckupCenter | null>(null)
  useEffect(() => { getCenters().then(setCenters) }, [])

  const last = latestCheckup(s)
  const flagged = interpret(last.items, p.sex).filter((i) => i.status !== 'normal').length
  const today = ymd(new Date())
  const active = s.supplements.filter((x) => !x.paused)
  const takenToday = active.filter((x) => s.intake[today]?.[x.id]).length
  const due = t.isTarget && !t.done
  const odd = p.birthYear % 2 ? '홀수' : '짝수'
  const confirm = confirmTest(last, p.sex)

  const todo: { done: boolean; title: string; sub: string; act?: { label: string; to: Route | '#centers' } }[] = [
    due
      ? { done: !!s.reservedCenter, title: s.reservedCenter ? `${s.reservedCenter.name} 예약 요청함` : '검진기관 예약하기', sub: s.reservedCenter ? s.reservedCenter.slot : '아래 목록에서 가까운 기관과 시간을 고릅니다.', act: s.reservedCenter ? undefined : { label: '기관 보기', to: '#centers' } }
      // 대상이 아닌 해에는 지난 대상 연도(작년)에 받았는지 본다. 못 받았으면 추가신청 안내로 보낸다.
      : t.done || (p.lastCheckupYear ?? 0) >= t.year - 1
        ? { done: true, title: `${t.done ? t.year : p.lastCheckupYear}년 검진 받음`, sub: `최근 결과 ${last.date}` }
        : { done: false, title: `${t.year - 1}년 검진을 받지 않음`, sub: '올해 추가신청으로 받을 수 있습니다.', act: { label: '주의사항', to: 'guide' } },
    { done: s.checkups.some((c) => c.source !== 'sample'), title: '결과지 등록하기', sub: '종이 결과지 사진이나 공단 PDF를 올리면 수치를 읽어 옵니다.', act: { label: '등록', to: 'upload' } },
    last.items.length
      ? { done: false, title: `결과 해석 확인 · 기준 벗어남 ${flagged}개`, sub: `${last.items.length}개 항목 중`, act: { label: '해석 보기', to: 'results' } }
      : { done: false, title: '결과 해석 확인', sub: '결과지를 등록하면 수치를 해석해 드립니다.' },
    { done: active.length > 0 && takenToday === active.length, title: `오늘 영양제 ${takenToday} / ${active.length}개 먹음`, sub: active.length ? '시간대별로 체크합니다.' : '추천을 받고 복용을 시작하면 여기에 표시됩니다.', act: { label: active.length ? '복용 체크' : '추천 받기', to: active.length ? 'intake' : 'recommend' } },
    { done: !!s.followup, title: s.followup ? '중간 점검 결과 도착' : '복용 6개월 뒤 중간 점검', sub: s.followup ? `${s.followup.date} · 변화 리포트에서 비교합니다.` : '약국 간이검사(혈당·지질)로 변화를 미리 확인합니다.', act: { label: '리포트', to: 'report' } },
  ]

  // 다 떨어지기 7일 전부터 재구매 안내('영양제 복용 시작'으로 등록한 영양제만)
  for (const x of active) {
    const pk = packStatus(x, s.intake)
    if (pk?.remindNow) todo.push({ done: false, title: pk.daysLeft <= 0 ? `${x.name} · 복용 중인 영양제가 다 소진되었습니다` : `${x.name} · 복용 중인 영양제가 거의 소진되었습니다`, sub: pk.daysLeft <= 0 ? '새로 주문하십시오.' : `${md(pk.runOutDate)}에 다 떨어집니다(${pk.daysLeft}일 남음). 미리 주문하십시오.`, act: { label: '구매', to: 'shop' } })
  }

  const toCenters = () => document.getElementById('centers')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <>
      <section className="sec">
        <p>
          {due ? <>{p.name} 님은 <b>{t.year}년 일반건강검진 대상</b>이고, 아직 받지 않으셨습니다. 12월 31일에 마감합니다.</>
            : t.done ? <>최근 결과는 {last.date} 검진이고, 기준을 벗어난 항목은 <b>{flagged}개</b>입니다.</>
              : <>{p.jobType === 'nonOffice' ? '비사무직은' : `${odd}년생은`} {t.nextYear}년에 검진 대상입니다.</>}
        </p>
        <p className="small muted">{t.reason === 'nonOffice' ? '비사무직 직장가입자는 해마다 무료로 받습니다.'
          : t.reason === 'confirmed' ? '공단 조회 결과에 따라 올해 대상으로 표시합니다.'
            : <>{odd}년에 태어난 분은 {odd}년에 무료로 받습니다. 공단 조회 결과가 다르면 내 정보에서 바꿀 수 있습니다.</>} 비용은 건강보험이 부담합니다.</p>
        {t.notes.map((n) => <p key={n} className="small muted">{n}</p>)}
        <div className="actions">
          <button className="btn flat" onClick={() => go('guide')}>건강검진 주의사항</button>
          <button className="btn flat" onClick={() => go('upload')}>결과지 등록</button>
          {due ? <button className="btn" onClick={toCenters}>근처 검진기관 보기</button>
            : <button className="btn" onClick={() => go('results')}>검진 해석 보기</button>}
        </div>
      </section>

      {confirm && (
        <section className="sec">
          <p><b>확진검사 무료 1회</b> · {confirm.message}</p>
          <p className="small muted">{confirm.where}에서 진료와 함께 받습니다.</p>
        </section>
      )}

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

      <div>
        <h2 className="subhead">{t.year}년 검진 항목 <span>공단 검진대상조회 안내 기준</span></h2>
        <ul className="list">
          {t.isTarget && (
            <li className="li"><span className="li-main"><b>일반건강검진 공통</b>
              <small>진찰·상담, 신체계측, 시력·청력, 혈압, 흉부방사선, 혈액·요검사, 구강검진</small></span></li>
          )}
          {t.items.map((i) => (
            <li key={i.name + (i.note ?? '')} className="li"><span className="li-main"><b>{i.name}</b>
              <small>{t.year - p.birthYear}세 대상{i.note ? ` · ${i.note}` : ''}</small></span></li>
          ))}
          {t.cancers.map((c) => (
            <li key={c.id} className="li"><span className="li-main"><b>{c.name} 검진 · {c.test}</b>
              {(c.note || c.nextYear) && <small>{c.note ?? `2년 주기라 ${c.nextYear}년에 받습니다.`}</small>}</span>
              <span className={`li-end${c.status === 'target' ? ' strong' : ''}`}>{CANCER_STATUS[c.status]}</span></li>
          ))}
          {!t.isTarget && !t.cancers.length && <li className="li muted">올해 받을 국가검진 항목이 없습니다.</li>}
        </ul>
      </div>

      <div id="centers">
        <h2 className="subhead">가까운 검진기관 <span>{p.region} 기준 · 거리순 · 공단 지정 기관</span></h2>
        <ul className="list">
          {centers?.map((c) => (
            <li key={c.id} className="li center">
              <div className="li-main">
                <span className="row" style={{ gap: '2px 10px' }}><b>{c.name}</b><span className="num small muted">{c.distanceKm}km</span></span>
                <small>{c.address}{centerLabel(c)}</small>
                <div className="slots">
                  {c.slots.map((sl) => <button key={sl} className="chip" onClick={() => setPick({ c, slot: sl })}>{sl}</button>)}
                  <button className="chip" onClick={() => setInfo(c)}>지도·전화 보기</button>
                </div>
              </div>
            </li>
          ))}
          {!centers && <li className="li muted">검진기관을 불러오는 중입니다.</li>}
          {centers && !centers.length && (
            <li className="li"><span className="li-main"><b>이 지역은 공단 검진기관 자료가 아직 제공되지 않습니다.</b>
              <small>국민건강보험공단 누리집의 건강iN 검진기관 찾기에서 가까운 기관을 확인하십시오.</small>
              <a className="chip" href="https://www.nhis.or.kr" target="_blank" rel="noreferrer" style={{ marginTop: 8, alignSelf: 'flex-start' }}>공단 누리집 열기</a></span></li>
          )}
        </ul>
      </div>

      <Disclaimer />

      {info && <CenterSheet c={info} onClose={() => setInfo(null)} />}

      {pick && (
        <Sheet title="예약을 요청하시겠습니까?" onClose={() => setPick(null)}
          actions={<><button className="btn flat" onClick={() => setPick(null)}>취소</button>
            <button className="btn flat strong" onClick={() => { s.reserve(pick.c.name, pick.slot); setPick(null) }}>예약 요청</button></>}>
          <div className="picked"><b>{pick.c.name}</b><span className="small muted">{pick.c.address}</span><span className="num">{pick.slot}</span></div>
          <p className="small muted">시연에서는 실제 기관으로 예약이 전송되지 않습니다. 정식 서비스에서는 기관 예약 시스템과 연결됩니다.</p>
        </Sheet>
      )}
    </>
  )
}
