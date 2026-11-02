import { indentLess, indentMore } from '@codemirror/commands'
import { autocompletion } from '@codemirror/autocomplete'
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { languages } from '@codemirror/language-data'
import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import type { Text } from '@codemirror/state'
import type { Line } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { EditorView, keymap } from '@codemirror/view'
import { ICON_BODY, LANG_ICON } from './langIcons'
import { emptyTable, serializeTable, splitRow } from './tableModel'

// 선택 영역을 마커로 감싸거나(이미 감싸져 있으면) 푼다. 선택이 없으면 마커 쌍을 넣고 가운데에 커서를 둔다.
// ponytail: `**굵게**` 안에서 `*`로 토글하면 굵게의 `*`를 벗겨낸다. 구문 트리 기반 토글은 필요해지면.
const toggleWrap = (open: string, close = open) => (view: EditorView) => {
  view.dispatch(
    view.state.changeByRange((r) => {
      const { doc } = view.state
      const before = doc.sliceString(Math.max(0, r.from - open.length), r.from)
      const after = doc.sliceString(r.to, Math.min(doc.length, r.to + close.length))
      if (before === open && after === close) {
        return { changes: [{ from: r.from - open.length, to: r.from }, { from: r.to, to: r.to + close.length }], range: EditorSelection.range(r.from - open.length, r.to - open.length) }
      }
      return { changes: [{ from: r.from, insert: open }, { from: r.to, insert: close }], range: EditorSelection.range(r.from + open.length, r.to + open.length) }
    })
  )
  return true
}

// [선택]() 으로 바꾸고, 선택이 있으면 () 안에, 없으면 [] 안에 커서를 둔다.
const link = (view: EditorView) => {
  view.dispatch(
    view.state.changeByRange((r) => {
      const t = view.state.sliceDoc(r.from, r.to)
      return { changes: { from: r.from, to: r.to, insert: `[${t}]()` }, range: EditorSelection.cursor(r.from + (t ? t.length + 3 : 1)) }
    })
  )
  return true
}

// 커서가 있는 줄 아래에 3x2 빈 표를 넣고 첫 셀로 포커스를 옮긴다.
const insertTable = (view: EditorView) => {
  const eol = view.state.lineBreak
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const lead = line.length ? eol + eol : ''
  const from = line.to + lead.length
  view.dispatch({ changes: { from: line.to, insert: lead + serializeTable(emptyTable(), eol) + eol }, selection: { anchor: from } })
  focusTableCell(view, from, 0, 0)
  return true
}

// 표가 문서에 반영된 직후(DOM이 만들어진 뒤) 지정한 셀로 포커스를 옮긴다.
const focusTableCell = (view: EditorView, from: number, r: number, c: number) =>
  requestAnimationFrame(() => {
    const w = [...view.dom.querySelectorAll<HTMLElement>('.cm-table-wrap')].find((e) => view.posAtDOM(e) === from)
    w?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)?.focus()
  })

// `|주제|내용|` 뒤에서 엔터를 치면 그 줄을 표로 바꾸고 첫 본문 셀로 이동한다.
const enterTable = (view: EditorView) => {
  const { state } = view
  const sel = state.selection.main
  const line = state.doc.lineAt(sel.head)
  if (!sel.empty || sel.head !== line.to || !/^\s*\|.*\|\s*$/.test(line.text)) return false
  const cells = splitRow(line.text)
  if (cells.length < 2) return false
  for (let n = syntaxTree(state).resolve(line.from, 1); n; n = n.parent!) if (n.name === 'FencedCode' || n.name === 'Table') return false
  const eol = state.lineBreak
  const prev = line.number > 1 ? state.doc.line(line.number - 1).text.trim() : ''
  const lead = prev ? eol : '' // 문단 바로 뒤가 아니라 빈 줄을 하나 두어 표로 인식되게 한다
  const text = serializeTable({ rows: [cells, cells.map(() => '')], aligns: cells.map(() => null) }, eol)
  const from = line.from + lead.length
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: lead + text + (line.to >= state.doc.length ? eol : '') },
    selection: { anchor: from }
  })
  focusTableCell(view, from, 1, 0)
  return true
}

