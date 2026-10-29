import { useEffect, useState } from 'react'
import { hasCheckup, latestCheckup, StoreProvider, useStore, ymd } from './store'
import { checkupTarget, interpret } from './data/rules'
import { Icon, Wordmark } from './ui'
import { USE_API } from './api'
import Home from './screens/Home'
import Guide from './screens/Guide'
import Upload from './screens/Upload'
import Results from './screens/Results'
import Recommend from './screens/Recommend'
import Intake from './screens/Intake'
import Report from './screens/Report'
import Onboarding from './screens/Onboarding'
import Login from './screens/Login'
import Measure from './screens/Measure'
import { ReminderWatcher } from './reminders'

export type Route = 'home' | 'guide' | 'upload' | 'results' | 'recommend' | 'intake' | 'measure' | 'report'
const NEEDS_CHECKUP: Route[] = ['results', 'recommend', 'report']

// 아래 탭 4개(One UI는 5개 이하 권장). 한 탭 안의 두 화면은 탭 아래 나눔 버튼으로 오간다.
// 주소(#results 등)는 예전과 같게 두어 링크와 서버 연결 작업이 그대로 동작한다.
const TABS: { id: string; label: string; routes: [Route, string][] }[] = [
  { id: 'home', label: '홈', routes: [['home', '홈']] },
  { id: 'checkup', label: '검진', routes: [['results', '결과 해석'], ['upload', '결과지 등록']] },
  { id: 'care', label: '영양', routes: [['recommend', '맞춤 추천'], ['intake', '복용 관리']] },
  { id: 'log', label: '기록', routes: [['measure', '중간 점검'], ['report', '변화 리포트']] },
]
// 검진 주의사항(guide)은 홈의 버튼으로 여는 화면이라 홈 탭에 속하지만 나눔 버튼은 만들지 않는다.
const ROUTES: Route[] = [...TABS.flatMap((t) => t.routes.map(([r]) => r)), 'guide']
const tabOf = (r: Route) => TABS.find((t) => t.routes.some(([x]) => x === r)) ?? TABS[0]

type AppStore = ReturnType<typeof useStore>

const readHash = (): Route => {
  const h = location.hash.slice(1) as Route
  return ROUTES.includes(h) ? h : 'home'
}

// 화면 위쪽 보기 영역에 띄우는 제목. 지금 상태를 한 문장으로 말한다.
function heroOf(route: Route, s: AppStore): { title: string; sub: string } {
  const p = s.profile!
  const today = ymd(new Date())
  switch (route) {
    case 'home': {
      const t = checkupTarget(p)
      if (t.isTarget && !t.done) return { title: `검진 마감까지 D-${t.daysLeft}`, sub: `${p.name} 님은 ${t.year}년 일반건강검진 대상입니다` }
      if (t.done) return { title: `${t.year}년 검진을 받으셨습니다`, sub: '결과를 바탕으로 영양 구성을 관리하고 있습니다' }
      return { title: `${t.nextYear}년에 검진 대상입니다`, sub: `${p.name} 님의 다음 국가건강검진` }
    }
    case 'results': {
      if (!hasCheckup(s)) return { title: '검진 결과가 아직 없습니다', sub: '결과지를 등록하면 수치를 해석해 드립니다' }
      const last = latestCheckup(s)
      const n = interpret(last.items, p.sex).filter((i) => i.status !== 'normal').length
      return { title: n ? `${n}개 항목이 기준을 벗어났습니다` : '모든 항목이 정상입니다', sub: `${last.label} · ${last.date}` }
    }
    case 'guide': return { title: '건강검진 주의사항', sub: `${p.name} 님에게 해당하는 안내만 모았습니다` }
    case 'upload': return { title: '검진 결과지 등록', sub: '사진이나 PDF를 올리면 수치를 읽어 옵니다' }
    case 'recommend': return { title: '맞춤 영양 구성', sub: '검진 수치, 생활습관, 복용 약을 함께 보았습니다' }
    case 'intake': {
      const active = s.supplements.filter((x) => !x.paused)
      const left = active.filter((x) => !s.intake[today]?.[x.id]).length
      if (!active.length) return { title: '복용 관리', sub: '추천 구성을 고르면 여기서 챙깁니다' }
      return { title: left ? `오늘 ${left}개 남았습니다` : '오늘 다 챙기셨습니다', sub: `영양제 ${active.length}가지 · 시간대별 알림` }
    }
    case 'measure': return { title: '중간 점검', sub: '집에서 잰 혈압·혈당·체중으로 변화를 봅니다' }
    case 'report': return { title: '변화 리포트', sub: '복용 전후 검진 수치를 비교합니다' }
  }
}

