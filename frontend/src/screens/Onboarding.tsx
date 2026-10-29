import { useState } from 'react'
import { useStore } from '../store'
import { CANCERS } from '../data/rules'
import { Icon, Sheet, Wordmark } from '../ui'
import { ALLERGY_OPTIONS, CONDITION_OPTIONS, DIET_OPTIONS, MEDICATION_GROUPS, SAMPLE_PROFILE, SUPPLEMENT_OPTIONS } from '../data/mock'
import type { Lifestyle, UserProfile } from '../types'
import { loadTheme, saveTheme, type Theme } from '../theme'
import { USE_API } from '../api'
import { regionLabel } from '../data/regions'
import AddressField from './AddressField'

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

// 새로 가입한 계정은 빈 값에서 시작한다(모의 모드는 시연을 빠르게 하려고 가상 인물 값으로 채운다).
const BLANK_PROFILE: UserProfile = {
  name: '', birthYear: 1990, sex: 'M', region: '', lastCheckupYear: null, medications: [], currentSupplements: [],
  lifestyle: { smoking: false, smokingStatus: 'never', drinkingPerWeek: 0, drinksPerSession: 0, exercisePerWeek: 0, lowOutdoor: false, sleepHours: 7, diet: [] },
  conditions: [], allergies: [],
}

