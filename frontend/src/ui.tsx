import type { ReactNode } from 'react'
import type { Status, Warning } from './types'
import { STATUS_LABEL } from './data/rules'

const PATHS = {
  home: 'M4 11.5 12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z',
  upload: 'M12 15.5V5m0 0L8 9m4-4 4 4M5 15v2.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V15',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  camera: 'M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  file: 'M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5zM14 3.5V8h4',
  alert: 'M12 8v5m0 3.5v.01M10.3 4.3 3 17.5A2 2 0 0 0 4.7 20.5h14.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z',
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

// 이름 옆 표시: 두 점(검진 결과와 영양제)을 잇는 초록 선.
export function Wordmark() {
  return (
    <span className="wordmark">
      <svg viewBox="0 0 42 16" aria-hidden="true">
        <circle cx="6" cy="8" r="5" fill="none" stroke="var(--fg)" strokeWidth="2" />
        <path d="M11 8h20" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="36" cy="8" r="5" fill="var(--accent)" />
      </svg>
      건강잇다
    </span>
  )
}

// 손으로 친 듯한 타원. 0~100 상자 안에서 한 바퀴 조금 넘게 돌고, seed로 모양을 조금씩 다르게 한다.
function penPath(seed: number) {
  const rnd = (i: number) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x) }
  const n = 9, turns = 1.12, pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * turns * Math.PI * 2 - 2.3
    const r = 1 + (rnd(i) - 0.5) * 0.09 - (i === n ? 0.06 : 0)
    pts.push([50 + Math.cos(t) * 48 * r, 50 + Math.sin(t) * 46 * r])
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}
const seedOf = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 97

// 수치 표시. 질환의심은 펜 동그라미, 경계는 점선 밑줄, 정상은 그대로.
export function Value({ status, children, seed = '', faded }: { status: Status; children: ReactNode; seed?: string; faded?: boolean }) {
  return (
    <span className={`mark ${status}${faded ? ' faded' : ''}`}>
      {children}
      {status === 'danger' && <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={penPath(seedOf(seed) + 1)} /></svg>}
    </span>
  )
}

// 강조 밑줄(초록 펜).
export function PenLine({ children }: { children: ReactNode }) {
  return (
    <span className="pen-line">
      {children}
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M1 6 C20 3 45 8 70 4.5 S94 5 99 3.5" /></svg>
    </span>
  )
}

const ORDER: Status[] = ['normal', 'caution', 'danger']
// 결과통보서처럼 세 칸 중 해당 칸에 표시.
export function Judge({ status }: { status: Status }) {
  return (
    <span className="judge" role="img" aria-label={`판정 ${STATUS_LABEL[status]}`}>
      {ORDER.map((s) => <span key={s} className={s === status ? `on ${s}` : undefined} aria-hidden="true">{STATUS_LABEL[s]}</span>)}
    </span>
  )
}

export function StatusText({ status }: { status: Status }) {
  return <span className={`st ${status}`}>{STATUS_LABEL[status]}</span>
}

const SYM = { danger: '!', caution: '!', info: 'i' }
export function CautionList({ items }: { items: Warning[] }) {
  return (
    <ul className="cautions">
      {items.map((w, i) => (
        <li key={i} className={w.level}>
          <span className="sym" aria-hidden="true">{SYM[w.level]}</span>
          <div><b>{w.title}</b><p>{w.detail}</p></div>
        </li>
      ))}
    </ul>
  )
}

export function Disclaimer() {
  return <p className="disclaimer">건강잇다의 해석과 추천은 국가건강검진 판정 기준과 건강기능식품 기능성 고시를 바탕으로 한 참고 정보이며, 의사의 진단이나 처방을 대신하지 않습니다. 화면의 인물과 수치는 시연용 가상 데이터입니다.</p>
}
