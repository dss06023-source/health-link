import { useEffect, useRef, useState } from 'react'
import type { Route } from '../App'
import { MAX_UPLOAD_FILES, USE_API, uploadCheckup } from '../api'
import { interpret } from '../data/rules'
import { useStore } from '../store'
import type { CheckupItem } from '../types'
import { Icon, Judge } from '../ui'
import Mydata from './Mydata'

const STEPS = ['결과지 이미지 보정', '글자 인식(OCR)', '검사 항목·수치 추출', '정상 범위 대조']

export default function Upload({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [step, setStep] = useState(-1) // -1 대기, 0~3 진행, 4 완료
  const [items, setItems] = useState<CheckupItem[] | null>(null)
  const [missing, setMissing] = useState<CheckupItem[]>([])
  const [review, setReview] = useState<string[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [remoteId, setRemoteId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 여러 장을 고르면 한 번에 올린다. 4장을 넘으면 올리지 않고 알린다.
  function pick(list: FileList | null | undefined) {
    const files = Array.from(list ?? [])
    if (!files.length) return
    if (files.length > MAX_UPLOAD_FILES) { setError(`결과지는 한 번에 ${MAX_UPLOAD_FILES}장까지 올릴 수 있습니다. ${files.length}장을 고르셨습니다.`); return }
    start(files, files.length > 1 ? `${files.length}장 · ${files.map((f) => f.name).join(', ')}` : files[0].name)
  }

  async function start(files: File[], name: string) {
    setFileName(name); setItems(null); setMissing([]); setReview([]); setNote(null); setError(null); setStep(0)
    try {
      // 사진 인식은 3초쯤 걸린다. 마지막 단계는 결과가 온 뒤에 끝낸다.
      const result = uploadCheckup(files)
      result.catch(() => {})
      for (let i = 1; i <= 3; i++) { await new Promise((r) => setTimeout(r, 650)); setStep(i) }
      const r = await result
      setStep(4); setRemoteId(r.id); setItems(r.items); setMissing(r.missing); setReview(r.review); setNote(r.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : '결과지를 읽지 못했습니다. 다시 시도해 주십시오.')
      setStep(-1)
    }
  }
  useEffect(() => () => setStep(-1), [])

  const preview = items ? interpret(items, s.profile!.sex) : []
  const filled = missing.filter((m) => Number.isFinite(m.value))

  return (
    <>
    <div className="cols">
      <section className="sec">
        <h2>결과지를 올려 주십시오</h2>
        <p className="small muted">종이 결과지 사진(여러 장이면 장마다 찍어 4장까지 한 번에), 또는 건강보험공단 홈페이지에서 받은 결과 PDF를 올리면 됩니다.</p>
        <div className={`drop${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files) }}>
          <span className="drop-ico"><Icon name="camera" size={28} /></span>
          <div><b>결과지를 여기에 놓거나 파일을 고르십시오</b><p className="small muted">JPG · PNG · PDF, 여러 장이면 {MAX_UPLOAD_FILES}장까지 한 번에 고르십시오</p></div>
          <div className="row" style={{ justifyContent: 'center' }}>
            {!USE_API && <button className="btn flat" onClick={() => start([], '2026_건강검진결과_샘플.pdf')}>샘플로 시연</button>}
            <button className="btn" onClick={() => input.current?.click()}>파일 선택</button>
          </div>
          <input ref={input} id="up-file" type="file" accept="image/*,application/pdf" multiple hidden
            onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
        </div>
        {error && <div className="alert"><Icon name="alert" /><div><b>인식 실패</b><p className="small">{error}</p></div></div>}

        {step >= 0 && (
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <span className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}><Icon name="file" /><b className="small ellipsis">{fileName}</b></span>
              <span className="small muted num">{step === 3 ? '읽는 중…' : `${Math.min(step, 4) * 25}%`}</span>
            </div>
            <div className="bar"><i style={{ width: `${Math.min(step, 4) * 25}%` }} /></div>
            <ol className="steps">
              {STEPS.map((label, i) => (
                <li key={label} className={step > i ? 'done' : step === i ? 'now' : ''}>
                  <span className="n">{step > i ? <Icon name="check" size={14} /> : i + 1}</span>{label}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <div>
        <h2 className="subhead">읽어 낸 수치 {items && <span>{items.length}개 항목{missing.length > 0 && ` · 못 찾은 ${missing.length}개는 직접 입력`} · 다른 값은 눌러서 고쳐 주십시오</span>}</h2>
        {!items && <section className="sec"><p className="small muted">결과지를 올리면 여기에서 인식된 수치를 확인하고, 잘못 읽힌 값은 바로 고칠 수 있습니다.</p></section>}
        {items && (
          <>
            {note && <p className="small muted" style={{ margin: '0 4px 10px' }}>{note}</p>}
            <ul className="list">
              {preview.map((it, idx) => (
                <li key={it.code} className="li">
                  <label className="li-main" htmlFor={`ocr-${it.code}`}><b>{it.name}</b><small>참고치 {it.rangeText}{review.includes(it.code) && <> · <em className="st caution">다시 확인해 주십시오</em></>}</small></label>
                  <span className="li-val">
                    <span className="num-line"><input id={`ocr-${it.code}`} className="num-input" aria-label={`${it.name} 수치`} type="number" step="0.1" value={it.value}
                      onChange={(e) => setItems(items.map((x, j) => (j === idx ? { ...x, value: Number(e.target.value) } : x)))} />
                      <span className="unit">{it.unit}</span></span>
                    <Judge status={it.status} />
                  </span>
                </li>
              ))}
              {missing.map((m, idx) => (
                <li key={m.code} className="li">
                  <label className="li-main" htmlFor={`ocr-${m.code}`}><b>{m.name}</b><small>결과지에서 찾지 못했습니다. 있으면 적어 주십시오</small></label>
                  <span className="li-val">
                    <span className="num-line"><input id={`ocr-${m.code}`} className="num-input" aria-label={`${m.name} 수치`} type="number" step="0.1" placeholder="—"
                      value={Number.isFinite(m.value) ? m.value : ''}
                      onChange={(e) => setMissing(missing.map((x, j) => (j === idx ? { ...x, value: e.target.value === '' ? NaN : Number(e.target.value) } : x)))} />
                      <span className="unit">{m.unit}</span></span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="actions" style={{ marginTop: 14 }}><button className="btn" onClick={() => { s.addCheckup([...items, ...filled], 'ocr', remoteId); go('results') }}>확인하고 해석 보기</button></div>
          </>
        )}
      </div>
    </div>
    <Mydata go={go} />
    </>
  )
}
