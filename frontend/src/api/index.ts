import type { CheckupCenter, CheckupItem } from '../types'
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

// 백엔드는 업로드한 결과를 '확인 대기'로 저장하고 id를 돌려준다. 확정은 store.addCheckup에서 한다.
export async function uploadCheckup(file: File | null): Promise<{ id: number | null; items: CheckupItem[] }> {
  if (USE_API) {
    if (!file) throw new Error('서버 연결 모드에서는 실제 파일을 골라 주세요. 아무 PDF나 사진이어도 샘플 수치로 인식됩니다.')
    return remote.upload(file)
  }
  await wait(400)
  return { id: null, items: OCR_RESULT }
}
