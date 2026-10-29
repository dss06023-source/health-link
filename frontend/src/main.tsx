// 글꼴: 페이퍼로지 400(OFL) 한 가지.
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