// 선택에 걸친 줄들(중복 없이).
const selectedLines = (view: EditorView) => {
  const { doc, selection } = view.state
  const seen = new Set<number>()
  for (const r of selection.ranges) for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) seen.add(n)
  return [...seen].map((n) => doc.line(n))
}

// 제목: level 0은 본문. 같은 레벨을 다시 누르면 본문으로 돌아간다.
const HEADING = /^(#{1,6})[ \t]+/
const setHeading = (level: number) => (view: EditorView) => {
  view.dispatch({
    changes: selectedLines(view).map((l) => {
      const m = HEADING.exec(l.text)
      const target = m && m[1].length === level ? 0 : level
      return { from: l.from, to: l.from + (m ? m[0].length : 0), insert: target ? '#'.repeat(target) + ' ' : '' }
    })
  })
  return true
}
// 제목 레벨 올리기(#가 줄어듦)/내리기. 본문에서 올리면 H6, H6에서 내리면 본문.
const shiftHeading = (d: -1 | 1) => (view: EditorView) => {
  view.dispatch({
    changes: selectedLines(view).map((l) => {
      const m = HEADING.exec(l.text)
      const cur = m ? m[1].length : 0
      const next = d < 0 ? (cur === 0 ? 6 : Math.max(1, cur - 1)) : cur === 0 ? 0 : cur === 6 ? 0 : cur + 1
      return { from: l.from, to: l.from + (m ? m[0].length : 0), insert: next ? '#'.repeat(next) + ' ' : '' }
    })
  })
  return true
}

const LIST = /^(\s*)(?:[-*+]|\d+[.)])[ \t]+/
const QUOTE = /^(\s*)>[ \t]?/
// 모든 줄에 이미 있으면 걷어내고, 아니면(다른 종류 목록 포함) 바꿔 붙인다.
const toggleLine = (has: RegExp, strip: RegExp, mark: (i: number) => string) => (view: EditorView) => {
  const lines = selectedLines(view)
  const all = lines.every((l) => has.test(l.text))
  view.dispatch({
    changes: lines.map((l, i) => {
      const m = strip.exec(l.text)
      const indent = m ? m[1].length : /^\s*/.exec(l.text)![0].length
      return { from: l.from + indent, to: l.from + (m ? m[0].length : indent), insert: all ? '' : mark(i) }
    })
  })
  return true
}
const ulOnly = /^\s*[-*+][ \t]+/, olOnly = /^\s*\d+[.)][ \t]+/

// 선택한 줄을 코드 블록으로 감싼다. 선택이 없으면 빈 코드 블록을 만들고 안에 커서를 둔다.
const codeFence = (view: EditorView) => {
  const { state } = view
  const eol = state.lineBreak
  const sel = state.selection.main
  if (sel.empty) {
    const line = state.doc.lineAt(sel.head)
    const lead = line.length ? eol : ''
    view.dispatch({ changes: { from: line.to, insert: lead + '```' + eol + eol + '```' }, selection: { anchor: line.to + lead.length + 3 + eol.length } })
  } else {
    const a = state.doc.lineAt(sel.from), b = state.doc.lineAt(sel.to)
    view.dispatch({ changes: [{ from: a.from, insert: '```' + eol }, { from: b.to, insert: eol + '```' }] })
  }
  return true
}

