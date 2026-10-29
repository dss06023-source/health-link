// 글꼴: 주요 글자와 앱 이름은 카페24 써라운드, 나머지는 도현(둘 다 OFL).
import '@noonnu/cafe24-ssurround/index.css'
import '@fontsource/do-hyeon/400.css'
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