function Shell() {
  const store = useStore()
  const [route, setRoute] = useState<Route>(readHash)
  const [editing, setEditing] = useState(false)
  useEffect(() => { setEditing(false) }, [store.account?.username, store.account?.isGuest])
  const [scrolled, setScrolled] = useState(false)
  const [lastByTab, setLastByTab] = useState<Record<string, Route>>({})
  useEffect(() => {
    const on = () => setRoute(readHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    const on = () => setScrolled(scrollY > 96)
    on()
    addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [])
  const go = (r: Route) => { location.hash = r; setRoute(r); setLastByTab((x) => ({ ...x, [tabOf(r).id]: r })); setEditing(false); scrollTo({ top: 0 }) }

  if (USE_API && store.account === null) return <Login />
  if (USE_API && store.account && !store.account.onboarded && !store.profile && store.remote) return <Onboarding onDone={() => go('home')} />
  if (USE_API && !store.profile) {
    return (
      <div className="main narrow">
        <section className="sec">
          <h2>{store.remoteError ? '서버에 연결하지 못했습니다' : '서버에서 불러오는 중입니다'}</h2>
          <p className="muted">{store.remoteError ?? '잠시만 기다려 주십시오.'}</p>
          {store.remoteError && <p className="small muted">backend 폴더에서 <code>uvicorn app.main:app --port 8000</code>을 먼저 실행했는지 확인해 주십시오.</p>}
        </section>
      </div>
    )
  }
  if (!store.profile) return <Onboarding onDone={() => go('home')} />
  if (editing) return <Onboarding initial={store.profile} onDone={() => { setEditing(false); scrollTo({ top: 0 }) }} onCancel={() => setEditing(false)} />
  const p = store.profile
  const tab = tabOf(route)
  const hero = heroOf(route, store)

  return (
    <>
      <header className={`appbar${scrolled ? ' scrolled' : ''}`}>
        <div className="bar-in">
          <span className="bar-brand"><Wordmark /></span>
          <span className="bar-title" aria-hidden={!scrolled}>{hero.title}</span>
          <nav className="tabs" aria-label="메뉴">
            {TABS.map((t) => (
              <button key={t.id} aria-current={t.id === tab.id ? 'page' : undefined}
                onClick={() => go(t.id === tab.id ? t.routes[0][0] : lastByTab[t.id] ?? t.routes[0][0])}>{t.label}</button>
            ))}
          </nav>
          <button className="icon-btn" onClick={() => { setEditing(true); scrollTo({ top: 0 }) }} aria-label={`내 정보 · ${p.name} 님`} title="내 정보">
            <Icon name="person" size={22} />
          </button>
        </div>
      </header>
      <main className="main">
        <div className="hero">
          <h1>{hero.title}</h1>
          <p>{hero.sub}</p>
        </div>
        {tab.routes.length > 1 && (
          <div className="subtabs" role="group" aria-label={`${tab.label} 화면`}>
            {tab.routes.map(([r, label]) => <button key={r} aria-pressed={route === r} onClick={() => go(r)}>{label}</button>)}
          </div>
        )}
        <div className="page">
          {route === 'home' && <Home go={go} />}
          {route === 'guide' && <Guide go={go} />}
          {route === 'upload' && <Upload go={go} />}
          {NEEDS_CHECKUP.includes(route) && !hasCheckup(store) && (
            <section className="sec">
              <h2>먼저 검진 결과지를 등록해 주십시오</h2>
              <p className="muted">종이 결과지 사진이나 공단 PDF를 올리면 수치를 읽어 해석과 영양 구성 추천을 보여 드립니다.</p>
              <div className="actions"><button className="btn" onClick={() => go('upload')}>결과지 등록</button></div>
            </section>
          )}
          {hasCheckup(store) && route === 'results' && <Results go={go} />}
          {hasCheckup(store) && route === 'recommend' && <Recommend go={go} />}
          {route === 'intake' && <Intake />}
          {route === 'measure' && <Measure go={go} />}
          {hasCheckup(store) && route === 'report' && <Report go={go} />}
        </div>
        <footer className="demo-foot">
          <span>{p.name}님({new Date().getFullYear() - p.birthYear}세 · {p.sex === 'M' ? '남' : '여'})의 데이터입니다.
            {store.remoteError && <span style={{ color: 'var(--danger)' }}> {store.remoteError}</span>}</span>
          {USE_API ? (store.account?.isGuest && <button className="btn flat sm" onClick={() => { store.resetFull(); go('home') }}>시연 데이터 초기화</button>) : <span className="row" style={{ gap: 4 }}>
            <button className="btn flat sm" onClick={() => { store.resetFresh() }}>처음부터</button>
            <button className="btn flat sm" onClick={() => { store.resetFull(); go('home') }}>완성 상태</button>
          </span>}
        </footer>
      </main>
      <ReminderWatcher />
    </>
  )
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>
}