// 여는 펜스(```lang) 줄에서 엔터: 닫는 펜스를 만들고 그 사이에 커서를 둔다.
const enterFence = (view: EditorView) => {
  const { state } = view
  const sel = state.selection.main
  const line = state.doc.lineAt(sel.head)
  if (!sel.empty || sel.head !== line.to || !/^```[\w+#.-]*$/.test(line.text)) return false
  for (let n = syntaxTree(state).resolve(line.from, 1); n; n = n.parent!) {
    // 이미 열린 코드 블록의 닫는 펜스를 쓰는 중이면 개입하지 않는다.
    if (n.name === 'FencedCode' && n.from < line.from) return false
  }
  // 닫는 펜스가 이미 있는(자동으로 닫힌) 빈 블록이면 안으로만 들어간다.
  const f = blockOf(state, line.from, 1)
  if (f && f.first.number === line.number && emptyBlock(state, f)) return (view.dispatch({ selection: { anchor: line.to + 1 } }), true)
  const eol = state.lineBreak
  view.dispatch({ changes: { from: line.to, insert: eol + eol + '```' }, selection: { anchor: line.to + eol.length } })
  return true
}

// 코드 블록 언어 목록: 이름과 별칭을 모두 후보로 둔다 (ts, typescript 둘 다 찾을 수 있게).
// 언어마다 항목 하나. id는 코드 블록에 들어가는 값, keys는 검색에 쓰는 이름·별칭.
export type Lang = { id: string; name: string; keys: string[] }
export const langList: Lang[] = [
  ...languages.map((l) => ({ id: l.name.toLowerCase().replace(/\s+/g, '-'), name: l.name, keys: [l.name.toLowerCase(), ...l.alias] })),
  { id: 'mermaid', name: 'Mermaid', keys: ['mermaid'] }
].sort((a, b) => a.name.localeCompare(b.name))

// 입력과 이름/별칭이 맞는 언어. 앞부분이 맞는 것을 먼저 보여 준다.
export const matchLangs = (q: string): Lang[] => {
  q = q.trim().toLowerCase()
  if (!q) return langList
  const rank = (l: Lang) => (l.keys.some((k) => k.startsWith(q)) ? 0 : l.keys.some((k) => k.includes(q)) ? 1 : 2)
  return langList.filter((l) => rank(l) < 2).sort((a, b) => rank(a) - rank(b))
}

// 언어 아이콘 요소 (vscode-icons). 없는 언어는 일반 문서 아이콘.
export const langIcon = (name: string): HTMLElement => {
  const i = document.createElement('span')
  i.className = 'cm-langicon'
  i.innerHTML = `<svg viewBox="0 0 32 32" width="18" height="18">${ICON_BODY[LANG_ICON[name] ?? 'text']}</svg>`
  return i
}

// 자동완성 목록 앞에 언어 아이콘을 그린다 (completion.type이 언어 이름).
export const langIcons = autocompletion({ icons: false, addToOptions: [{ position: 20, render: (c) => langIcon(c.type ?? '') }] })

// ``` 뒤에서 언어를 고르면 그 언어로 코드 블록을 바로 만든다 (엔터를 한 번 더 누를 필요가 없게).
export const fenceCompletion = (ctx: CompletionContext): CompletionResult | null => {
  const m = ctx.matchBefore(/^```[^\s`]*/)
  if (!m) return null
  const options: Completion[] = matchLangs(m.text.slice(3)).map((l) => ({
    label: l.name,
    type: l.name,
    apply: (view: EditorView, _c: Completion, from: number, to: number) => {
      view.dispatch({ changes: { from, to, insert: l.id }, selection: { anchor: from + l.id.length } })
      enterFence(view)
    }
  }))
  return { from: m.from + 3, options, filter: false }
}

// 빈 인용 줄에서 엔터: 인용을 끝내고 그 아래 새 줄로 나간다.
const exitQuote = (view: EditorView) => {
  const sel = view.state.selection.main
  const line = view.state.doc.lineAt(sel.head)
  if (!sel.empty || sel.head !== line.to || !/^(?:\s*>)+[ \t]*$/.test(line.text)) return false
  // 인용과 새 문단 사이에 빈 줄이 있어야 한다 (없으면 다음 줄이 인용에 이어붙는다).
  const eol = view.state.lineBreak
  view.dispatch({ changes: { from: line.from, to: line.to, insert: eol }, selection: { anchor: line.from + eol.length } })
  return true
}

// 닫는 펜스까지 있고 본문이 한 줄 이상인 코드 블록 (여는/닫는 펜스 줄은 화면에서 숨겨져 있다).
type Fence = { first: Line; last: Line }
const blockOf = (state: EditorState, pos: number, side: -1 | 1): Fence | null => {
  let n = syntaxTree(state).resolve(pos, side)
  while (n && n.name !== 'FencedCode') n = n.parent!
  if (!n || n.getChildren('CodeMark').length < 2) return null
  const first = state.doc.lineAt(n.from), last = state.doc.lineAt(n.to)
  return last.number - first.number >= 2 ? { first, last } : null
}
// 본문이 빈 줄 하나뿐인 블록 (``` 입력 직후 자동으로 닫힌 상태)
export const emptyBlock = (state: EditorState, f: Fence) => f.last.number - f.first.number === 2 && state.doc.line(f.first.number + 1).length === 0

