// 화면 모드. 기본은 밝게이고, 내 정보에서 어둡게나 기기 설정 따르기로 바꿀 수 있다.
// 이 브라우저에만 저장하는 개인 설정이라 서버로 보내지 않는다.
export type Theme = 'light' | 'dark' | 'system'

const KEY = 'health-itda-theme'

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark' || v === 'system') return v
  } catch { /* 저장소를 못 쓰면 기본값 */ }
  return 'light'
}

// system이면 data-theme을 지워 index.css의 prefers-color-scheme 규칙이 적용되게 한다.
export function applyTheme(t: Theme) {
  const root = document.documentElement
  if (t === 'system') delete root.dataset.theme
  else root.dataset.theme = t
}

export function saveTheme(t: Theme) {
  applyTheme(t)
  try { localStorage.setItem(KEY, t) } catch { /* 이번 화면에만 적용 */ }
}
