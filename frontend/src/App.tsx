import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './store'
import { Icon } from './ui'
import { USE_API } from './api'
import type { IconName } from './ui'
import Home from './screens/Home'
import Upload from './screens/Upload'
import Results from './screens/Results'
import Recommend from './screens/Recommend'
import Intake from './screens/Intake'
import Report from './screens/Report'
import Onboarding from './screens/Onboarding'

export type Route = 'home' | 'upload' | 'results' | 'recommend' | 'intake' | 'report'

const NAV: { id: Route; label: string; short: string; icon: IconName; title: string; sub: string }[] = [
  { id: 'home', label: '홈', short: '홈', icon: 'home', title: '검진 알림', sub: '올해 검진 대상인지, 어디서 받을 수 있는지 확인합니다.' },
  { id: 'upload', label: '결과지 등록', short: '등록', icon: 'upload', title: '건강검진 결과지 등록', sub: '결과지를 찍거나 PDF를 올리면 수치를 자동으로 읽습니다.' },
  { id: 'results', label: '검진 해석', short: '해석', icon: 'chart', title: '검진 해석', sub: '수치를 쉬운 말로 풀고, 신경 써야 할 항목을 먼저 보여 줍니다.' },
  { id: 'recommend', label: '맞춤 추천', short: '추천', icon: 'capsule', title: '맞춤 영양 구성', sub: '검진 수치·생활습관·복용 약을 함께 보고 고릅니다.' },
  { id: 'intake', label: '복용 관리', short: '복용', icon: 'check', title: '복용 관리', sub: '시간대별로 챙기고, 꾸준히 먹었는지 기록합니다.' },
  { id: 'report', label: '변화 리포트', short: '리포트', icon: 'trend', title: '변화 리포트', sub: '복용 전후 검진 수치를 비교합니다.' },
]

const readHash = (): Route => {
  const h = location.hash.slice(1) as Route
  return NAV.some((n) => n.id === h) ? h : 'home'
}

function Shell() {
  const store = useStore()
  const [route, setRoute] = useState<Route>(readHash)
  useEffect(() => {
    const on = () => setRoute(readHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const go = (r: Route) => { location.hash = r; setRoute(r); scrollTo({ top: 0 }) }
  const page = NAV.find((n) => n.id === route)!

  if (USE_API && !store.profile) {
    return (
      <div className="main" style={{ display: 'grid', placeItems: 'start center' }}>
        <section className="card stack" style={{ maxWidth: 520 }}>
          <h2>{store.remoteError ? '서버에 연결하지 못했습니다' : '서버에서 불러오는 중입니다'}</h2>
          <p className="muted">{store.remoteError ?? '잠시만 기다려 주세요.'}</p>
          {store.remoteError && <p className="small muted">backend 폴더에서 <code>uvicorn app.main:app --port 8000</code>을 먼저 실행했는지 확인해 주세요.</p>}
        </section>
      </div>
    )
  }
  if (!store.profile) return <Onboarding onDone={() => go('home')} />

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark"><Icon name="leaf" color="var(--accent-ink)" /></span>
          건강잇다
        </div>
        <nav className="nav" aria-label="메뉴">
          {NAV.map((n) => (
            <button key={n.id} aria-current={route === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
              <Icon name={n.icon} />
              <span className="lbl-long">{n.label}</span>
              <span className="lbl-short">{n.short}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <b className="small">{USE_API ? '서버 연결 모드' : '시연 모드'}</b>
          <span className="small muted">가상 인물 {store.profile.name} 님의 데이터입니다.</span>
          {store.remoteError && <span className="small" style={{ color: 'var(--danger)' }}>{store.remoteError}</span>}
          {USE_API ? <button className="btn ghost sm" onClick={() => { store.resetFull(); go('home') }}>시연 데이터 초기화</button> : <div className="row">
            <button className="btn ghost sm" onClick={() => { store.resetFresh() }}>처음부터</button>
            <button className="btn ghost sm" onClick={() => { store.resetFull(); go('home') }}>완성 상태</button>
          </div>}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{page.title}</h1>
            <p className="sub">{page.sub}</p>
          </div>
          <span className="pill plain">{store.profile.name} 님 · {new Date().getFullYear() - store.profile.birthYear}세 · {store.profile.sex === 'M' ? '남' : '여'}</span>
        </header>
        <div className="page">
          {route === 'home' && <Home go={go} />}
          {route === 'upload' && <Upload go={go} />}
          {route === 'results' && <Results go={go} />}
          {route === 'recommend' && <Recommend go={go} />}
          {route === 'intake' && <Intake />}
          {route === 'report' && <Report go={go} />}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>
}