// 줄 맨 앞에 ```를 입력하는 순간 닫는 펜스를 함께 만든다.
// 닫히지 않은 ```는 Markdown 규칙상 문서 아래쪽의 다른 ```와 짝이 되어, 그 사이의 인용·코드 블록 등이 전부 코드로 합쳐져 버리기 때문이다.
export const fenceAutoClose = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '`') return false
  const { state } = view
  const line = state.doc.lineAt(from)
  if (to > line.to) return false
  const after = line.text.slice(0, from - line.from) + text + line.text.slice(to - line.from)
  if (!/^ {0,3}```$/.test(after)) return false
  // 이미 열린 코드 블록 안이라면 지금 쓰는 것은 닫는 펜스다.
  for (let n = syntaxTree(state).resolve(line.from, 1); n; n = n.parent!) if (n.name === 'FencedCode' && n.from < line.from) return false
  const eol = state.lineBreak
  view.dispatch({ changes: [{ from, to, insert: text }, { from: line.to, insert: eol + eol + after }], selection: { anchor: from + 1 }, userEvent: 'input.type' })
  return true
})

// pos가 블록의 맨 끝(닫는 펜스 줄 끝)이면 앞쪽 노드로 조회해야 블록 안으로 잡힌다.
const blockAt =(state: EditorState, pos: number) => blockOf(state, pos, 1) ?? blockOf(state, pos, -1)
const fenceAt = (view: EditorView) => blockAt(view.state, view.state.selection.main.head)
// line 바로 위(-1)/아래(+1) 줄이 코드 블록의 닫는/여는 펜스 줄이면 그 블록
const adjacentBlock = (state: EditorState, line: Line, dir: -1 | 1): Fence | null => {
  const n = line.number + dir
  if (n < 1 || n > state.doc.lines) return null
  const other = state.doc.line(n)
  const f = blockOf(state, dir > 0 ? other.from : other.to, dir > 0 ? 1 : -1)
  return f && (dir > 0 ? f.first.number === n : f.last.number === n) ? f : null
}

// 블록 바로 위/아래 줄로 나간다 (블록이 문서 처음/끝이면 줄을 하나 만든다).
const leaveBlock = (view: EditorView, f: Fence, dir: -1 | 1) => {
  const { doc, lineBreak: eol } = view.state
  if (dir < 0) {
    if (f.first.from === 0) view.dispatch({ changes: { from: 0, insert: eol }, selection: { anchor: 0 } })
    else view.dispatch({ selection: { anchor: f.first.from - eol.length } })
  } else if (f.last.to >= doc.length) view.dispatch({ changes: { from: f.last.to, insert: eol }, selection: { anchor: f.last.to + eol.length } })
  else view.dispatch({ selection: { anchor: f.last.to + eol.length } })
  return true
}

// 방향키: 숨은 펜스 줄에 커서가 멈추지 않게, 블록 안의 첫/끝 줄에서는 밖으로, 블록 바로 옆 줄에서는 안으로 건너뛴다.
const codeNav = (dir: 'up' | 'down' | 'left' | 'right') => (view: EditorView) => {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const line = state.doc.lineAt(sel.head)
  const d = dir === 'up' || dir === 'left' ? -1 : 1
  // 줄이 길어 화면에서 여러 줄로 접힌 경우에는 그 줄 안에서 먼저 움직이게 둔다.
  const atEdge =
    dir === 'left' ? sel.head === line.from : dir === 'right' ? sel.head === line.to : state.doc.lineAt(view.moveVertically(sel, dir === 'down').head).number !== line.number
  if (!atEdge) return false
  const inside = fenceAt(view)
  if (inside) return line.number === (d < 0 ? inside.first.number + 1 : inside.last.number - 1) ? leaveBlock(view, inside, d) : false
  const adj = adjacentBlock(state, line, d)
  if (!adj) return false
  const body = d > 0 ? state.doc.line(adj.first.number + 1) : state.doc.line(adj.last.number - 1)
  const col = Math.min(sel.head - line.from, body.length)
  view.dispatch({ selection: { anchor: dir === 'left' ? body.to : dir === 'right' ? body.from : body.from + col } })
  return true
}

// 인용 바로 아래의 빈 줄: 인용과 다음 글을 가르는 줄이라 파일에는 남기되 화면에서는 숨긴다 (다음 줄이 있을 때만).
export const quoteGap = (doc: Text, n: number) => n > 1 && n < doc.lines && doc.line(n).length === 0 && /^\s{0,3}>/.test(doc.line(n - 1).text)

// 커서가 숨은 펜스 줄(여는/닫는 ```)에 놓이면 박스 안으로 옮긴다. 보이지 않는 줄에서 편집하다 블록이 깨지지 않게 한다.
// (클릭, 닫는 펜스를 직접 타이핑해 완성한 경우 등)
export const keepOutOfFence = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection && !tr.docChanged) return tr
  const sel = tr.newSelection.main
  if (!sel.empty) return tr
  const line = tr.state.doc.lineAt(sel.head)
  // 숨은 빈 줄에 커서가 놓이면 움직이던 방향의 보이는 줄로 넘긴다.
  if (quoteGap(tr.state.doc, line.number)) {
    const down = sel.head >= tr.changes.mapPos(tr.startState.selection.main.head)
    return [tr, { selection: { anchor: down ? line.to + 1 : line.from - 1 }, sequential: true }]
  }
  const f = blockAt(tr.state, sel.head)
  if (!f) return tr
  if (line.number === f.first.number && emptyBlock(tr.state, f)) return tr // 막 만든 빈 블록: 여는 줄에서 언어를 입력할 수 있게 둔다
  if (line.number === f.first.number) return [tr, { selection: { anchor: tr.state.doc.line(f.first.number + 1).from }, sequential: true }]
  if (line.number === f.last.number) return [tr, { selection: { anchor: tr.state.doc.line(f.last.number - 1).to }, sequential: true }]
  return tr
})

