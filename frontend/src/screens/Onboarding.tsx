import { useState } from 'react'
import { useStore } from '../store'
import { Wordmark } from '../ui'
import { MEDICATION_OPTIONS, SAMPLE_PROFILE, SUPPLEMENT_OPTIONS } from '../data/mock'
import type { UserProfile } from '../types'

function Chips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o} className="chip" aria-pressed={value.includes(o)}
          onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}>{o}</button>
      ))}
    </div>
  )
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { setProfile } = useStore()
  // 시연을 빠르게 하도록 가상 인물 값으로 미리 채워 둔다.
  const [p, setP] = useState<UserProfile>(SAMPLE_PROFILE)
  const upd = (patch: Partial<UserProfile>) => setP((x) => ({ ...x, ...patch }))
  const life = (patch: Partial<UserProfile['lifestyle']>) => setP((x) => ({ ...x, lifestyle: { ...x.lifestyle, ...patch } }))

  return (
    <div className="main">
      <form className="stack" style={{ maxWidth: 680, gap: 24 }}
        onSubmit={(e) => { e.preventDefault(); setProfile(p); onDone() }}>
        <Wordmark />
        <div className="stack" style={{ gap: 6 }}>
          <h1>검진 알림을 받으려면 기본 정보가 필요합니다</h1>
          <p className="muted">출생연도로 올해 국가건강검진 대상인지 계산하고, 복용 약은 영양제 상호작용 확인에 씁니다.</p>
        </div>

        <div className="grid-2">
          <div className="field"><label htmlFor="ob-name">이름</label>
            <input id="ob-name" value={p.name} onChange={(e) => upd({ name: e.target.value })} required /></div>
          <div className="field"><label htmlFor="ob-year">출생연도</label>
            <input id="ob-year" type="number" min={1930} max={2008} value={p.birthYear} onChange={(e) => upd({ birthYear: Number(e.target.value) })} required /></div>
          <div className="field"><label htmlFor="ob-sex">성별</label>
            <select id="ob-sex" value={p.sex} onChange={(e) => upd({ sex: e.target.value as UserProfile['sex'] })}>
              <option value="M">남성</option><option value="F">여성</option>
            </select></div>
          <div className="field"><label htmlFor="ob-region">사는 곳</label>
            <input id="ob-region" value={p.region} onChange={(e) => upd({ region: e.target.value })} /></div>
          <div className="field"><label htmlFor="ob-last">마지막 검진 연도</label>
            <input id="ob-last" type="number" value={p.lastCheckupYear ?? ''} onChange={(e) => upd({ lastCheckupYear: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="field"><label htmlFor="ob-drink">음주 (주 몇 회)</label>
            <input id="ob-drink" type="number" min={0} max={7} value={p.lifestyle.drinkingPerWeek} onChange={(e) => life({ drinkingPerWeek: Number(e.target.value) })} /></div>
        </div>

        <div className="field"><span className="label">복용 중인 약</span>
          <Chips options={MEDICATION_OPTIONS} value={p.medications} onChange={(v) => upd({ medications: v })} /></div>
        <div className="field"><span className="label">이미 먹고 있는 영양제</span>
          <Chips options={SUPPLEMENT_OPTIONS} value={p.currentSupplements} onChange={(v) => upd({ currentSupplements: v })} /></div>
        <div className="field"><span className="label">생활습관</span>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={p.lifestyle.smoking} onClick={() => life({ smoking: !p.lifestyle.smoking })}>흡연</button>
            <button type="button" className="chip" aria-pressed={p.lifestyle.lowOutdoor} onClick={() => life({ lowOutdoor: !p.lifestyle.lowOutdoor })}>낮 시간 대부분 실내</button>
            <button type="button" className="chip" aria-pressed={p.lifestyle.exercisePerWeek >= 3} onClick={() => life({ exercisePerWeek: p.lifestyle.exercisePerWeek >= 3 ? 1 : 3 })}>주 3회 이상 운동</button>
          </div></div>

        <div><button className="btn" type="submit">검진 대상 확인하기</button></div>
      </form>
    </div>
  )
}
