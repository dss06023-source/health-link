// 글꼴: 주요 글자는 티머니 둥근바람(파일 수정·로고 사용 금지), 나머지는 주아(OFL).
import '@noonnu/tmoney-round-wind-extra-bold/index.css'
import '@fontsource/jua/400.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, loadTheme } from './theme'

applyTheme(loadTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