// 숨은 펜스 줄과 내용/본문이 합쳐져 블록이 깨지지 않게 Backspace/Delete를 가로챈다.
const codeEdge = (key: 'Backspace' | 'Delete') => (view: EditorView) => {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const line = state.doc.lineAt(sel.head)
  const f = fenceAt(view)
  if (f) {
    if (key === 'Backspace' && sel.head === line.from && line.number === f.first.number + 1) {
      // 빈 코드 블록에서 Backspace: 블록을 통째로 지운다. 내용이 있으면 아무 일도 하지 않는다 (여는 펜스와 합쳐지지 않게).
      if (f.last.number - f.first.number === 2 && line.text === '') view.dispatch({ changes: { from: f.first.from, to: f.last.to }, selection: { anchor: f.first.from } })
      return true
    }
    return key === 'Delete' && sel.head === line.to && line.number === f.last.number - 1 // 닫는 펜스와 합쳐지지 않게
  }
  // 블록 바로 아래 줄 맨 앞의 Backspace: 닫는 펜스 줄을 지우지 않고 블록 마지막 줄 끝으로 들어간다.
  if (key === 'Backspace' && sel.head === line.from) {
    const adj = adjacentBlock(state, line, -1)
    if (adj && line.text === '') return (view.dispatch({ changes: { from: line.from - state.lineBreak.length, to: line.to } }), true) // 빈 줄이면 그 줄을 지운다
    if (adj) return (view.dispatch({ selection: { anchor: state.doc.line(adj.last.number - 1).to } }), true)
  }
  // 블록 바로 위 줄 끝의 Delete: 여는 펜스 줄과 합쳐지지 않게 블록 첫 줄 앞으로 들어간다.
  if (key === 'Delete' && sel.head === line.to) {
    const adj = adjacentBlock(state, line, 1)
    if (adj && line.text === '') return (view.dispatch({ changes: { from: line.from, to: line.to + state.lineBreak.length } }), true)
    if (adj) return (view.dispatch({ selection: { anchor: state.doc.line(adj.first.number + 1).from } }), true)
  }
  return false
}

