import { useState } from 'react'
import { md, packStatus, REMIND_DAYS } from '../data/pack'
import { useStore, ymd } from '../store'
import type { Supplement } from '../types'
import { Sheet } from '../ui'

const COUNTS = [30, 60, 90, 120, 180]
export type PackMode = 'new' | 'left'

// 영양제 복용 시작(새 통) 또는 먹던 통의 남은 양 입력. 다 떨어지기 7일 전에 재구매를 안내한다.
// 남은 양은 '오늘 시작한 그 알 수짜리 통'으로 저장한다(오늘 이미 먹었으면 오늘 몫을 더해 둔다).
export default function PackSheet({ x, mode: initial = 'new', onClose }: { x: Supplement; mode?: PackMode; onClose: () => void }) {
  const s = useStore()
  const today = ymd(new Date())
  const now = packStatus(x, s.intake)
  const [mode, setMode] = useState<PackMode>(initial)
  const [count, setCount] = useState<number>(initial === 'left' ? now?.remaining ?? 30 : x.pack?.count ?? 60)
  const [perDose, setPerDose] = useState<number>(x.pack?.perDose ?? 1)
  const [started, setStarted] = useState<string>(today)
  const ok = count >= 1 && count <= 1000 && perDose >= 1 && perDose <= 20 && /^\d{4}-\d{2}-\d{2}$/.test(started)
  const takenToday = !!s.intake[today]?.[x.id]
  const save = () => {
    if (mode === 'left') s.startPack(x.id, { count: count + (takenToday ? perDose : 0), perDose, startedAt: today })
    else s.startPack(x.id, { count, perDose, startedAt: started })
    onClose()
  }
  // 미리 보여 주는 날짜(하루 한 번 기준). 저장하면 복용 체크 기록까지 반영해 다시 계산한다.
  const runOut = (() => {
    if (!ok) return null
    const d = new Date(`${mode === 'left' ? today : started}T00:00:00`); d.setDate(d.getDate() + Math.floor(count / perDose) + (mode === 'left' && takenToday ? 1 : 0))
    return ymd(d)
  })()

  return (
    <Sheet title={`${x.name} ${mode === 'new' ? '영양제 복용 시작' : '남은 양 입력'}`} onClose={onClose}
      actions={<><button className="btn flat" onClick={onClose}>취소</button>
        <button className="btn flat strong" disabled={!ok} onClick={save}>{mode === 'new' ? '영양제 복용 시작' : '저장'}</button></>}>
      <div className="seg" role="group" aria-label="입력 방법">
        <button type="button" aria-pressed={mode === 'new'} onClick={() => setMode('new')}>새 통을 뜯었습니다</button>
        <button type="button" aria-pressed={mode === 'left'} onClick={() => setMode('left')}>먹던 통이 있습니다</button>
      </div>
      <p className="small muted">{mode === 'new'
        ? '새 통을 뜯는 날 누르십시오.'
        : '지금 통에 남은 알 수를 세어 넣으십시오.'} 다 떨어지기 {REMIND_DAYS}일 전에 홈과 구매 탭에서 알려 드립니다.</p>
      <div className="field">
        <span className="label">{mode === 'new' ? '한 통에 든 양' : '지금 남은 양'}</span>
        {mode === 'new' && (
          <div className="chips" role="group" aria-label="한 통에 든 양">
            {COUNTS.map((n) => <button key={n} type="button" className="chip" aria-pressed={count === n} onClick={() => setCount(n)}>{n}정</button>)}
          </div>
        )}
        <input type="number" inputMode="numeric" min={1} max={1000} aria-label={mode === 'new' ? '한 통에 든 양 직접 입력' : '지금 남은 양(정)'} value={count}
          onChange={(e) => setCount(Number(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="pack-dose">한 번에 먹는 양(정)</label>
        <input id="pack-dose" type="number" inputMode="numeric" min={1} max={20} value={perDose} onChange={(e) => setPerDose(Number(e.target.value))} />
      </div>
      {mode === 'new' && (
        <div className="field">
          <label htmlFor="pack-start">복용 시작일</label>
          <input id="pack-start" type="date" value={started} max={today} onChange={(e) => setStarted(e.target.value)} />
        </div>
      )}
      {mode === 'left' && takenToday && <p className="small muted">오늘 몫은 이미 드신 것으로 보고 계산합니다.</p>}
      {runOut && <p className="small">하루 한 번 먹으면 <b>{md(runOut)}</b>에 다 떨어집니다. 복용 체크를 빼먹은 날만큼 뒤로 밀립니다.</p>}
    </Sheet>
  )
}
