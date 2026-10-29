import { useState } from 'react'
import { useStore } from '../store'
import { Wordmark } from '../ui'

// 서버 연결 모드의 첫 화면: 로그인, 회원가입, 가입 없이 체험하기.
export default function Login() {
  const s = useStore()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const attempt = async (job: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await job() } catch (e) { setError(e instanceof Error ? e.message : '잠시 후 다시 해 주십시오.') }
    setBusy(false)
  }
  const submit = () => {
    if (mode === 'signup' && password !== confirm) { setError('비밀번호 확인이 맞지 않습니다.'); return }
    attempt(() => (mode === 'login' ? s.login : s.signup)(username.trim(), password))
  }

  return (
    <div className="main narrow">
      <form className="page" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <div className="hero">
          <Wordmark />
          <h1>{mode === 'login' ? '로그인' : '회원가입'}</h1>
          <p>검진 결과와 복용 기록을 내 계정에 따로 저장합니다</p>
        </div>

        <section className="sec">
          <div className="seg" role="group" aria-label="로그인 또는 회원가입">
            <button type="button" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(null) }}>로그인</button>
            <button type="button" aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setError(null) }}>회원가입</button>
          </div>
          <div className="field"><label htmlFor="lg-id">아이디</label>
            <input id="lg-id" value={username} autoComplete="username" autoCapitalize="none" required
              placeholder={mode === 'signup' ? '영문 소문자·숫자·밑줄 4~20자' : ''} onChange={(e) => setUsername(e.target.value)} /></div>
          <div className="field"><label htmlFor="lg-pw">비밀번호</label>
            <input id="lg-pw" type="password" value={password} required minLength={mode === 'signup' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'signup' ? '8자 이상' : ''} onChange={(e) => setPassword(e.target.value)} /></div>
          {mode === 'signup' && (
            <div className="field"><label htmlFor="lg-pw2">비밀번호 확인</label>
              <input id="lg-pw2" type="password" value={confirm} required autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} /></div>
          )}
          {error && <p className="small" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="actions">
            <button className="btn" type="submit" disabled={busy}>{mode === 'login' ? '로그인' : '가입하고 시작하기'}</button>
          </div>
          {mode === 'signup' && <p className="small muted">비밀번호는 복원할 수 없는 형태로 바꿔 저장합니다. 잊어버리면 찾을 수 없으니 따로 적어 두십시오.</p>}
        </section>

        <section className="sec">
          <div className="sec-head"><h2>가입 없이 둘러보기</h2></div>
          <p className="small muted">가상 인물의 검진·복용 기록으로 모든 화면을 써 볼 수 있습니다. 체험 기록은 2일 뒤 지워집니다.</p>
          <div className="actions">
            <button className="btn flat strong" type="button" disabled={busy} onClick={() => attempt(s.startGuest)}>체험하기</button>
          </div>
        </section>
        <p className="small muted" style={{ padding: '0 4px' }}>시연용 서비스입니다. 실제 검진 결과나 개인정보는 입력하지 마십시오.</p>
      </form>
    </div>
  )
}
