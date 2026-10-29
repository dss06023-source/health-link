import { useEffect, type ReactNode } from 'react'
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
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  chevron: 'M9.5 6l6 6-6 6',
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

// 수치 표시. 색에 기대지 않도록 판정은 옆에 글자 배지(Judge)나 StatusText로 함께 쓴다.
export function Value({ status, children, faded }: { status: Status; children: ReactNode; faded?: boolean }) {
  return <span className={`val-num ${status}${faded ? ' faded' : ''}`}>{children}</span>
}

// 판정 배지: 정상은 회색 글자, 경계는 노랑 바탕, 질환의심은 빨강 바탕.
export function Judge({ status }: { status: Status }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>
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

// 아래쪽 창. 휴대폰에선 화면 아래에서 올라오고, 넓은 화면에선 가운데 작은 창으로 뜬다.
export function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children?: ReactNode; actions: ReactNode }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [onClose])
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <div className="sheet-actions">{actions}</div>
      </div>
    </div>
  )
}

// 스낵바: 글 한두 줄과 오른쪽 버튼 하나.
export function Snackbar({ text, action, onAction, onClose, closeLabel = '닫기' }: { text: ReactNode; action?: string; onAction?: () => void; onClose?: () => void; closeLabel?: string }) {
  return (
    <div className="snackbar" role="status" aria-live="polite">
      <p>{text}</p>
      {action && <button className="snack-act" onClick={onAction}>{action}</button>}
      {onClose && <button className="snack-x" aria-label={closeLabel} onClick={onClose}><Icon name="x" size={16} /></button>}
    </div>
  )
}

export function Disclaimer() {
  return <p className="disclaimer">건강잇다의 해석과 추천은 국가건강검진 판정 기준과 건강기능식품 기능성 고시를 바탕으로 한 참고 정보이며, 의사의 진단이나 처방을 대신하지 않습니다. 화면의 인물과 수치는 시연용 가상 데이터입니다.</p>
}
