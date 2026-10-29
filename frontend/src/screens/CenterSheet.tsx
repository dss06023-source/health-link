import { useEffect, useRef, useState } from 'react'
import { getCenterPlace, getMapKey } from '../api'
import type { CenterPlace, CheckupCenter } from '../types'
import { Sheet } from '../ui'

// 카카오 지도 SDK는 처음 열 때 한 번만 불러온다.
type KakaoMaps = { load: (cb: () => void) => void; LatLng: new (lat: number, lng: number) => unknown; Map: new (el: HTMLElement, o: object) => unknown; Marker: new (o: object) => unknown }
let sdk: Promise<KakaoMaps> | null = null
function loadKakao(key: string): Promise<KakaoMaps> {
  sdk ??= new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`
    el.onload = () => {
      const maps = (window as unknown as { kakao?: { maps: KakaoMaps } }).kakao?.maps
      if (maps) maps.load(() => resolve(maps)); else reject(new Error('kakao'))
    }
    el.onerror = () => { sdk = null; reject(new Error('kakao')) }
    document.head.appendChild(el)
  })
  return sdk
}

// 카카오 키가 있으면 카카오 지도, 없거나 실패하면 키 없이 되는 OpenStreetMap을 보여 준다.
function CenterMap({ name, lat, lng }: { name: string; lat: number; lng: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'loading' | 'kakao' | 'osm'>('loading')
  useEffect(() => {
    let live = true
    getMapKey().then((key) => {
      if (!key) throw new Error('no key')
      return loadKakao(key)
    }).then((maps) => {
      if (!live || !box.current) return
      const at = new maps.LatLng(lat, lng)
      const map = new maps.Map(box.current, { center: at, level: 3 })
      new maps.Marker({ map, position: at })
      setMode('kakao')
    }).catch(() => live && setMode('osm'))
    return () => { live = false }
  }, [lat, lng])
  const d = 0.004
  const osm = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`
  return (
    <div className="center-map">
      <div ref={box} className="center-map-fill" hidden={mode === 'osm'} />
      {mode === 'osm' && <iframe className="center-map-fill" title={`${name} 위치 지도`} src={osm} loading="lazy" />}
    </div>
  )
}

export default function CenterSheet({ c, onClose }: { c: CheckupCenter; onClose: () => void }) {
  const [place, setPlace] = useState<CenterPlace | null>(null)
  useEffect(() => { getCenterPlace(c).then(setPlace) }, [c])
  const phone = place?.phone || c.phone
  const exams = c.exams.map((e) => (e === '일반' ? '일반검진' : e))
  return (
    <Sheet title={c.name} onClose={onClose}
      actions={<><button className="btn flat" onClick={onClose}>닫기</button>
        {phone ? <a className="btn flat strong" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>전화 걸기</a>
          : <a className="btn flat strong" href={c.bookingUrl ?? 'https://www.nhis.or.kr'} target="_blank" rel="noreferrer">공단 안내</a>}</>}>
      {c.lat != null && c.lng != null && <CenterMap name={c.name} lat={c.lat} lng={c.lng} />}
      <dl className="center-info">
        <dt>주소</dt><dd>{place?.roadAddress || c.address} <span className="muted">· {c.distanceKm}km</span></dd>
        <dt>전화</dt><dd>{phone ? <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a> : place ? '등록된 번호 없음' : '찾는 중…'}</dd>
        {(c.kind || place?.category) && <><dt>종류</dt><dd>{[c.kind, place?.category?.split(' > ').pop()].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ')}</dd></>}
        {exams.length > 0 && <><dt>검진</dt><dd>{exams.join(', ')}</dd></>}
      </dl>
      <div className="slots">
        {place && <a className="chip" href={place.placeUrl || place.mapLink} target="_blank" rel="noreferrer">카카오맵에서 보기</a>}
        {place && <a className="chip" href={place.routeLink} target="_blank" rel="noreferrer">길찾기</a>}
        {c.bookingUrl && <a className="chip" href={c.bookingUrl} target="_blank" rel="noreferrer">공단 검진 안내</a>}
      </div>
      <p className="small muted">예약은 기관에 전화로 합니다. 운영 시간과 검진 가능 여부는 통화로 확인해 주십시오.</p>
    </Sheet>
  )
}
