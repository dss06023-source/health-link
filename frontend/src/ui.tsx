import type { ReactNode } from 'react'
import type { Status, Warning } from './types'
import { STATUS_LABEL } from './data/rules'

const PATHS = {
  home: 'M4 11.5 12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z',
  upload: 'M12 15.5V5m0 0L8 9m4-4 4 4M5 15v2.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V15',
  chart: 'M5 19V11m5 8V6m5 13v-6m5 6V9',
  capsule: 'M9.5 4.5a4.95 4.95 0 0 1 7 7l-5 5a4.95 4.95 0 0 1-7-7zM7 9.5l7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  trend: 'M4 17l5-5 4 3 7-8m0 0h-5m5 0v5',
  leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14m0 0 7-7',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 1 1 13 0c0 5-6.5 11-6.5 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  camera: 'M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  file: 'M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5zM14 3.5V8h4',
  pause: 'M9 6v12m6-12v12',
  plus: 'M12 5v14m-7-7h14',
  x: 'M6 6l12 12M18 6 6 18',
}
export type IconName = keyof typeof PATHS

export function Icon({ name, color = 'currentColor', size = 20 }: { name: IconName; color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

export function StatusPill({ status }: { status: Status }) {
  return <span className={`pill ${status}`}><span className="dot" />{STATUS_LABEL[status]}</span>
}

// 원형 진행률. value는 0~1.
export function Ring({ value, label, sub, size = 132 }: { value: number; label: ReactNode; sub?: string; size?: number }) {
  const r = 52, c = 2 * Math.PI * r
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 132 132" role="img" aria-label={`${Math.round(value * 100)}%`}>
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--accent)" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 66 66)" />
      <text x="66" y={sub ? 66 : 72} textAnchor="middle" fill="var(--fg)" style={{ font: '800 26px var(--font)' }}>{label}</text>
      {sub && <text x="66" y="88" textAnchor="middle" fill="var(--muted)" style={{ font: '700 12px var(--font)' }}>{sub}</text>}
    </svg>
  )
}

const MARK = { danger: '!', caution: '!', info: 'i' }
export function Notice({ w }: { w: Warning }) {
  return (
    <div className={`notice ${w.level}`}>
      <span className="icon">{MARK[w.level]}</span>
      <div><b>{w.title}</b><p className="small">{w.detail}</p></div>
    </div>
  )
}

export function Disclaimer() {
  return <p className="disclaimer">건강잇다의 해석과 추천은 국가건강검진 판정 기준과 건강기능식품 기능성 고시를 바탕으로 한 참고 정보이며, 의사의 진단이나 처방을 대신하지 않습니다. 화면의 인물과 수치는 시연용 가상 데이터입니다.</p>
}
