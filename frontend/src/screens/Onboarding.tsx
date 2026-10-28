import { useState } from 'react'
import { useStore } from '../store'
import { Wordmark } from '../ui'
import { ALLERGY_OPTIONS, CONDITION_OPTIONS, DIET_OPTIONS, MEDICATION_GROUPS, SAMPLE_PROFILE, SUPPLEMENT_OPTIONS } from '../data/mock'
import type { Lifestyle, UserProfile } from '../types'

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

// 보기 칩 + '없음' + 직접 입력. 보기에 없는 값은 직접 입력한 것으로 보고 따로 칩을 보여 준다.
function Pick({ options, value, onChange, none = true, custom, placeholder }: {
  options: string[]; value: string[]; onChange: (v: string[]) => void; none?: boolean; custom?: string[]; placeholder?: string
}) {
  const [text, setText] = useState('')
  const extra = value.filter((v) => !(custom ?? options).includes(v))
  const add = () => { const t = text.trim(); if (t && !value.includes(t)) onChange([...value, t]); setText('') }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="chips">
        {none && <button type="button" className="chip" aria-pressed={!value.length} onClick={() => onChange([])}>없음</button>}
        {options.map((o) => <button type="button" key={o} className="chip" aria-pressed={value.includes(o)} onClick={() => onChange(toggle(value, o))}>{o}</button>)}
        {extra.map((o) => <button type="button" key={o} className="chip" aria-pressed="true" aria-label={`${o} 빼기`} onClick={() => onChange(toggle(value, o))}>{o} ×</button>)}
      </div>
      {placeholder && (
        <div className="row" style={{ flexWrap: 'nowrap', maxWidth: 420 }}>
          <div className="field" style={{ flex: 1, minWidth: 0 }}>
            <input style={{ width: '100%' }} aria-label={placeholder} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
          </div>
          <button type="button" className="btn ghost sm" onClick={add} disabled={!text.trim()}>추가</button>
        </div>
      )}
    </div>
  )
}

