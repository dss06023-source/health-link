import type { CheckupCenter, CheckupItem } from '../types'
import { CENTERS, OCR_RESULT } from '../data/mock'

// VITE_USE_API=1 이면 백엔드(/api, docs/api.md 규격)를 부르고, 아니면 모의 데이터로 동작한다.
const USE_API = import.meta.env.VITE_USE_API === '1'
const BASE = import.meta.env.VITE_API_BASE ?? ''

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path} 요청 실패 (${res.status})`)
  return res.json() as Promise<T>
}

export async function getCenters(): Promise<CheckupCenter[]> {
  if (USE_API) return get('/api/checkup-centers')
  await wait(300)
  return CENTERS
}

export async function uploadCheckup(file: File | null): Promise<CheckupItem[]> {
  if (USE_API && file) {
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`${BASE}/api/checkups/upload`, { method: 'POST', body })
    if (!res.ok) throw new Error(`결과지 인식 실패 (${res.status})`)
    const data = (await res.json()) as { items: CheckupItem[] }
    return data.items
  }
  await wait(400)
  return OCR_RESULT
}
