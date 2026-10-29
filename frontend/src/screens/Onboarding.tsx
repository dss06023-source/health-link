import { useState } from 'react'
import { useStore } from '../store'
import { Icon, Sheet, Wordmark } from '../ui'
import { ALLERGY_OPTIONS, CONDITION_OPTIONS, DIET_OPTIONS, MEDICATION_GROUPS, SAMPLE_PROFILE, SUPPLEMENT_OPTIONS } from '../data/mock'
import type { Lifestyle, UserProfile } from '../types'
import { loadTheme, saveTheme, type Theme } from '../theme'

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
          <button type="button" className="btn flat sm strong" onClick={add} disabled={!text.trim()}>추가</button>
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

export default function Onboarding({ onDone, onCancel, initial }: { onDone: () => void; onCancel?: () => void; initial?: UserProfile }) {
  const { setProfile } = useStore()
  // 처음 쓸 때는 시연을 빠르게 하도록 가상 인물 값으로 미리 채워 둔다. 내 정보 수정은 지금 값에서 시작.
  const [p, setP] = useState<UserProfile>(initial ?? SAMPLE_PROFILE)
  const [group, setGroup] = useState<string | null>(null)
  const [draft, setDraft] = useState<string[]>([])
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const thisYear = new Date().getFullYear()
  const upd = (patch: Partial<UserProfile>) => setP((x) => ({ ...x, ...patch }))
  const life = (patch: Partial<Lifestyle>) => setP((x) => ({ ...x, lifestyle: { ...x.lifestyle, ...patch } }))
  const L = p.lifestyle
  const allMeds = MEDICATION_GROUPS.flatMap((g) => g.items)
  const customMeds = p.medications.filter((m) => !allMeds.includes(m))

  return (
    <>
    {initial && (
      <header className="appbar scrolled">
        <div className="bar-in">
          <button type="button" className="icon-btn" aria-label="돌아가기" onClick={onCancel}><span className="flip"><Icon name="chevron" size={22} /></span></button>
          <span className="bar-title">내 정보</span>
        </div>
      </header>
    )}
    <div className="main narrow">
      <form className="page"
        onSubmit={(e) => { e.preventDefault(); setProfile({ ...p, pregnant: p.sex === 'F' ? p.pregnant : false }); onDone() }}>
        <div className="hero">
          {!initial && <Wordmark />}
          <h1>{initial ? '내 정보' : '필요한 정보를 알려 주세요'}</h1>
          <p>{initial ? '바꾼 내용은 검진 알림과 추천에 바로 반영돼요' : '검진 대상 확인과 영양제 추천에 써요'}</p>
        </div>
        <p className="small muted" style={{ padding: '0 4px' }}>출생연도로 올해 국가건강검진 대상인지 계산하고, 복용 약·질환·알레르기는 영양제와 부딪히는 성분을 거르는 데 씁니다. 모르는 항목은 비워 두셔도 됩니다.</p>

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
            <Seg label="직장 유형" options={[['office', '사무직'], ['nonOffice', '비사무직'], ['other', '직장 없음·기타']]}
              value={p.jobType ?? 'office'} onChange={(v) => upd({ jobType: v })} />
            <Seg label={`공단 조회 결과 ${thisYear}년 검진`} options={[[0, '모름·대상 아님'], [1, '대상자']]}
              value={p.confirmedTargetYear === thisYear ? 1 : 0} onChange={(v) => upd({ confirmedTargetYear: v ? thisYear : null })} />
          </div>
          <p className="small muted">비사무직(현장·생산·판매직 등) 직장가입자는 해마다 대상입니다. 작년에 못 받아 추가 등록했다면 공단 조회 결과로 '대상자'를 고르세요. 고른 값이 출생연도 짝·홀 규칙보다 우선합니다.</p>
        </section>

        <div>
          <h2 className="subhead">복용 중인 약 <span>계열을 눌러 고르세요 · {p.medications.length ? `${p.medications.length}개 선택` : '없음'}</span></h2>
          <ul className="list">
            <li className="li">
              <span className="li-main"><b>먹는 약 없음</b></span>
              <button type="button" className="switch" role="switch" aria-checked={!p.medications.length} aria-label="먹는 약 없음"
                onClick={() => upd({ medications: [] })} />
            </li>
            {MEDICATION_GROUPS.map((g) => {
              const on = g.items.filter((m) => p.medications.includes(m))
              return (
                <li key={g.group}>
                  <button type="button" className="li" onClick={() => { setGroup(g.group); setDraft(on) }}>
                    <span className="li-main"><b>{g.group}</b>{on.length > 0 && <small className="picked-line">{on.join(', ')}</small>}</span>
                    <span className="li-end">{on.length ? `${on.length}개` : '선택'}<Icon name="chevron" size={16} /></span>
                  </button>
                </li>
              )
            })}
            <li className="li">
              <div className="li-main"><b>직접 입력</b>
                <Pick options={[]} custom={allMeds} value={customMeds} none={false} placeholder="약 이름 (예: 알렌드로네이트)"
                  onChange={(v) => upd({ medications: [...p.medications.filter((m) => allMeds.includes(m)), ...v] })} /></div>
            </li>
          </ul>
        </div>

        <section className="sec">
          <div className="sec-head"><h2>이미 먹고 있는 영양제</h2></div>
          <Pick options={SUPPLEMENT_OPTIONS} value={p.currentSupplements} onChange={(v) => upd({ currentSupplements: v })} placeholder="영양제 이름" />
        </section>

        <div className="cols even">
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

        {initial && (
          <section className="sec">
            <div className="sec-head"><h2>화면 모드</h2></div>
            <Seg label="화면 밝기" options={[['light', '밝게'], ['dark', '어둡게'], ['system', '기기 설정 따르기']]} value={theme}
              onChange={(v) => { setTheme(v); saveTheme(v) }} />
            <p className="small muted">바로 적용되고, 이 기기에 저장됩니다.</p>
          </section>
        )}

        <div className="stack" style={{ gap: 12 }}>
          <p className="small muted" style={{ padding: '0 4px' }}>복용 약과 질환은 건강에 관한 민감정보입니다. 시연 모드에서는 이 브라우저에만 저장되고 서버로 보내지 않습니다.</p>
          <div className="actions">
            {initial && <button type="button" className="btn flat" onClick={onCancel}>취소</button>}
            <button className="btn" type="submit">{initial ? '저장' : '검진 대상 확인하기'}</button>
          </div>
        </div>
      </form>
    </div>
    {group && (() => {
      const g = MEDICATION_GROUPS.find((x) => x.group === group)!
      return (
        <Sheet title={g.group} onClose={() => setGroup(null)}
          actions={<><button type="button" className="btn flat" onClick={() => setGroup(null)}>취소</button>
            <button type="button" className="btn flat strong" onClick={() => {
              upd({ medications: [...p.medications.filter((m) => !g.items.includes(m)), ...draft] }); setGroup(null)
            }}>완료</button></>}>
          <ul className="check-list">
            {g.items.map((m) => (
              <li key={m}><label className="check-row">
                <input type="checkbox" checked={draft.includes(m)} onChange={() => setDraft(toggle(draft, m))} />
                <span>{m}</span>
              </label></li>
            ))}
          </ul>
        </Sheet>
      )
    })()}
    </>
  )
}