function Seg<T extends string | number>({ label, options, value, onChange }: { label: string; options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="field"><span className="label">{label}</span>
      <div><div className="seg" role="group" aria-label={label}>
        {options.map(([v, l]) => <button type="button" key={String(v)} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
      </div></div>
    </div>
  )
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { setProfile } = useStore()
  // 시연을 빠르게 하도록 가상 인물 값으로 미리 채워 둔다.
  const [p, setP] = useState<UserProfile>(SAMPLE_PROFILE)
  const upd = (patch: Partial<UserProfile>) => setP((x) => ({ ...x, ...patch }))
  const life = (patch: Partial<Lifestyle>) => setP((x) => ({ ...x, lifestyle: { ...x.lifestyle, ...patch } }))
  const L = p.lifestyle
  const allMeds = MEDICATION_GROUPS.flatMap((g) => g.items)
  const customMeds = p.medications.filter((m) => !allMeds.includes(m))

  return (
    <div className="main">
      <form className="page" style={{ maxWidth: 760, gap: 40 }}
        onSubmit={(e) => { e.preventDefault(); setProfile({ ...p, pregnant: p.sex === 'F' ? p.pregnant : false }); onDone() }}>
        <div className="stack" style={{ gap: 14 }}>
          <Wordmark />
          <h1>검진 알림과 맞춤 추천에 필요한 정보를 알려 주세요</h1>
          <p className="muted">출생연도로 올해 국가건강검진 대상인지 계산하고, 복용 약·질환·알레르기는 영양제와 부딪히는 성분을 거르는 데 씁니다. 모르는 항목은 비워 두셔도 됩니다.</p>
        </div>

        <section className="sec">
          <div className="sec-head"><h2>기본 정보</h2></div>
          <div className="grid-2">
            <div className="field"><label htmlFor="ob-name">이름</label>
              <input id="ob-name" value={p.name} onChange={(e) => upd({ name: e.target.value })} required /></div>
            <div className="field"><label htmlFor="ob-year">출생연도</label>
              <input id="ob-year" type="number" min={1930} max={2008} value={p.birthYear} onChange={(e) => upd({ birthYear: Number(e.target.value) })} required /></div>
            <Seg label="성별" options={[['M', '남성'], ['F', '여성']]} value={p.sex} onChange={(v) => upd({ sex: v })} />
            {p.sex === 'F'
              ? <Seg label="임신·수유 중" options={[[0, '아니요'], [1, '예']]} value={p.pregnant ? 1 : 0} onChange={(v) => upd({ pregnant: v === 1 })} />
              : <span />}
            <div className="field"><label htmlFor="ob-region">사는 곳</label>
              <input id="ob-region" value={p.region} placeholder="예: 서울 마포구" onChange={(e) => upd({ region: e.target.value })} /></div>
            <div className="field"><label htmlFor="ob-last">마지막 검진 연도</label>
              <input id="ob-last" type="number" value={p.lastCheckupYear ?? ''} onChange={(e) => upd({ lastCheckupYear: e.target.value ? Number(e.target.value) : null })} /></div>
          </div>
        </section>

        <section className="sec">
          <div className="sec-head"><h2>복용 중인 약</h2><p>여러 개 고를 수 있습니다</p></div>
          <div className="chips"><button type="button" className="chip" aria-pressed={!p.medications.length} onClick={() => upd({ medications: [] })}>먹는 약 없음</button></div>
          <ul className="rows">
            {MEDICATION_GROUPS.map((g) => (
              <li key={g.group} className="opt-row">
                <span className="label">{g.group}</span>
                <div className="chips">{g.items.map((m) => (
                  <button type="button" key={m} className="chip" aria-pressed={p.medications.includes(m)} onClick={() => upd({ medications: toggle(p.medications, m) })}>{m}</button>
                ))}</div>
              </li>
            ))}
            <li className="opt-row">
              <span className="label">직접 입력</span>
              <Pick options={[]} custom={allMeds} value={customMeds} none={false} placeholder="약 이름 (예: 알렌드로네이트)"
                onChange={(v) => upd({ medications: [...p.medications.filter((m) => allMeds.includes(m)), ...v] })} />
            </li>
          </ul>
        </section>

        <section className="sec">
          <div className="sec-head"><h2>이미 먹고 있는 영양제</h2></div>
          <Pick options={SUPPLEMENT_OPTIONS} value={p.currentSupplements} onChange={(v) => upd({ currentSupplements: v })} placeholder="영양제 이름" />
        </section>

        <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 40 }}>
          <section className="sec">
            <div className="sec-head"><h2>진단받은 질환</h2></div>
            <p className="small muted">병원에서 진단받은 적이 있는 것만 고르세요. 영양제 주의 문구를 고르는 데만 씁니다.</p>
            <Pick options={CONDITION_OPTIONS} value={p.conditions ?? []} onChange={(v) => upd({ conditions: v })} />
          </section>
          <section className="sec">
            <div className="sec-head"><h2>알레르기</h2></div>
            <p className="small muted">영양제 원료에 들어 있을 수 있는 것을 확인합니다.</p>
            <Pick options={ALLERGY_OPTIONS} value={p.allergies ?? []} onChange={(v) => upd({ allergies: v })} placeholder="그 밖의 알레르기" />
          </section>
        </div>

        <section className="sec">
          <div className="sec-head"><h2>생활습관</h2></div>
          <div className="grid-2">
            <Seg label="흡연" options={[['never', '안 피움'], ['past', '과거에 피움'], ['current', '지금 피움']]} value={L.smokingStatus ?? (L.smoking ? 'current' : 'never')}
              onChange={(v) => life({ smokingStatus: v, smoking: v === 'current' })} />
            <Seg label="낮 시간 대부분" options={[[0, '실외 활동 있음'], [1, '실내']]} value={L.lowOutdoor ? 1 : 0} onChange={(v) => life({ lowOutdoor: v === 1 })} />
            <div className="field"><label htmlFor="ob-drink">술 마시는 횟수</label>
              <select id="ob-drink" value={L.drinkingPerWeek} onChange={(e) => life({ drinkingPerWeek: Number(e.target.value) })}>
                <option value={0}>마시지 않음</option>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>주 {n}회{n === 7 ? ' (매일)' : ''}</option>)}
              </select></div>
            <div className="field"><label htmlFor="ob-amount">한 번에 마시는 양 (소주 잔 기준)</label>
              <select id="ob-amount" value={L.drinksPerSession ?? 0} disabled={!L.drinkingPerWeek} onChange={(e) => life({ drinksPerSession: Number(e.target.value) })}>
                <option value={0}>-</option><option value={2}>1~2잔</option><option value={4}>3~4잔</option><option value={6}>5~7잔(반병~1병)</option><option value={10}>1병 넘게</option>
              </select></div>
            <div className="field"><label htmlFor="ob-ex">운동 (30분 이상)</label>
              <select id="ob-ex" value={L.exercisePerWeek} onChange={(e) => life({ exercisePerWeek: Number(e.target.value) })}>
                <option value={0}>거의 안 함</option>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>주 {n}회</option>)}
              </select></div>
            <div className="field"><label htmlFor="ob-sleep">하루 수면</label>
              <select id="ob-sleep" value={L.sleepHours ?? 7} onChange={(e) => life({ sleepHours: Number(e.target.value) })}>
                <option value={5}>5시간 이하</option><option value={6}>6시간</option><option value={7}>7시간</option><option value={8}>8시간</option><option value={9}>9시간 이상</option>
              </select></div>
          </div>
          <div className="field"><span className="label">식습관 (해당하는 것 모두)</span>
            <Pick options={DIET_OPTIONS} value={L.diet ?? []} none={false} onChange={(v) => life({ diet: v })} /></div>
        </section>

        <div className="stack" style={{ gap: 12 }}>
          <p className="small muted">복용 약과 질환은 건강에 관한 민감정보입니다. 시연 모드에서는 이 브라우저에만 저장되고 서버로 보내지 않습니다.</p>
          <div><button className="btn" type="submit">검진 대상 확인하기</button></div>
        </div>
      </form>
    </div>
  )
}
