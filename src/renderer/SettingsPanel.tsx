import { useEffect, useState } from 'react'
import { FONTS, FontKey, Settings as S, applySettings, loadSettings, saveSettings } from './settings'

// 설정 창 (⌘, / Ctrl+,). 고르는 즉시 적용·저장된다.
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<S>(loadSettings)
  const set = (next: S) => (setS(next), saveSettings(next), applySettings(next))
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  const options = Object.entries(FONTS).map(([k, v]) => (
    <option key={k} value={k}>{v.label}</option>
  ))
  return (
    <div className="settings-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings" role="dialog" aria-label="설정">
        <h2>설정</h2>
        <label>
          <span>본문 글꼴</span>
          <select autoFocus value={s.body} onChange={(e) => set({ ...s, body: e.target.value as FontKey })}>
            {options}
          </select>
        </label>
        <label>
          <span>코드 글꼴</span>
          <select value={s.code} onChange={(e) => set({ ...s, code: e.target.value as FontKey })}>
            {options}
          </select>
        </label>
        <p className="settings-preview">The quick brown fox jumps over the lazy dog. 다람쥐 헌 쳇바퀴에 타고파 0123</p>
        <p className="settings-preview code">const total = items.length // 합계 → 0O 1lI</p>
        <button onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}
