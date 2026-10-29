// 글꼴: 한글은 주아, 영문·숫자는 Pretendard(둘 다 OFL).
import '@fontsource/jua/400.css'
import './fonts.css'
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