// 숨은 빈 줄(quoteGap)을 Backspace/Delete로 지워 다음 글이 인용에 이어 붙지 않게 한다.
const gapEdge = (key: 'Backspace' | 'Delete') => (view: EditorView) => {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const line = state.doc.lineAt(sel.head)
  if (key === 'Backspace' && sel.head === line.from && quoteGap(state.doc, line.number - 1)) {
    // 빈 줄이면 그 줄만 지우고 인용 끝으로, 글이 있으면 인용 끝으로 커서만 옮긴다.
    const gap = state.doc.line(line.number - 1)
    if (line.length === 0) view.dispatch({ changes: { from: gap.to, to: line.to }, selection: { anchor: gap.from - 1 } })
    else view.dispatch({ selection: { anchor: gap.from - 1 } })
    return true
  }
  if (key === 'Delete' && sel.head === line.to && quoteGap(state.doc, line.number + 1)) {
    view.dispatch({ selection: { anchor: line.to + 2 } }) // 숨은 줄을 건너 다음 줄 맨 앞으로
    return true
  }
  return false
}

// 제목/인용/글머리 기호는 숨겨져 있으므로, 내용 맨 앞에서 Backspace를 누르면 그 서식을 해제한다.
const backspaceUnformat = (view: EditorView) => {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const line = state.doc.lineAt(sel.head)
  const m = HEADING.exec(line.text) ?? /^>[ \t]?/.exec(line.text)
  if (m && sel.head === line.from + m[0].length) {
    // 인용 줄의 기호를 지우면 윗줄 인용에 이어 붙는(lazy continuation) 글이 되므로, 인용 바로 아래라면 빈 줄을 하나 끼워 인용 밖으로 내보낸다.
    const eol = state.lineBreak
    const gap = m[0].startsWith('>') && line.number > 1 && /^\s*>/.test(state.doc.line(line.number - 1).text)
    view.dispatch({ changes: [...(gap ? [{ from: line.from, insert: eol }] : []), { from: line.from, to: line.from + m[0].length }], selection: { anchor: line.from + (gap ? eol.length : 0) } })
    return true
  }
  // 글머리/번호/체크박스: 체크박스 → 일반 항목 → 서식 없음 순서로 한 단계씩 벗긴다. (들여쓰기는 남긴다)
  const lm = /^(\s*)(?:[-*+]|\d+[.)])[ \t]+(\[[ xX]\][ \t]*)?/.exec(line.text)
  if (lm && sel.head === line.from + lm[0].length) {
    const from = lm[2] ? sel.head - lm[2].length : line.from + lm[1].length
    view.dispatch({ changes: { from, to: sel.head }, selection: { anchor: from } })
    return true
  }
  // 공백(들여쓰기)만 남은 줄의 끝에서 Backspace: 한 단계(4칸)씩 내어쓴다 (칸 폭이 고정이라 커서가 한 단계씩 움직인다).
  if (/^[ \t]+$/.test(line.text) && sel.head === line.to) {
    const n = line.text.endsWith('\t') ? 1 : Math.min(4, line.length)
    view.dispatch({ changes: { from: line.to - n, to: line.to }, selection: { anchor: line.to - n } })
    return true
  }
  return false
}

// `$$` 줄에서 엔터: 닫는 `$$`를 만들고 그 사이에 커서를 둔다 (코드 펜스와 같은 방식). 이미 열린 수식 블록의 닫는 줄이면 개입하지 않는다.
const enterMath = (view: EditorView) => {
  const { state } = view
  const sel = state.selection.main
  const line = state.doc.lineAt(sel.head)
  if (!sel.empty || sel.head !== line.to || line.text.trim() !== '$$') return false
  for (let n = syntaxTree(state).resolve(line.from, 1); n; n = n.parent!) {
    if ((n.name === 'BlockMath' || n.name === 'FencedCode') && n.from < line.from) return false
  }
  const eol = state.lineBreak
  view.dispatch({ changes: { from: line.to, insert: eol + eol + '$$' }, selection: { anchor: line.to + eol.length } })
  return true
}

// 수식 블록 삽입(Cmd+Option+B): 현재 줄 아래에 $$ 블록을 만들고 안에 커서를 둔다.
const mathBlock = (view: EditorView) => {
  const { state } = view
  const eol = state.lineBreak
  const line = state.doc.lineAt(state.selection.main.head)
  const lead = line.length ? eol : ''
  view.dispatch({ changes: { from: line.to, insert: lead + '$$' + eol + eol + '$$' }, selection: { anchor: line.to + lead.length + 2 + eol.length } })
  return true
}

