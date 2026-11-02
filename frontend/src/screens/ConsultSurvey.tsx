// 상담 준비 자료를 만들기 전에 받는 설문. 답은 판단에 쓰지 않고 PDF에 '내가 적은 내용'과 상담 질문으로만 싣는다.
export interface Survey {
  products: { name: string; perDay: string }[]
  timing: string
  otc: string[]; otcNote: string
  symptoms: string[]
  pregnancy: string
  procedure: string; procedureNote: string
  caffeine: number
  shiftWork: boolean
  question: string
}
export interface SurveyChoices { otc: string[]; symptoms: string[]; pregnancy: Record<string, string>; procedure: Record<string, string> }

export const EMPTY_SURVEY: Survey = {
  products: [{ name: '', perDay: '' }], timing: '', otc: [], otcNote: '', symptoms: [], pregnancy: 'none',
  procedure: 'none', procedureNote: '', caffeine: 0, shiftWork: false, question: '',
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

function Chips({ label, options, value, onChange }: { label: string; options: [string, string][]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map(([v, text]) => <button key={v} type="button" className="chip" aria-pressed={value.includes(v)} onClick={() => onChange(toggle(value, v))}>{text}</button>)}
    </div>
  )
}

export default function ConsultSurvey({ value, choices, female, onChange }: { value: Survey; choices: SurveyChoices; female: boolean; onChange: (s: Survey) => void }) {
  const set = <K extends keyof Survey>(k: K, v: Survey[K]) => onChange({ ...value, [k]: v })
  const setProduct = (i: number, k: 'name' | 'perDay', v: string) => set('products', value.products.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  return (
    <div className="consult-survey">
      <p className="small muted">5분이면 됩니다. 적은 내용은 PDF의 '내가 적은 내용'과 상담 질문에 그대로 들어갑니다. 흡연·음주·운동·수면·식사 습관은 내 정보에 적힌 내용을 쓰니, 다르면 내 정보에서 먼저 고치십시오.</p>

      <fieldset><legend>1. 실제로 먹는 영양제 제품</legend>
        {value.products.map((x, i) => (
          <div key={i} className="consult-product">
            <input aria-label={`제품 ${i + 1} 이름`} placeholder="제품 이름(예: ○○ 오메가3)" maxLength={60} value={x.name} onChange={(e) => setProduct(i, 'name', e.target.value)} />
            <input aria-label={`제품 ${i + 1} 하루 양`} placeholder="하루 양(예: 2알)" maxLength={30} value={x.perDay} onChange={(e) => setProduct(i, 'perDay', e.target.value)} />
          </div>
        ))}
        {value.products.length < 12 && <button type="button" className="btn flat sm" onClick={() => set('products', [...value.products, { name: '', perDay: '' }])}>제품 더하기</button>}
      </fieldset>

      <fieldset><legend>2. 약과 영양제를 각각 언제 드십니까?</legend>
        <input aria-label="먹는 시간" placeholder="예: 약은 아침 식후, 영양제는 저녁 식후" maxLength={200} value={value.timing} onChange={(e) => set('timing', e.target.value)} />
      </fieldset>

      <fieldset><legend>3. 처방약 말고 가끔 드시는 약</legend>
        <Chips label="가끔 먹는 약" options={choices.otc.map((x) => [x, x])} value={value.otc} onChange={(v) => set('otc', v)} />
        {value.otc.includes('기타') && <input aria-label="기타 약 이름" placeholder="약 이름" maxLength={100} value={value.otcNote} onChange={(e) => set('otcNote', e.target.value)} />}
      </fieldset>

      <fieldset><legend>4. 최근 느끼는 불편</legend>
        <Chips label="최근 불편" options={choices.symptoms.map((x) => [x, x])} value={value.symptoms} onChange={(v) => set('symptoms', v)} />
      </fieldset>

      {female && (
        <fieldset><legend>5. 임신·수유</legend>
          <div className="chips" role="radiogroup" aria-label="임신·수유">
            {Object.entries(choices.pregnancy).map(([v, t]) => <button key={v} type="button" className="chip" aria-pressed={value.pregnancy === v} onClick={() => set('pregnancy', v)}>{t}</button>)}
          </div>
        </fieldset>
      )}

      <fieldset><legend>{female ? 6 : 5}. 가까운 시일에 예정된 수술·시술</legend>
        <div className="chips" role="radiogroup" aria-label="예정된 수술·시술">
          {Object.entries(choices.procedure).map(([v, t]) => <button key={v} type="button" className="chip" aria-pressed={value.procedure === v} onClick={() => set('procedure', v)}>{t}</button>)}
        </div>
        {value.procedure !== 'none' && <input aria-label="수술·시술 시기" placeholder="시기나 내용(예: 11월 말)" maxLength={100} value={value.procedureNote} onChange={(e) => set('procedureNote', e.target.value)} />}
      </fieldset>

      <fieldset><legend>{female ? 7 : 6}. 커피·에너지음료와 근무 형태</legend>
        <div className="consult-row">
          <label htmlFor="cs-caffeine">하루 잔 수</label>
          <input id="cs-caffeine" type="number" inputMode="numeric" min={0} max={20} value={value.caffeine}
            onChange={(e) => set('caffeine', Math.max(0, Math.min(20, Number(e.target.value) || 0)))} />
          <button type="button" className="chip" aria-pressed={value.shiftWork} onClick={() => set('shiftWork', !value.shiftWork)}>교대근무를 합니다</button>
        </div>
      </fieldset>

      <fieldset><legend>{female ? 8 : 7}. 상담에서 꼭 묻고 싶은 것</legend>
        <textarea aria-label="묻고 싶은 것" rows={3} maxLength={300} placeholder="자유롭게 적으십시오." value={value.question} onChange={(e) => set('question', e.target.value)} />
      </fieldset>
    </div>
  )
}
