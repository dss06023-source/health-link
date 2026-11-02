import { useState } from 'react'
import { md, REMIND_DAYS } from '../data/pack'
import { useStore, ymd } from '../store'
import type { Supplement } from '../types'
import { Sheet } from '../ui'

const COUNTS = [30, 60, 90, 120, 180]

// 영양제 복용 시작: 새로 뜯은 한 통의 알 수와 1회 알 수를 받아, 다 떨어지기 7일 전에 재구매를 안내한다.
export default function PackSheet({ x, onClose }: { x: Supplement; onClose: () => void }) {
  const s = useStore()
  const today = ymd(new Date())
  const [count, setCount] = useState<number>(x.pack?.count ?? 60)
  const [perDose, setPerDose] = useState<number>(x.pack?.perDose ?? 1)
  const [started, setStarted] = useState<string>(today)
  const ok = count >= 1 && count <= 1000 && perDose >= 1 && perDose <= 20 && /^\d{4}-\d{2}-\d{2}$/.test(started)
  // 미리 보여 주는 날짜(시연 모드 기준: 하루 1번). 서버는 시간대 수까지 곱해 다시 계산한다.
  const runOut = (() => {
    if (!ok) return null
    const d = new Date(`${started}T00:00:00`); d.setDate(d.getDate() + Math.floor(count / perDose))
    return ymd(d)
  })()

  return (
    <Sheet title={`${x.name} 영양제 복용 시작`} onClose={onClose}
      actions={<><button className="btn flat" onClick={onClose}>취소</button>
        <button className="btn flat strong" disabled={!ok} onClick={() => { s.startPack(x.id, { count, perDose, startedAt: started }); onClose() }}>영양제 복용 시작</button></>}>
      <p className="small muted">새 통을 뜯는 날 누르십시오. 다 떨어지기 {REMIND_DAYS}일 전에 홈과 구매 탭에서 알려 드립니다.</p>
      <div className="field">
        <span className="label">한 통에 든 양</span>
        <div className="chips" role="group" aria-label="한 통에 든 양">
          {COUNTS.map((n) => <button key={n} type="button" className="chip" aria-pressed={count === n} onClick={() => setCount(n)}>{n}정</button>)}
        </div>
        <input type="number" inputMode="numeric" min={1} max={1000} aria-label="한 통에 든 양 직접 입력" value={count}
          onChange={(e) => setCount(Number(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="pack-dose">한 번에 먹는 양(정)</label>
        <input id="pack-dose" type="number" inputMode="numeric" min={1} max={20} value={perDose} onChange={(e) => setPerDose(Number(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="pack-start">복용 시작일</label>
        <input id="pack-start" type="date" value={started} max={today} onChange={(e) => setStarted(e.target.value)} />
      </div>
      {runOut && <p className="small">하루 한 번 먹으면 <b>{md(runOut)}</b>에 다 떨어집니다. 복용 체크를 빼먹은 날만큼 뒤로 밀립니다.</p>}
    </Sheet>
  )
}