// 내용이 없는 목록 항목(`- `, `1. `)에서 엔터: 들여쓴 항목은 한 단계 내어쓰고, 최상위 항목이면 목록을 끝낸다.
// (빈 항목은 Markdown이 목록으로 해석하지 않아 기본 이어쓰기가 동작하지 않는다.)
const EMPTY_ITEM = /^([ \t]*)([-*+]|\d+[.)])([ \t]+\[[ xX]\])?[ \t]+$/
const enterEmptyList = (view: EditorView) => {
  const sel = view.state.selection.main
  const line = view.state.doc.lineAt(sel.head)
  const m = EMPTY_ITEM.exec(line.text)
  if (!sel.empty || sel.head !== line.to || !m) return false
  const indent = m[1].replace(/\t/g, '    ').length
  const insert = indent >= 4 ? ' '.repeat(indent - 4) + m[2] + (m[3] ?? '') + ' ' : '' // 번호는 아래 renumber가 위치에 맞게 고친다
  view.dispatch({ changes: { from: line.from, to: line.to, insert }, selection: { anchor: line.from + insert.length } })
  renumber(view)
  return true
}

// 목록 줄에서만 Tab/Shift+Tab으로 들여쓰기/내어쓰기. 그 외에는 기본 동작에 맡긴다.
const inList = (view: EditorView) => selectedLines(view).every((l) => LIST.test(l.text))

const indentCols = (text: string) => /^[ \t]*/.exec(text)![0].replace(/\t/g, '    ').length
const ITEM = /^([ \t]*)(?:([-*+])|(\d+)([.)]))[ \t]+/

// 번호 목록 다시 매기기: 커서가 있는 목록 덩어리(이어진 목록/들여쓴 줄)의 번호 항목을 단계별로 1부터(덩어리 맨 앞 목록은 처음 번호부터) 차례로 맞춘다.
// 들여쓰기/내어쓰기 뒤에 번호가 어긋나지 않게 한다 (예: 1. 주제 아래로 들여쓴 `2. 내용`은 `1.`이 된다).
// ponytail: 두 덩어리 사이에 빈 줄이 있으면 별개의 목록으로 본다. 코드 블록 안의 번호는 구분하지 않는다.
const renumber = (view: EditorView) => {
  const { doc } = view.state
  const cur = doc.lineAt(view.state.selection.main.head).number
  const inBlock = (n: number) => {
    const t = doc.line(n).text
    return t.trim() !== '' && (ITEM.test(t) || /^[ \t]/.test(t))
  }
  if (!inBlock(cur)) return
  let a = cur, b = cur
  while (a > 1 && inBlock(a - 1)) a--
  while (b < doc.lines && inBlock(b + 1)) b++
  const stack: { indent: number; ordered: boolean; n: number }[] = []
  const changes: { from: number; to: number; insert: string }[] = []
  for (let l = a; l <= b; l++) {
    const ln = doc.line(l)
    const m = ITEM.exec(ln.text)
    if (!m) continue
    const indent = indentCols(m[1])
    const ordered = m[3] !== undefined
    while (stack.length && stack[stack.length - 1].indent > indent) stack.pop()
    let top = stack[stack.length - 1]
    if (top && top.indent === indent && top.ordered === ordered) {
      if (ordered) top.n++
    } else {
      if (top && top.indent === indent) stack.pop()
      top = { indent, ordered, n: ordered ? (stack.length === 0 ? Number(m[3]) : 1) : 0 }
      stack.push(top)
    }
    if (ordered && Number(m[3]) !== top.n) {
      const from = ln.from + m[1].length
      changes.push({ from, to: from + m[3].length, insert: String(top.n) })
    }
  }
  if (changes.length) view.dispatch({ changes, userEvent: 'input.renumber' })
}

