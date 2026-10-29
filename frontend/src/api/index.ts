import type { AddressHit, CenterPlace, CheckupCenter, CheckupItem } from '../types'
import { CENTERS, OCR_RESULT } from '../data/mock'
import { remote } from './remote'

// VITE_USE_API=1 이면 backend/(docs/api.md 규격)를 부르고, 아니면 모의 데이터로 동작한다.
export const USE_API = import.meta.env.VITE_USE_API === '1'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function getCenters(): Promise<CheckupCenter[]> {
  if (USE_API) return remote.getCenters()
  await wait(300)
  return CENTERS
}

// 도로명주소 검색. 모의 모드는 시연용 주소 두 개 중에서 찾는다.
const DEMO_ADDRESSES: AddressHit[] = [
  { roadAddress: '서울특별시 중구 세종대로 110', jibunAddress: '서울특별시 중구 태평로1가 31', zipCode: '04524', buildingName: '서울특별시청', lat: 37.5665, lng: 126.978 },
  { roadAddress: '서울특별시 마포구 월드컵북로 400', jibunAddress: '서울특별시 마포구 상암동 1601', zipCode: '03925', buildingName: null, lat: 37.5794, lng: 126.8895 },
]
export async function searchAddress(q: string): Promise<AddressHit[]> {
  if (USE_API) return remote.searchAddress(q)
  await wait(200)
  const words = q.split(/\s+/).filter(Boolean)
  return DEMO_ADDRESSES.filter((a) => words.every((w) => `${a.roadAddress} ${a.jibunAddress}`.includes(w)))
}

// 상세 화면: 서버가 카카오 장소 검색으로 전화·장소 링크를 찾는다. 모의 모드와 실패 시에는 지도 링크만.
export async function getCenterPlace(c: CheckupCenter): Promise<CenterPlace> {
  const at = `${encodeURIComponent(c.name)},${c.lat},${c.lng}`
  const links = { found: false, mapLink: `https://map.kakao.com/link/map/${at}`, routeLink: `https://map.kakao.com/link/to/${at}` }
  if (!USE_API || c.lat == null) return links
  return remote.getCenterPlace(c).catch(() => links)
}

// 지도 화면용 카카오 JavaScript 키(공개용). 없으면 키 없는 지도(OpenStreetMap)로 보여 준다.
let mapKey: Promise<string | null> | null = null
export function getMapKey(): Promise<string | null> {
  if (!USE_API) return Promise.resolve(import.meta.env.VITE_KAKAO_JS_KEY || null)
  mapKey ??= remote.getConfig().then((c) => c.kakaoJsKey).catch(() => null)
  return mapKey
}

// 백엔드는 업로드한 결과를 '확인 대기'로 저장하고 id를 돌려준다. 확정은 store.addCheckup에서 한다.
// missing은 결과지에서 못 찾은 항목(값 NaN), review는 다시 확인할 항목 코드, message는 서버 안내 문구다.
export interface UploadResult { id: number | null; items: CheckupItem[]; missing: CheckupItem[]; review: string[]; engine: string | null; message: string | null }

// 결과통보서는 보통 4장이라 한 번에 4개까지 올린다. 서버가 장마다 읽어 합친다.
export const MAX_UPLOAD_FILES = 4

export async function uploadCheckup(files: File[]): Promise<UploadResult> {
  if (USE_API) {
    if (!files.length) throw new Error('서버 연결 모드에서는 실제 결과지 사진이나 PDF를 골라 주세요.')
    return remote.upload(files)
  }
  await wait(400)
  return { id: null, items: OCR_RESULT, missing: [], review: [], engine: null, message: null }
}
