import { useState } from 'react'
import type { Route } from '../App'
import { useStore } from '../store'
import type { MydataResult } from '../types'
import { Icon } from '../ui'

// 건강정보 마이데이터 연동(가상). 동의 → 가져오기 → 처방 약을 복용 약에 넣을지 고른다.
export default function Mydata({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MydataResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function sync(apply: boolean) {
    setBusy(true); setError(null)
    try { setResult(await s.mydataSync(apply)) } catch (e) { setError(e instanceof Error ? e.message : '가져오지 못했습니다.') }
    setBusy(false)
  }
  const missing = result?.prescriptions.filter((p) => !p.registered && !s.profile?.medications.includes(p.name)) ?? []

  return (
    <section className="sec">
      <div className="sec-head">
        <h2>마이데이터로 지난 검진 불러오기</h2>
        <p>{s.mydata.connected ? `연동됨${s.mydata.lastSyncAt ? ` · 마지막 ${s.mydata.lastSyncAt}` : ''}` : '연동 전'}</p>
      </div>
      <p className="muted">건강정보 고속도로에서 지난 검진 결과와 처방 기록을 받아 오는 과정을 가상 데이터로 보여 줍니다. 실제 인증이나 전송은 하지 않습니다.</p>

      {!s.mydata.connected ? (
        <div className="stack">
          <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 4 }} />
            <span className="small">건강검진 결과와 처방(투약) 정보를 건강잇다로 보내는 데 동의합니다. 건강정보는 민감정보로, 동의는 언제든 철회할 수 있습니다.</span>
          </label>
          <div><button className="btn" disabled={!agree} onClick={() => s.mydataConnect()}>동의하고 연동하기</button></div>
        </div>
      ) : (
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => sync(false)}>{busy ? '불러오는 중…' : '지금 불러오기'}</button>
          <button className="btn ghost" onClick={() => { s.mydataDisconnect(); setResult(null); setAgree(false) }}>연동 해제</button>
        </div>
      )}
      {error && <div className="alert"><Icon name="alert" /><div><p className="small">{error}</p></div></div>}

      {result && (
        <div className="stack">
          <ul className="rows">
            {result.imported.map((c) => (
              <li key={c.date} className="row" style={{ justifyContent: 'space-between' }}>
                <span><b>{c.date.slice(0, 4)}년 검진</b> <span className="small muted">{c.date} · {c.institution}</span></span>
                <span className="small">새로 가져옴</span>
              </li>
            ))}
            {result.skipped.map((d) => (
              <li key={d} className="row" style={{ justifyContent: 'space-between' }}>
                <span><b>{d.slice(0, 4)}년 검진</b> <span className="small muted">{d}</span></span>
                <span className="small muted">이미 있음</span>
              </li>
            ))}
            {result.prescriptions.map((p) => (
              <li key={p.name} className="row" style={{ justifyContent: 'space-between' }}>
                <span><b>{p.name}</b> <span className="small muted">처방 {p.dispensedAt} · {p.institution}</span></span>
                <span className="small muted">{p.registered || s.profile?.medications.includes(p.name) ? '복용 약에 있음' : '복용 약에 없음'}</span>
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <div className="callout caution">
              <p className="small">처방 기록에 복용 약 목록에 없는 약이 있습니다: <b>{missing.map((p) => p.name).join(', ')}</b>. 추가하면 영양제 추천의 약물 경고에 반영됩니다.</p>
              <div><button className="btn sm" disabled={busy} onClick={() => sync(true)}>복용 약에 추가</button></div>
            </div>
          )}
          {result.imported.length > 0 && <div><button className="btn ghost" onClick={() => go('results')}>검진 추이 보기</button></div>}
        </div>
      )}
    </section>
  )
}
