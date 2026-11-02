import { useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { indentUnit, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { LanguageDescription } from '@codemirror/language'
import { mermaidDescription } from './mermaidLang'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { codeHighlight, imageDrop, linkClick, livePreview, setBaseDir } from './livePreview'
import { tables } from './tables'
import { fenceAutoClose, fenceCompletion, keepOutOfFence, langIcons, shortcuts } from './commands'
import { mathSyntax } from './mathSyntax'
import { richBlocks } from './richBlocks'
import { HelpPanel } from './HelpPanel'
import { NewDocPanel } from './NewDocPanel'
import { SettingsPanel } from './SettingsPanel'
import { applySettings, loadSettings } from './settings'

const MAC = /Mac/.test(navigator.userAgent)

export function App() {
  const host = useRef<HTMLDivElement>(null)
  const nameEl = useRef<HTMLSpanElement>(null)
  const dotEl = useRef<HTMLElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const saveTo = useRef<(dir: string, name: string) => Promise<boolean>>(async () => false)
  useEffect(() => {
    let path: string | null = null
    let saved = ''
    // CRLF 파일을 LF로 바꿔 저장하지 않도록 파일의 줄바꿈을 보존한다.
    let eol = '\n'

    const title = () => {
      const dirty = view.state.sliceDoc() !== saved
      window.api.setState({ dirty, blank: !path && view.state.sliceDoc() === '' })
      const name = path ? path.split(/[\\/]/).pop()! : '제목 없음'
      document.title = `${name}${dirty ? ' •' : ''} - Nib`
      if (nameEl.current && dotEl.current) (nameEl.current.textContent = name, (dotEl.current.hidden = !dirty))
    }
    const make = (doc: string) =>
      EditorState.create({
        doc,
        extensions: [
          basicSetup,
          // 기본 하이라이트(링크 밑줄 등)를 끄고 코드 색칠만 쓴다. 마크다운 서식은 livePreview가 직접 입힌다.
          // 같은 우선순위에서는 앞에 둔 확장이 먼저 키를 처리한다: markdown()의 Enter(인용 이어쓰기)보다 앞에 둔다.
          shortcuts,
          keepOutOfFence,
          fenceAutoClose,
          langIcons,
          syntaxHighlighting(codeHighlight),
          indentUnit.of('    '),
          markdownLanguage.data.of({ autocomplete: fenceCompletion }),
          markdown({ base: markdownLanguage, codeLanguages: (info) => (/^mermaid$/i.test(info.trim()) ? mermaidDescription : LanguageDescription.matchLanguageName(languages, info, true)), extensions: [mathSyntax] }),
          livePreview,
          tables,
          richBlocks,
          linkClick,
          imageDrop,
          EditorView.lineWrapping,
          EditorState.lineSeparator.of(eol),
          EditorView.updateListener.of((u) => u.docChanged && title())
        ]
      })

    const view = new EditorView({ state: make(''), parent: host.current! })
    view.focus()
    title()

    const isDirty = () => view.state.sliceDoc() !== saved
    const load = (f: { path: string; content: string }) => {
      eol = f.content.includes('\r\n') ? '\r\n' : '\n'
      path = f.path
      setBaseDir(path)
      saved = f.content
      view.setState(make(f.content))
      window.api.setPath(path)
      title()
    }
    window.api.onLoadFile(load)
    window.api.initialFile().then((f) => f && load(f))
    const save = async (asNew = false) => {
      // 표 셀에서 입력 중이면 포커스를 풀어 문서에 반영한 뒤 저장한다.
      ;(document.activeElement as HTMLElement | null)?.blur()
      const content = view.state.sliceDoc()
      const p = await window.api.saveFile(asNew ? null : path, content)
      if (!p) return
      path = p
      setBaseDir(path)
      saved = content
      window.api.setPath(path)
      title()
    }
    saveTo.current = async (dir, name) => {
      ;(document.activeElement as HTMLElement | null)?.blur()
      const content = view.state.sliceDoc()
      const p = await window.api.saveTo(dir, name, content)
      if (!p) return false
      path = p
      saved = content
      window.api.setPath(path)
      title()
      return true
    }
    window.api.onAskNew(() => setNewOpen(true))
    window.api.onMenu((a) => {
      if (a === 'save') save()
      else if (a === 'saveAs') save(true)
      else if (a === 'settings') setSettingsOpen(true)
      else if (a === 'help') setHelpOpen(true)
    })
    // 닫기 확인에서 '저장'을 고른 경우: 저장에 성공(취소 아님)하면 창을 닫는다.
    window.api.onSaveAndClose(async () => {
      await save()
      if (!isDirty()) window.api.closeNow()
    })
    // 다른 창에서 설정을 바꾸면 이 창에도 반영한다.
    const onStorage = () => applySettings(loadSettings())
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      view.destroy()
    }
  }, [])
  return (
    <>
      {MAC && (
        <div className="titlebar">
          <span ref={nameEl} className="tb-name" />
          <i ref={dotEl} className="tb-dot" hidden title="저장하지 않은 변경 사항" />
          <span className="tb-app"> - Nib</span>
        </div>
      )}
      <div ref={host} className={MAC ? 'editor with-titlebar' : 'editor'} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {newOpen && <NewDocPanel onSave={saveTo.current} onDelete={() => window.api.closeNow()} onCancel={() => setNewOpen(false)} />}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </>
  )
}
