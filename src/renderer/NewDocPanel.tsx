import { useEffect, useState } from 'react'

type Dir = { label: string; path: string }

// 저장하지 않은 새 문서를 닫을 때 뜨는 시트: 이름·위치를 정해 저장하거나, 삭제하거나, 취소한다.
export function NewDocPanel({ onSave, onDelete, onCancel }: { onSave: (dir: string, name: string) => Promise<boolean>; onDelete: () => void; onCancel: () => void }) {
  const [name, setName] = useState('무제.md')
  const [dirs, setDirs] = useState<Dir[]>([])
  const [dir, setDir] = useState('')
  useEffect(() => {
    window.api.getDirs().then((d) => (setDirs(d), setDir(d[0].path)))
  }, [])
  const save = async () => {
    if (name.trim() && dir && (await onSave(dir, name.trim()))) onDelete()
  }
  const pick = async () => {
    const p = await window.api.pickDir()
    if (!p) return
    if (!dirs.some((d) => d.path === p)) setDirs([...dirs, { label: p.split(/[\\/]/).pop() || p, path: p }])
    setDir(p)
  }
  const ext = (n: string) => n.replace(/\.[^.]*$/, '')
  const format = (f: string) => setName(ext(name) + f)
  return (
    <div className="settings-overlay" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="settings newdoc">
        <h2>이 새로운 문서('무제')를 유지하겠습니까?</h2>
        <p className="newdoc-msg">변경 사항을 저장하거나 이 문서를 즉시 삭제할 수도 있습니다. 이 동작은 취소할 수 없습니다.</p>
        <div className="newdoc-grid">
          <span>별도 저장:</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.setSelectionRange(0, ext(name).length)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && save()} />
          <span>파일 포맷:</span>
          <select value={name.endsWith('.txt') ? '.txt' : '.md'} onChange={(e) => format(e.target.value)}>
            <option value=".md">Markdown</option>
            <option value=".txt">텍스트</option>
          </select>
          <span>위치:</span>
          <div className="newdoc-dir">
            <select value={dir} onChange={(e) => setDir(e.target.value)}>
              {dirs.map((d) => (
                <option key={d.path} value={d.path} title={d.path}>{d.label}</option>
              ))}
            </select>
            <button className="icon" title="다른 폴더 선택…" onClick={pick}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 5l4.5 4.5L11.5 5" /></svg>
            </button>
          </div>
        </div>
        <div className="newdoc-btns">
          <button className="danger" onClick={onDelete}>삭제</button>
          <span />
          <button onClick={onCancel}>취소</button>
          <button className="primary" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  )
}
