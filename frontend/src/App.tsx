import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './store'
import { Wordmark } from './ui'
import { USE_API } from './api'
import Home from './screens/Home'
import Upload from './screens/Upload'
import Results from './screens/Results'
import Recommend from './screens/Recommend'
import Intake from './screens/Intake'
import Report from './screens/Report'
import Onboarding from './screens/Onboarding'

export type Route = 'home' | 'upload' | 'results' | 'recommend' | 'intake' | 'report'

const NAV: { id: Route; label: string; short: string; title: string; sub: string }[] = [
  { id: 'home', label: '홈', short: '홈', title: '검진 알림', sub: '올해 검진 대상인지, 어디서 받을 수 있는지 확인합니다.' },
  { id: 'upload', label: '결과지 등록', short: '등록', title: '건강검진 결과지 등록', sub: '결과지를 찍거나 PDF를 올리면 수치를 자동으로 읽습니다.' },
  { id: 'results', label: '검진 해석', short: '해석', title: '검진 해석', sub: '수치를 쉬운 말로 풀고, 신경 써야 할 항목을 먼저 보여 줍니다.' },
  { id: 'recommend', label: '맞춤 추천', short: '추천', title: '맞춤 영양 구성', sub: '검진 수치·생활습관·복용 약을 함께 보고 고릅니다.' },
  { id: 'intake', label: '복용 관리', short: '복용', title: '복용 관리', sub: '시간대별로 챙기고, 꾸준히 먹었는지 기록합니다.' },
  { id: 'report', label: '변화 리포트', short: '리포트', title: '변화 리포트', sub: '복용 전후 검진 수치를 비교합니다.' },
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
      <div className="main">
        <section className="box stack" style={{ maxWidth: 560 }}>
          <h2>{store.remoteError ? '서버에 연결하지 못했습니다' : '서버에서 불러오는 중입니다'}</h2>
          <p className="muted">{store.remoteError ?? '잠시만 기다려 주세요.'}</p>
          {store.remoteError && <p className="small muted">backend 폴더에서 <code>uvicorn app.main:app --port 8000</code>을 먼저 실행했는지 확인해 주세요.</p>}
        </section>
      </div>
    )
  }
  if (!store.profile) return <Onboarding onDone={() => go('home')} />
  const p = store.profile

  return (
    <>
      <header className="top">
        <div className="top-in">
          <Wordmark />
          <span className="who">{p.name} 님 · {new Date().getFullYear() - p.birthYear}세 · {p.sex === 'M' ? '남' : '여'}</span>
        </div>
        <nav className="flow" aria-label="검진 순서">
          {NAV.map((n, i) => (
            <span key={n.id} style={{ display: 'contents' }}>
              {i > 0 && <span className="sep" aria-hidden="true" />}
              <button aria-current={route === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
                <span className="n">{i + 1}</span>
                <span className="lbl-long">{n.label}</span>
                <span className="lbl-short">{n.short}</span>
              </button>
            </span>
          ))}
        </nav>
      </header>
      <main className="main">
        <div className="page-head">
          <h1>{page.title}</h1>
          <p>{page.sub}</p>
        </div>
        <div className="page">
          {route === 'home' && <Home go={go} />}
          {route === 'upload' && <Upload go={go} />}
          {route === 'results' && <Results go={go} />}
          {route === 'recommend' && <Recommend go={go} />}
          {route === 'intake' && <Intake />}
          {route === 'report' && <Report go={go} />}
        </div>
        <footer className="demo-foot">
          <span><b>{USE_API ? '서버 연결 모드' : '시연 모드'}</b> · 가상 인물 {p.name} 님의 데이터입니다.
            {store.remoteError && <span style={{ color: 'var(--danger)' }}> {store.remoteError}</span>}</span>
          {USE_API ? <button className="btn ghost sm" onClick={() => { store.resetFull(); go('home') }}>시연 데이터 초기화</button> : <span className="row">
            <button className="btn ghost sm" onClick={() => { store.resetFresh() }}>처음부터</button>
            <button className="btn ghost sm" onClick={() => { store.resetFull(); go('home') }}>완성 상태</button>
          </span>}
        </footer>
      </main>
    </>
  )
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>
}
