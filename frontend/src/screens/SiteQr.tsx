import { useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { Icon } from '../ui'

// PC로 시연할 때 청중이 휴대폰 카메라로 찍어 바로 들어오게 하는 QR. 홈 화면에서만 보인다.
// 지금 열린 주소(localhost·시연 링크 등) 대신 배포 주소를 담아야 휴대폰에서 열린다.
export const SITE_URL = 'https://health-itda.onrender.com'

// QR은 외부 서비스 없이 이 자리에서 만든다(qrcode-generator, MIT). 오류 복원 M(약 15%).
function qrPath(text: string) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
  return { n, d }
}

export default function SiteQr() {
  const { n, d } = useMemo(() => qrPath(SITE_URL), [])
  const [open, setOpen] = useState(true)
  if (!open) {
    return (
      <button className="site-qr-pill" onClick={() => setOpen(true)} aria-label="휴대폰으로 열기 QR 보기">
        <Icon name="camera" size={18} /> 휴대폰으로 열기
      </button>
    )
  }
  const q = 4 // 둘레 여백(QR 규격 권장 4칸)
  return (
    <aside className="site-qr" aria-label="휴대폰으로 건강잇다 열기">
      <button className="site-qr-x" onClick={() => setOpen(false)} aria-label="QR 접기"><Icon name="x" size={16} /></button>
      <svg className="site-qr-code" viewBox={`${-q} ${-q} ${n + q * 2} ${n + q * 2}`} shapeRendering="crispEdges" role="img" aria-label={`QR 코드: ${SITE_URL}`}>
        <rect x={-q} y={-q} width={n + q * 2} height={n + q * 2} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      <b>휴대폰으로 열기</b>
      <span>카메라로 찍으면 바로 열립니다</span>
    </aside>
  )
}