export default function Onboarding({ onDone, onCancel, initial }: { onDone: () => void; onCancel?: () => void; initial?: UserProfile }) {
  const { setProfile, account, logout, deleteAccount } = useStore()
  const [leaving, setLeaving] = useState(false)
  // 처음 쓸 때는 시연을 빠르게 하도록 가상 인물 값으로 미리 채워 둔다. 내 정보 수정은 지금 값에서 시작.
  const [p, setP] = useState<UserProfile>(initial ?? (USE_API ? BLANK_PROFILE : SAMPLE_PROFILE))
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
        onSubmit={(e) => { e.preventDefault(); setProfile({ ...p, pregnant: p.sex === 'F' ? p.pregnant : false, region: p.address?.sido ? regionLabel(p.address.sido, p.address.sigungu) : p.region }); onDone() }}>
        <div className="hero">
          {!initial && <Wordmark />}
          <h1>{initial ? '내 정보' : '필요한 정보를 알려 주십시오'}</h1>
          <p>{initial ? '바꾼 내용은 검진 알림과 추천에 바로 반영됩니다' : '검진 대상 확인과 영양제 추천에 씁니다'}</p>
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
            <div className="field"><label htmlFor="ob-height">키 (cm)</label>
              <input id="ob-height" type="number" inputMode="decimal" min={100} max={230} step="0.1" placeholder="예: 170"
                value={p.heightCm ?? ''} onChange={(e) => upd({ heightCm: e.target.value ? Number(e.target.value) : undefined })} /></div>
            <div className="field"><label htmlFor="ob-weight">몸무게 (kg)</label>
              <input id="ob-weight" type="number" inputMode="decimal" min={20} max={300} step="0.1" placeholder="예: 65"
                aria-describedby="ob-bmi" value={p.weightKg ?? ''} onChange={(e) => upd({ weightKg: e.target.value ? Number(e.target.value) : undefined })} />
              {p.heightCm && p.weightKg ? <small id="ob-bmi" className="muted">체질량지수 {(p.weightKg / (p.heightCm / 100) ** 2).toFixed(1)}</small> : null}</div>
            <div className="field"><label htmlFor="ob-last">마지막 검진 연도</label>
              <input id="ob-last" type="number" value={p.lastCheckupYear ?? ''} placeholder="예: 2024" aria-describedby="ob-last-hint" onChange={(e) => upd({ lastCheckupYear: e.target.value ? Number(e.target.value) : null })} />
              <small id="ob-last-hint" className="muted">받은 적 없으면 비워 두십시오.</small></div>
            <Seg label="직장 유형" options={[['office', '사무직'], ['nonOffice', '비사무직'], ['other', '직장 없음·기타']]}
              value={p.jobType ?? 'office'} onChange={(v) => upd({ jobType: v })} />
            <Seg label={`공단 조회 결과 ${thisYear}년 검진`} options={[[0, '모름·대상 아님'], [1, '대상자']]}
              value={p.confirmedTargetYear === thisYear ? 1 : 0} onChange={(v) => upd({ confirmedTargetYear: v ? thisYear : null })} />
          </div>
          <p className="small muted">비사무직(현장·생산·판매직 등) 직장가입자는 해마다 대상입니다. 작년에 못 받아 추가 등록했다면 공단 조회 결과로 '대상자'를 고르십시오. 고른 값이 출생연도 짝·홀 규칙보다 우선합니다.</p>
        </section>

        <section className="sec">
          <div className="sec-head"><h2>사는 곳</h2></div>
          <AddressField value={p.address} onChange={(address) => upd({ address })} />
          <p className="small muted">가까운 검진기관을 이 주소 기준으로 찾습니다. 도로명주소까지 고르면 더 정확합니다.</p>
        </section>

        <section className="sec">
          <div className="sec-head"><h2>암검진 대상 확인</h2></div>
          <div className="grid-2">
            <Seg label="간암 고위험군" options={[[0, '아니요·모름'], [1, '예']]} value={p.liverHighRisk ? 1 : 0} onChange={(v) => upd({ liverHighRisk: v === 1 })} />
            <div className="field"><label htmlFor="ob-pack">흡연량 (갑년)</label>
              <input id="ob-pack" type="number" min={0} max={200} placeholder="하루 갑 수 × 피운 햇수" value={p.packYears ?? ''}
                onChange={(e) => upd({ packYears: e.target.value ? Number(e.target.value) : null })} /></div>
            <div className="field"><label htmlFor="ob-colo">마지막 대장내시경 연도</label>
              <input id="ob-colo" type="number" min={1990} max={thisYear} placeholder="받은 적 없으면 비워 두십시오" value={p.colonoscopyYear ?? ''}
                onChange={(e) => upd({ colonoscopyYear: e.target.value ? Number(e.target.value) : null })} /></div>
          </div>
          <div className="field"><span className="label">암 산정특례 중인 암</span>
            <Pick options={CANCERS.map((c) => c.name)} value={CANCERS.filter((c) => p.cancerSpecialCase?.includes(c.id)).map((c) => c.name)}
              onChange={(v) => upd({ cancerSpecialCase: CANCERS.filter((c) => v.includes(c.name)).map((c) => c.id) })} /></div>
          <p className="small muted">간암 고위험군은 B형간염 표면항원 양성, C형간염 항체 양성, B·C형 간염에 의한 만성 간질환, 간경변증입니다. 폐암검진은 54~74세이면서 30갑년 이상 흡연한 분이 대상입니다. 암 산정특례 중이거나 대장내시경 후 5년이 지나지 않았으면 해당 암검진에서 빠지고, 원하면 추가등록할 수 있습니다.</p>
        </section>

        <div>
          <h2 className="subhead">복용 중인 약 <span>계열을 눌러 고르십시오 · {p.medications.length ? `${p.medications.length}개 선택` : '없음'}</span></h2>
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
            <p className="small muted">병원에서 진단받은 적이 있는 것만 고르십시오. 영양제 주의 문구를 고르는 데만 씁니다.</p>
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

        {initial && USE_API && account && (
          <section className="sec">
            <div className="sec-head"><h2>계정</h2></div>
            <p className="small muted">{account.isGuest ? '체험 계정입니다. 기록은 2일 뒤 지워집니다.' : `아이디 ${account.username}(으)로 로그인했습니다.`}</p>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn flat sm" onClick={() => logout()}>로그아웃</button>
              {!account.isGuest && <button type="button" className="btn flat sm danger" onClick={() => setLeaving(true)}>회원 탈퇴</button>}
            </div>
          </section>
        )}

        <div className="stack" style={{ gap: 12 }}>
          <p className="small muted" style={{ padding: '0 4px' }}>복용 약과 질환은 건강에 관한 민감정보입니다. {USE_API
            ? '입력한 정보는 내 계정에만 저장되고 다른 사람은 볼 수 없습니다. 시연용 서비스이므로 실제 정보는 입력하지 마십시오.'
            : '시연 모드에서는 이 브라우저에만 저장되고 서버로 보내지 않습니다.'}</p>
          <div className="actions">
            {initial && <button type="button" className="btn flat" onClick={onCancel}>취소</button>}
            <button className="btn" type="submit">{initial ? '저장' : '검진 대상 확인하기'}</button>
          </div>
        </div>
      </form>
      {leaving && (
        <Sheet title="탈퇴하시겠습니까?" onClose={() => setLeaving(false)}
          actions={<><button className="btn flat" onClick={() => setLeaving(false)}>취소</button>
            <button className="btn flat danger" onClick={() => { setLeaving(false); deleteAccount() }}>탈퇴</button></>}>
          <p className="small muted">계정과 검진 결과, 복용 기록, 측정 기록이 모두 지워지고 되돌릴 수 없습니다.</p>
        </Sheet>
      )}
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
