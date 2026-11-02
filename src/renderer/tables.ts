import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { EditorState, RangeSetBuilder, StateField } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { Align, Table, addCol, addRow, deleteCol, deleteRow, moveCol, moveRow, parseTable, resize, serializeTable, setAlign } from './tableModel'

// 최상위 GFM 표를 셀 직접 편집이 가능한 HTML 표(블록 위젯)로 렌더한다.
// 셀 편집은 입력할 때마다 표 전체를 Markdown으로 다시 직렬화해 문서에 반영한다.
// ponytail: 셀 안 Cmd+Z는 브라우저 기본 되돌리기. 표 단위 되돌리기는 CodeMirror history 연동이 필요.
// ponytail: 목록/인용 안의 표는 렌더하지 않고 원문 그대로 둔다.

const svg = (body: string) => `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
const ICON = {
  grid: svg('<g fill="currentColor" stroke="none">' + [2, 7, 12].flatMap((x) => [2, 7, 12].map((y) => `<circle cx="${x}" cy="${y}" r="1.2"/>`)).join('') + '</g>'),
  left: svg('<path d="M1 3h12M1 6h8M1 9h12M1 12h8"/>'),
  center: svg('<path d="M1 3h12M3 6h8M1 9h12M3 12h8"/>'),
  right: svg('<path d="M1 3h12M5 6h8M1 9h12M5 12h8"/>'),
  more: svg('<g fill="currentColor" stroke="none"><circle cx="7" cy="2.5" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></g>'),
  trash: svg('<path d="M2 4h10M5.5 4V2.5h3V4M3.5 4l.5 8h6l.5-8"/>')
}
const MOD = /Mac/.test(navigator.userAgent) ? '⌘' : 'Ctrl+'
const div = (cls: string) => Object.assign(document.createElement('div'), { className: cls })

function tableRange(view: EditorView, wrap: HTMLElement): { from: number; to: number } | null {
  let n = syntaxTree(view.state).resolve(view.posAtDOM(wrap), 1)
  while (n && n.name !== 'Table') n = n.parent!
  return n ? { from: n.from, to: n.to } : null
}

const cellAt = (wrap: HTMLElement, r: number, c: number) =>
  wrap.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)

function focusCell(wrap: HTMLElement, r: number, c: number) {
  const cell = cellAt(wrap, r, c)
  if (!cell) return
  cell.focus()
  const sel = getSelection()!
  sel.selectAllChildren(cell)
  sel.collapseToEnd()
}

// 현재 행/열: 표 안에 포커스가 있으면 그 셀, 아니면 마지막으로 포커스했던 셀.
function current(wrap: HTMLElement): [number, number] {
  const c = document.activeElement?.closest<HTMLElement>('[data-r]')
  if (c && wrap.contains(c)) return [+c.dataset.r!, +c.dataset.c!]
  return [+(wrap.dataset.fr ?? 1), +(wrap.dataset.fc ?? 0)]
}

function readDom(wrap: HTMLElement): Table {
  const rows = [...wrap.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent ?? ''))
  return { rows, aligns: JSON.parse(wrap.dataset.aligns ?? '[]') }
}

// 입력 중인 내용을 문서에 반영. 모델이 그대로면(포커스만 했다 나온 경우) 원문 서식을 건드리지 않는다.
function commit(view: EditorView, wrap: HTMLElement, next: Table = readDom(wrap)) {
  const r = tableRange(view, wrap)
  if (!r) return
  if (JSON.stringify(parseTable(view.state.sliceDoc(r.from, r.to))) === JSON.stringify(next)) return
  view.dispatch({ changes: { from: r.from, to: r.to, insert: serializeTable(next, view.state.lineBreak) }, userEvent: 'input.table' })
}

// 정렬 버튼의 눌림 표시를 포커스한 열의 정렬에 맞춘다.
function syncAlign(wrap: HTMLElement) {
  const a = (JSON.parse(wrap.dataset.aligns ?? '[]') as Align[])[current(wrap)[1]] ?? null
  wrap.querySelectorAll<HTMLElement>('[data-al]').forEach((b) => b.classList.toggle('on', b.dataset.al === a))
}

// 행/열 조작: 구조가 바뀌므로 DOM을 다시 그리게 하고, 끝난 뒤 지정한 셀로 포커스를 옮긴다.
function restructure(view: EditorView, wrap: HTMLElement, op: (t: Table) => Table, focus: [number, number]) {
  wrap.dataset.rebuild = '1'
  commit(view, wrap, op(readDom(wrap)))
  delete wrap.dataset.rebuild
  const t = readDom(wrap)
  focusCell(wrap, Math.min(focus[0], t.rows.length - 1), Math.min(focus[1], t.aligns.length - 1))
  syncAlign(wrap)
}

// 표 바깥으로 나간다. 표와 새로 쓸 줄 사이에는 빈 줄이 하나 있어야 한다
// (표 바로 다음 줄에 글을 쓰면 GFM이 그 줄을 표의 행으로 합쳐 버린다).
function exit(view: EditorView, wrap: HTMLElement, dir: -1 | 1) {
  const r = tableRange(view, wrap)
  if (!r) return
  const { doc, lineBreak: eol } = view.state
  const blank = (t: string) => t.trim() === ''
  const go = (anchor: number, insert?: { at: number; text: string }) =>
    view.dispatch(insert ? { changes: { from: insert.at, insert: insert.text }, selection: { anchor } } : { selection: { anchor } })
  if (dir > 0) {
    if (r.to >= doc.length) go(r.to + 2 * eol.length, { at: r.to, text: eol + eol })
    else {
      const next = doc.lineAt(r.to + eol.length)
      if (!blank(next.text)) go(r.to + 2 * eol.length, { at: r.to, text: eol + eol })
      else if (next.to >= doc.length) go(next.to + eol.length, { at: next.to, text: eol })
      else {
        const n2 = doc.lineAt(next.to + eol.length)
        blank(n2.text) ? go(n2.from) : go(next.to + eol.length, { at: next.to, text: eol })
      }
    }
  } else if (r.from === 0) go(0, { at: 0, text: eol + eol })
  else {
    const prev = doc.lineAt(r.from - eol.length)
    if (!blank(prev.text)) go(prev.to)
    else if (prev.number === 1) go(0, { at: 0, text: eol })
    else {
      const p2 = doc.line(prev.number - 1)
      blank(p2.text) ? go(p2.from) : go(prev.from, { at: prev.from, text: eol })
    }
  }
  view.focus()
}

function removeTable(view: EditorView, wrap: HTMLElement) {
  const r = tableRange(view, wrap)
  if (!r) return
  const eol = view.state.lineBreak
  const after = view.state.sliceDoc(r.to, r.to + eol.length) === eol ? eol.length : 0
  view.dispatch({ changes: { from: r.from, to: r.to + after }, userEvent: 'delete.table' })
  view.focus()
}

// 툴바 버튼: mousedown에서 기본 동작을 막아 셀의 포커스를 유지한다.
function iconBtn(title: string, icon: string, run: () => void, active = false) {
  const b = document.createElement('button')
  b.className = 'cm-tt-btn' + (active ? ' on' : '')
  b.title = title
  b.innerHTML = icon
  b.addEventListener('mousedown', (e) => (e.preventDefault(), run()))
  return b
}

// 팝업은 바깥을 누르면 닫힌다.
function openPop(wrap: HTMLElement, pop: HTMLElement, at: HTMLElement) {
  wrap.querySelector('.cm-pop')?.remove()
  pop.style.left = `${at.offsetLeft}px`
  wrap.querySelector('.cm-table-tools')!.append(pop)
  const off = (e: Event) => {
    if (pop.contains(e.target as Node)) return
    pop.remove()
    document.removeEventListener('mousedown', off, true)
  }
  setTimeout(() => document.addEventListener('mousedown', off, true), 0)
}

function sizePop(view: EditorView, wrap: HTMLElement, cur: [number, number]) {
  const t = readDom(wrap)
  const R = 8, C = 10
  const pop = div('cm-pop cm-size')
  const grid = div('cm-size-grid')
  const inputs = [t.aligns.length, t.rows.length].map((v) => Object.assign(document.createElement('input'), { type: 'number', value: String(v), min: '1', max: '50' }))
  const paint = (c: number, r: number) =>
    [...grid.children].forEach((e, i) => e.classList.toggle('on', i % C < c && Math.floor(i / C) < r))
  const apply = (c: number, r: number) => {
    pop.remove()
    restructure(view, wrap, (x) => resize(x, r, c), cur)
  }
  for (let i = 0; i < R * C; i++) {
    const cell = div('cm-size-cell')
    cell.addEventListener('mouseenter', () => {
      const c = (i % C) + 1, r = Math.floor(i / C) + 1
      paint(c, r)
      inputs[0].value = String(c)
      inputs[1].value = String(r)
    })
    cell.addEventListener('mousedown', (e) => (e.preventDefault(), apply((i % C) + 1, Math.floor(i / C) + 1)))
    grid.append(cell)
  }
  paint(t.aligns.length, t.rows.length)
  const row = div('cm-size-in')
  const go = (e: KeyboardEvent) => e.key === 'Enter' && (e.preventDefault(), apply(+inputs[0].value || 1, +inputs[1].value || 1))
  inputs.forEach((i) => i.addEventListener('keydown', go))
  row.append(inputs[0], ' × ', inputs[1])
  pop.append(grid, row)
  return pop
}

function morePop(view: EditorView, wrap: HTMLElement, cur: [number, number]) {
  const [r, c] = cur
  const pop = div('cm-pop cm-menu')
  const item = (label: string, key: string, run: () => void) => {
    const b = document.createElement('button')
    b.innerHTML = `<span>${label}</span><kbd>${key}</kbd>`
    b.addEventListener('mousedown', (e) => (e.preventDefault(), pop.remove(), run()))
    pop.append(b)
  }
  const sep = () => pop.append(div('cm-menu-sep'))
  const re = (op: (t: Table) => Table, f: [number, number]) => restructure(view, wrap, op, f)
  item('앞에 행 삽입', '', () => r > 0 && re((t) => addRow(t, r - 1), [r, c]))
  item('뒤에 행 삽입', `${MOD}Enter`, () => re((t) => addRow(t, r), [r + 1, c]))
  item('앞에 열 삽입', '', () => re((t) => addCol(t, c - 1 < 0 ? -1 : c - 1), [r, c]))
  item('뒤에 열 삽입', '', () => re((t) => addCol(t, c), [r, c + 1]))
  sep()
  item('행 위로 이동', '⌥↑', () => re((t) => moveRow(t, r, -1), [r - 1, c]))
  item('행 아래로 이동', '⌥↓', () => re((t) => moveRow(t, r, 1), [r + 1, c]))
  item('열 왼쪽으로 이동', '⌥←', () => re((t) => moveCol(t, c, -1), [r, c - 1]))
  item('열 오른쪽으로 이동', '⌥→', () => re((t) => moveCol(t, c, 1), [r, c + 1]))
  sep()
  item('행 삭제', `${MOD}⇧⌫`, () => re((t) => deleteRow(t, r), [r - 1, c]))
  item('열 삭제', '', () => re((t) => deleteCol(t, c), [r, c - 1]))
  sep()
  item('표 삭제', '', () => removeTable(view, wrap))
  return pop
}

class TableWidget extends WidgetType {
  constructor(readonly src: string) {
    super()
  }
  eq(o: TableWidget) {
    return o.src === this.src
  }
  toDOM(view: EditorView) {
    const wrap = div('cm-table-wrap')
    this.fill(wrap, view)
    wrap.addEventListener('input', (e) => !(e as InputEvent).isComposing && !(e.target as HTMLElement).closest('.cm-pop') && commit(view, wrap))
    wrap.addEventListener('compositionend', () => commit(view, wrap))
    wrap.addEventListener('focusout', () => commit(view, wrap))
    wrap.addEventListener('focusin', (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')
      if (c) (wrap.dataset.fr = c.dataset.r, (wrap.dataset.fc = c.dataset.c), syncAlign(wrap))
    })
    wrap.addEventListener('keydown', (e) => this.onKey(e, view, wrap))
    return wrap
  }
  // 입력 중(포커스가 표 안)에는 DOM을 유지한다. 이미 사용자가 입력한 내용이 화면에 있다.
  updateDOM(dom: HTMLElement, view: EditorView) {
    if (dom.contains(document.activeElement) && !dom.dataset.rebuild) return true
    this.fill(dom, view)
    return true
  }
  ignoreEvent() {
    return true
  }

  fill(wrap: HTMLElement, view: EditorView) {
    const t = parseTable(this.src)
    wrap.dataset.aligns = JSON.stringify(t.aligns)
    wrap.replaceChildren(this.tools(view, wrap), this.grid(t))
    syncAlign(wrap)
  }

  grid(t: Table) {
    const table = document.createElement('table')
    table.className = 'cm-table'
    t.rows.forEach((row, r) => {
      const tr = document.createElement('tr')
      row.forEach((text, c) => {
        const cell = document.createElement(r === 0 ? 'th' : 'td')
        cell.contentEditable = 'plaintext-only'
        cell.textContent = text
        cell.dataset.r = String(r)
        cell.dataset.c = String(c)
        if (t.aligns[c]) cell.style.textAlign = t.aligns[c]!
        tr.append(cell)
      })
      table.append(tr)
    })
    return table
  }

  // 상단 툴바: 크기 조정, (포커스한 열의) 정렬, 더 많은 동작, 표 삭제
  tools(view: EditorView, wrap: HTMLElement) {
    const bar = div('cm-table-tools')
    const cur = () => current(wrap)
    const left = div('cm-tt-left')
    const size = iconBtn('표 크기 조정', ICON.grid, () => openPop(wrap, sizePop(view, wrap, cur()), size))
    // 정렬 아이콘은 하나만 두고 포커스한 열의 상태를 보여 준다. 누르면 그 열에 반영한다.
    const aligns = div('cm-tt-aligns')
    for (const al of ['left', 'center', 'right'] as const) {
      const name = { left: '왼쪽 정렬', center: '가운데 정렬', right: '오른쪽 정렬' }[al]
      const b = iconBtn(name, ICON[al], () => {
        const c = cur()[1]
        const now = readDom(wrap).aligns[c]
        restructure(view, wrap, (x) => setAlign(x, c, now === al ? null : al), cur())
      })
      b.dataset.al = al
      aligns.append(b)
    }
    left.append(size, aligns)
    const right = div('cm-tt-right')
    const more = iconBtn('더 많은 동작', ICON.more, () => openPop(wrap, morePop(view, wrap, cur()), more))
    right.append(more, iconBtn('표 삭제', ICON.trash, () => removeTable(view, wrap)))
    bar.append(left, right)
    return bar
  }

  onKey(e: KeyboardEvent, view: EditorView, wrap: HTMLElement) {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')
    if (!cell || e.isComposing) return
    const r = +cell.dataset.r!, c = +cell.dataset.c!
    const nr = wrap.querySelectorAll('tr').length, nc = wrap.querySelectorAll('tr')[0].children.length
    const mod = e.metaKey || e.ctrlKey
    const re = (op: (t: Table) => Table, f: [number, number]) => (e.preventDefault(), restructure(view, wrap, op, f))
    if (e.key === 'Tab') {
      e.preventDefault()
      const i = r * nc + c + (e.shiftKey ? -1 : 1)
      if (i < 0) return
      if (i >= nr * nc) restructure(view, wrap, (t) => addRow(t, nr - 1), [nr, 0])
      else focusCell(wrap, Math.floor(i / nc), i % nc)
    } else if (e.key === 'Enter' && mod) re((t) => addRow(t, r), [r + 1, c]) // 행 삽입은 Cmd/Ctrl+Enter
    else if (e.key === 'Enter') {
      // 그냥 Enter는 행을 늘리지 않는다: 아래 셀로 이동하고, 마지막 행이면 표 밖(아래)으로 나간다.
      e.preventDefault()
      r + 1 < nr ? focusCell(wrap, r + 1, c) : exit(view, wrap, 1)
    } else if (e.key === 'Backspace' && mod && e.shiftKey) re((t) => deleteRow(t, r), [r - 1, c])
    else if (e.altKey && e.key === 'ArrowUp') re((t) => moveRow(t, r, -1), [r - 1, c])
    else if (e.altKey && e.key === 'ArrowDown') re((t) => moveRow(t, r, 1), [r + 1, c])
    else if (e.altKey && e.key === 'ArrowLeft') re((t) => moveCol(t, c, -1), [r, c - 1])
    else if (e.altKey && e.key === 'ArrowRight') re((t) => moveCol(t, c, 1), [r, c + 1])
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      r > 0 ? focusCell(wrap, r - 1, c) : exit(view, wrap, -1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      r + 1 < nr ? focusCell(wrap, r + 1, c) : exit(view, wrap, 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      exit(view, wrap, 1)
    }
  }
}

function build(state: EditorState): DecorationSet {
  const b = new RangeSetBuilder<Decoration>()
  const tree = ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state)
  for (let n = tree.topNode.firstChild; n; n = n.nextSibling) {
    if (n.name === 'Table') b.add(n.from, n.to, Decoration.replace({ widget: new TableWidget(state.sliceDoc(n.from, n.to)), block: true }))
  }
  return b.finish()
}

export const tables = StateField.define<DecorationSet>({
  create: build,
  update: (v, tr) => (tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState) ? build(tr.state) : v),
  provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))]
})
