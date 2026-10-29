import { useState } from 'react'
import { searchAddress } from '../api'
import { REGIONS } from '../data/regions'
import type { Address, AddressHit } from '../types'

const EMPTY: Address = { sido: '', sigungu: '', roadAddress: '', detailAddress: '' }

// 검색 결과의 앞 두 낱말(예: '서울특별시 마포구', '경기 수원시')로 시·도와 시·군·구를 맞춘다.
function regionOf(road: string): { sido: string; sigungu: string } | null {
  const [a, b] = road.split(/\s+/)
  const r = REGIONS.find((x) => x.sido === a || x.short === a)
  if (!r) return null
  return { sido: r.sido, sigungu: r.sigungu.includes(b) ? b : '' }
}

// 사는 곳: 시·도 → 시·군·구 → 도로명주소 검색 → 상세주소. 검진기관은 이 주소 기준으로 찾는다.
export default function AddressField({ value, onChange }: { value?: Address; onChange: (a: Address) => void }) {
  const a = value ?? EMPTY
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<AddressHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const region = REGIONS.find((r) => r.sido === a.sido)

  const search = async () => {
    const text = q.trim()
    if (text.length < 2) return
    setBusy(true); setErr(null)
    try { setHits(await searchAddress(text)) } catch { setErr('주소 검색에 실패했습니다. 잠시 후 다시 해 주세요.'); setHits(null) }
    setBusy(false)
  }
  const pick = (h: AddressHit) => {
    const road = h.roadAddress || h.jibunAddress || ''
    const r = regionOf(road)
    onChange({ ...a, ...(r ?? {}), roadAddress: road, zipCode: h.zipCode ?? undefined, lat: h.lat, lng: h.lng })
    setHits(null); setQ('')
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="grid-2">
        <div className="field"><label htmlFor="ob-sido">시·도</label>
          <select id="ob-sido" value={a.sido} onChange={(e) => onChange({ ...EMPTY, sido: e.target.value })}>
            <option value="">선택</option>
            {REGIONS.map((r) => <option key={r.sido} value={r.sido}>{r.sido}</option>)}
          </select></div>
        <div className="field"><label htmlFor="ob-sigungu">시·군·구</label>
          <select id="ob-sigungu" value={a.sigungu} disabled={!region?.sigungu.length}
            onChange={(e) => onChange({ ...EMPTY, sido: a.sido, sigungu: e.target.value })}>
            <option value="">{region && !region.sigungu.length ? '없음' : '선택'}</option>
            {region?.sigungu.map((g) => <option key={g} value={g}>{g}</option>)}
          </select></div>
      </div>

      <div className="field"><label htmlFor="ob-addr-q">도로명주소 <span className="muted">(선택)</span></label>
        {a.roadAddress
          ? <div className="row" style={{ flexWrap: 'nowrap' }}>
              <span className="addr-picked">{a.roadAddress}{a.zipCode && <small className="muted"> ({a.zipCode})</small>}</span>
              <button type="button" className="btn flat sm" onClick={() => onChange({ ...a, roadAddress: '', zipCode: undefined, lat: undefined, lng: undefined })}>다시 찾기</button>
            </div>
          : <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id="ob-addr-q" style={{ flex: 1, minWidth: 0 }} value={q} placeholder="도로명이나 건물 이름 (예: 월드컵북로 400)"
                onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }} />
              <button type="button" className="btn flat sm strong" onClick={search} disabled={busy || q.trim().length < 2}>{busy ? '찾는 중' : '검색'}</button>
            </div>}
        {err && <small className="muted">{err}</small>}
      </div>
      {hits && (
        <ul className="list addr-hits" aria-label="주소 검색 결과">
          {hits.map((h, i) => (
            <li key={i}><button type="button" className="li" onClick={() => pick(h)}>
              <span className="li-main"><b>{h.roadAddress ?? h.jibunAddress}</b>
                <small>{[h.buildingName, h.roadAddress && h.jibunAddress, h.zipCode].filter(Boolean).join(' · ')}</small></span>
            </button></li>
          ))}
          {!hits.length && <li className="li muted">찾은 주소가 없습니다. 도로명과 건물 번호를 함께 넣어 보세요.</li>}
        </ul>
      )}

      <div className="field"><label htmlFor="ob-addr-detail">상세주소 <span className="muted">(선택)</span></label>
        <input id="ob-addr-detail" value={a.detailAddress} placeholder="동·호수 등" maxLength={120}
          onChange={(e) => onChange({ ...a, detailAddress: e.target.value })} /></div>
    </div>
  )
}
