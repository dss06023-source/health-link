import { useEffect, useRef, useState } from 'react'
import type { Route } from '../App'
import { USE_API, uploadCheckup } from '../api'
import { interpret } from '../data/rules'
import { useStore } from '../store'
import type { CheckupItem } from '../types'
import { Icon, Judge } from '../ui'

const STEPS = ['결과지 이미지 보정', '글자 인식(OCR)', '검사 항목·수치 추출', '정상 범위 대조']

export default function Upload({ go }: { go: (r: Route) => void }) {
  const s = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [step, setStep] = useState(-1) // -1 대기, 0~3 진행, 4 완료
  const [items, setItems] = useState<CheckupItem[] | null>(null)
  const [remoteId, setRemoteId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function start(file: File | null, name: string) {
    setFileName(name); setItems(null); setError(null); setStep(0)
    try {
      const result = uploadCheckup(file)
      for (let i = 1; i <= 4; i++) { await new Promise((r) => setTimeout(r, 650)); setStep(i) }
      const r = await result
      setRemoteId(r.id); setItems(r.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : '결과지를 읽지 못했습니다. 다시 시도해 주세요.')
      setStep(-1)
    }
  }
  useEffect(() => () => setStep(-1), [])

  const preview = items ? interpret(items, s.profile!.sex) : []

  return (
    <div className="cols">
      <section className="sec">
        <div className="sec-head"><h2>검진 결과지를 올려 주세요</h2></div>
        <p className="muted">종이 결과지 사진, 또는 건강보험공단 홈페이지에서 받은 결과 PDF를 올리면 됩니다.</p>
        <div className={`drop${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) start(f, f.name) }}>
          <Icon name="camera" size={30} />
          <div><b>결과지를 이 틀 안에 놓거나 파일을 고르세요</b><p className="small muted">JPG · PNG · PDF, 20MB 이하</p></div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={() => input.current?.click()}>파일 선택</button>
            {!USE_API && <button className="btn ghost" onClick={() => start(null, '2026_건강검진결과_샘플.pdf')}>샘플 결과지로 시연</button>}
          </div>
          <input ref={input} id="up-file" type="file" accept="image/*,application/pdf" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) start(f, f.name); e.target.value = '' }} />
        </div>
        {error && <div className="alert"><Icon name="alert" /><div><b>인식 실패</b><p className="small">{error}</p></div></div>}

        {step >= 0 && (
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="row"><Icon name="file" /><b className="small">{fileName}</b></span>
              <span className="small muted num">{Math.min(step, 4) * 25}%</span>
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

      <section className="sec">
        <div className="sec-head"><h2>읽어 낸 수치</h2>{items && <p>{items.length}개 항목</p>}</div>
        {!items && <p className="muted">결과지를 올리면 여기에서 인식된 수치를 확인하고, 잘못 읽힌 값은 바로 고칠 수 있습니다.</p>}
        {items && (
          <>
            <p className="small muted">결과지와 다른 값이 있으면 숫자를 눌러 고쳐 주세요.</p>
            <div className="sheet table-wrap">
              <table>
                <thead><tr><th>항목</th><th>수치</th><th>판정</th></tr></thead>
                <tbody>
                  {preview.map((it, idx) => (
                    <tr key={it.code}>
                      <td className="name">{it.name}</td>
                      <td style={{ whiteSpace: 'nowrap' }}><input id={`ocr-${it.code}`} aria-label={`${it.name} 수치`} type="number" step="0.1" value={it.value}
                        onChange={(e) => setItems(items.map((x, j) => (j === idx ? { ...x, value: Number(e.target.value) } : x)))} />
                        <span className="unit">{it.unit}</span></td>
                      <td><Judge status={it.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div><button className="btn" onClick={() => { s.addCheckup(items, 'ocr', remoteId); go('results') }}>확인하고 해석 보기</button></div>
          </>
        )}
      </section>
    </div>
  )
}
