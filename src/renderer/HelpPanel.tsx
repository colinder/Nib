import { useEffect, useState } from 'react'
import { HELP } from './helpContent'

const MAC = /Mac/.test(navigator.userAgent)
const NAMES: Record<string, [string, string]> = {
  Mod: ['⌘', 'Ctrl'], Shift: ['⇧', 'Shift'], Alt: ['⌥', 'Alt'],
  Enter: ['↵', 'Enter'], Backspace: ['⌫', 'Backspace'], Tab: ['⇥', 'Tab'],
  ArrowUp: ['↑', '↑'], ArrowDown: ['↓', '↓'], ArrowLeft: ['←', '←'], ArrowRight: ['→', '→']
}

// "Mod-Shift-x" → macOS: ⌘⇧X / Windows: Ctrl+Shift+X
const format = (key: string) => {
  const parts = key.split(/-(?!$)/).map((p) => (NAMES[p] ? NAMES[p][MAC ? 0 : 1] : p.length === 1 ? p.toUpperCase() : p))
  return MAC ? parts.join('') : parts.join('+')
}

// 도움말 창 (F1). 탭으로 나뉜 단축키/입력 규칙 설명.
export function HelpPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(HELP[0].id)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  const cur = HELP.find((t) => t.id === tab)!
  return (
    <div className="settings-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings help" role="dialog" aria-label="도움말">
        <h2>사용법 및 단축키</h2>
        <div className="help-tabs" role="tablist">
          {HELP.map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === tab} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="help-body">
          {cur.sections.map((s) => (
            <section key={s.title}>
              <h3>{s.title}</h3>
              <table>
                <tbody>
                  {s.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="help-keys">
                        {r.keys?.map((k, j) => (
                          <kbd key={j}>{format(k)}</kbd>
                        ))}
                        {r.text && <code>{r.text}</code>}
                      </td>
                      <td>{r.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
        <button className="help-close" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}
