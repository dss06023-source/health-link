import { useCallback, useEffect, useState } from 'react'
import { USE_API } from '../api'
import { useStore } from '../store'
import ConsultSurvey, { EMPTY_SURVEY, type Survey, type SurveyChoices } from './ConsultSurvey'
import { Sheet } from '../ui'
import './consult.css'

// 약국·병원 상담 준비 자료(유료 PDF). 결제는 시연용이라 실제로 돈이 나가지 않는다(서버 consult.py).
const BASE = import.meta.env.VITE_API_BASE ?? ''
const METHODS: [string, string][] = [['card', '신용·체크카드'], ['toss', '토스페이'], ['kakao', '카카오페이']]
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

interface Offer {
  price: number; firstPrice: number; firstPurchase: boolean; amount: number
  purchases: { id: number; amount: number; method: string; createdAt: string }[]
  survey: SurveyChoices
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : '잠시 후 다시 해 주십시오.')
  return body as T
}
const pdfUrl = (id: number) => `${BASE}/api/consult/${id}/pdf`
const FILE = '상담준비자료.pdf'

export default function ConsultPdf() {
  const [offer, setOffer] = useState<Offer | null>(null)
  const female = useStore().profile?.sex === 'F'
  const [surveying, setSurveying] = useState(false)
  const [survey, setSurvey] = useState<Survey>(EMPTY_SURVEY)
  const [paying, setPaying] = useState(false)
  const [method, setMethod] = useState('card')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState<number | null>(null)
  const load = useCallback(() => send<Offer>('/api/consult/offer').then(setOffer).catch(() => setOffer(null)), [])
  useEffect(() => { if (USE_API) load() }, [load])
  if (!USE_API || !offer) return null

  const pay = async () => {
    setBusy(true); setError(null)
    try {
      const r = await send<{ purchaseId: number }>('/api/consult/checkout', { method: 'POST', body: JSON.stringify({ method, amount: offer.amount, survey: { ...survey, products: survey.products.filter((x) => x.name.trim()) } }) })
      setPaid(r.purchaseId)
      setSurveying(false); setSurvey(EMPTY_SURVEY)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '결제하지 못했습니다.')
      load()
    }
    setBusy(false)
  }
  const close = () => { setPaying(false); setPaid(null); setError(null) }

  return (
    <section className="sec">
      <div className="sec-head"><h2>약국·병원 상담 준비 자료</h2><span className="badge consult-badge">PDF</span></div>
      <p className="small muted">드시는 약·영양제·검진 수치와 공공 자료(식약처 고시 등) 원문의 주의 문구를 한데 모으고, 상담 때 여쭤볼 질문을 붙입니다. 판단은 상담하시는 약사·의사가 합니다.</p>
      {surveying && <>
        <ConsultSurvey value={survey} choices={offer.survey} female={female} onChange={setSurvey} />
        <div className="actions">
          <button className="btn flat" onClick={() => setSurveying(false)}>취소</button>
          <button className="btn" onClick={() => setPaying(true)}>다음: 결제</button>
        </div>
      </>}
      {!surveying && <div className="consult-price">
        {offer.firstPurchase
          ? <><s className="muted">{won(offer.price)}</s><b>{won(offer.firstPrice)}</b><span className="badge consult-badge">첫 구매 할인</span></>
          : <b>{won(offer.price)}</b>}
        <button className="btn" onClick={() => setSurveying(true)}>설문하고 구매하기</button>
      </div>}
      {offer.purchases.length > 0 && (
        <><p className="small"><b>구매한 자료</b></p>
        <ul className="list consult-bought">
          {offer.purchases.map((x) => (
            <li key={x.id}><a className="li" href={pdfUrl(x.id)} download={FILE}>
              <span className="li-main"><b>상담 준비 자료</b><small>{x.createdAt.slice(0, 10)} · {won(x.amount)} · {x.method}</small></span>
              <span className="li-end strong">내려받기</span>
            </a></li>
          ))}
        </ul></>
      )}
      <p className="small muted">내려받을 때마다 지금 입력된 정보로 새로 만듭니다.</p>

      {paying && (paid
        ? <Sheet title="결제를 마쳤습니다" onClose={close}
            actions={<><button className="btn flat" onClick={close}>닫기</button>
              <a className="btn flat strong" href={pdfUrl(paid)} download={FILE} onClick={close}>PDF 내려받기</a></>}>
            <p className="small muted">상담 준비 자료는 이 화면의 '구매한 자료'에서 언제든 다시 받을 수 있습니다.</p>
          </Sheet>
        : <Sheet title="결제" onClose={close}
            actions={<><button className="btn flat" onClick={close}>취소</button>
              <button className="btn flat strong" disabled={busy} onClick={pay}>{busy ? '결제 중' : `${won(offer.amount)} 결제하기`}</button></>}>
            <dl className="consult-order">
              <dt>상품</dt><dd>약국·병원 상담 준비 자료(PDF) 1건</dd>
              <dt>금액</dt><dd>{offer.firstPurchase ? <><s className="muted">{won(offer.price)}</s> <b>{won(offer.amount)}</b> (첫 구매 할인)</> : <b>{won(offer.amount)}</b>}</dd>
            </dl>
            <div className="chips" role="group" aria-label="결제 수단">
              {METHODS.map(([v, label]) => <button key={v} type="button" className="chip" aria-pressed={method === v} onClick={() => setMethod(v)}>{label}</button>)}
            </div>
            {error && <p className="small" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
            <p className="small muted">시연용 결제입니다. 실제로 돈이 나가지 않습니다.</p>
          </Sheet>)}
    </section>
  )
}