// 목록 항목 들여쓰기/내어쓰기 (Tab / Shift+Tab). 선택이 한 줄이면 그 항목의 하위 항목도 함께 옮긴다.
// 첫 항목이나, 이전 항목보다 두 단계 이상 깊게는 들여쓸 수 없다. 목록 밖에서는 아무것도 하지 않는다(코드 블록 안은 들여쓰기 한 단계).
const indentList = (dir: 1 | -1) => (view: EditorView) => {
  const { state } = view
  const fence = fenceAt(view)
  if (fence) return (dir > 0 ? indentMore : indentLess)(view) // 코드 블록 안
  if (!inList(view)) return true // 포커스가 다른 곳(체크박스, 표 칸)으로 넘어가지 않게 키를 소비한다
  const lines = selectedLines(view)
  const first = lines[0]
  const base = indentCols(first.text)
  if (dir > 0) {
    let p = first.number - 1
    while (p >= 1 && state.doc.line(p).text.trim() === '') p--
    if (p < 1) return true
    const prev = state.doc.line(p).text
    if (indentCols(prev) < base || (!ITEM.test(prev) && indentCols(prev) === 0)) return true
  } else if (!/^[ \t]/.test(first.text)) return true // 이미 최상위
  if (lines.length === 1) {
    for (let n = first.number + 1; n <= state.doc.lines; n++) {
      const t = state.doc.line(n).text
      if (t.trim() === '' || indentCols(t) <= base) break
      lines.push(state.doc.line(n))
    }
  }
  view.dispatch({
    changes: lines.flatMap((l): { from: number; to?: number; insert?: string }[] => {
      if (dir > 0) return [{ from: l.from, insert: '    ' }]
      const k = l.text.startsWith('\t') ? 1 : Math.min(4, /^ */.exec(l.text)![0].length)
      return k ? [{ from: l.from, to: l.from + k }] : []
    }),
    userEvent: 'input.indent'
  })
  renumber(view)
  return true
}
const tabIn = indentList(1)
const tabOut = indentList(-1)

// 줄바꿈(하드 브레이크): 줄 끝 공백 두 개 + 개행
const softBreak = (view: EditorView) => {
  view.dispatch(view.state.replaceSelection('  ' + view.state.lineBreak))
  return true
}

export const shortcuts = Prec.high(
  keymap.of([
    { key: 'Mod-b', run: toggleWrap('**') },
    { key: 'Mod-i', run: toggleWrap('*') },
    { key: 'Mod-Shift-x', run: toggleWrap('~~') },
    { key: 'Mod-k', run: link },
    { key: 'Mod-u', run: toggleWrap('<u>', '</u>') }, // 밑줄
    { key: 'Mod-Shift-h', run: toggleWrap('==') }, // 하이라이트
    { key: 'Mod-Alt-=', run: toggleWrap('^') }, // 위첨자
    { key: 'Mod-Alt--', run: toggleWrap('~') }, // 아래첨자
    { key: 'Mod-Alt-t', run: insertTable },
    { key: 'Mod-Shift-`', run: toggleWrap('`') },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ key: `Mod-${n}`, run: setHeading(n) })),
    { key: 'Mod-0', run: setHeading(0) },
    { key: 'Mod-=', run: shiftHeading(-1) },
    { key: 'Mod--', run: shiftHeading(1) },
    { key: 'Mod-Alt-q', run: toggleLine(QUOTE, QUOTE, () => '> ') },
    { key: 'Mod-Alt-u', run: toggleLine(ulOnly, LIST, () => '- ') },
    { key: 'Mod-Alt-o', run: toggleLine(olOnly, LIST, (i) => `${i + 1}. `) },
    { key: 'Mod-Alt-c', run: codeFence },
    { key: 'Mod-Alt-b', run: mathBlock },
    { key: 'Tab', run: tabIn },
    { key: 'Shift-Tab', run: tabOut },
    { key: 'Shift-Enter', run: softBreak },
    { key: 'ArrowUp', run: codeNav('up') },
    { key: 'ArrowDown', run: codeNav('down') },
    { key: 'ArrowLeft', run: codeNav('left') },
    { key: 'ArrowRight', run: codeNav('right') },
    { key: 'Backspace', run: (v) => codeEdge('Backspace')(v) || gapEdge('Backspace')(v) || backspaceUnformat(v) },
    { key: 'Delete', run: (v) => codeEdge('Delete')(v) || gapEdge('Delete')(v) },
    { key: 'Enter', run: (v) => exitQuote(v) || enterEmptyList(v) || enterFence(v) || enterMath(v) || enterTable(v) }
  ])
)
