import { HighlightStyle, syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view'
import { langIcon, matchLangs, quoteGap } from './commands'
import { mmBracket, mmMeta } from './mermaidLang'
import { FnRef, MathBubble, MathInline } from './inlineWidgets'
import { imageMarkdown as toMarkdownImage } from './imagePath'
import type { SyntaxNode } from '@lezer/common'
import { tags as t } from '@lezer/highlight'

// 코드 블록 안의 구문 색칠. Markdown 자체의 태그(제목, 강조 등)는 건드리지 않고 코드 언어의 태그만 칠한다.
// 색은 CSS 변수(--tok-*)로 두어 라이트/다크를 style.css에서 정한다.
export const codeHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier], color: 'var(--tok-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--tok-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--tok-number)' },
  { tag: [t.lineComment, t.blockComment, t.docComment], color: 'var(--tok-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--tok-function)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--tok-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--tok-property)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--tok-keyword)' },
  { tag: mmMeta, color: 'var(--tok-meta)' },
  { tag: mmBracket, color: 'var(--tok-bracket)' }
])

// 커서가 있는 줄을 제외하고 Markdown 문법 기호를 숨기고, 제목/굵게/기울임 등을 스타일링한다.
// 커서가 있는 줄에서는 기호를 옅은 회색(cm-syntax)으로 보여 준다.
// ponytail: 줄 단위 판정(코드 블록만 블록 단위). 인용/목록 블록 단위 판정은 필요해지면.
const HIDE = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'QuoteMark', 'LinkMark', 'URL', 'StrikethroughMark'])
const hide = Decoration.replace({})
const syntax = Decoration.mark({ class: 'cm-syntax' })
const style = (cls: string) => Decoration.mark({ class: cls })
const MARKS: Record<string, Decoration> = {
  StrongEmphasis: style('cm-strong'),
  Emphasis: style('cm-em'),
  InlineCode: style('cm-code'),
  Strikethrough: style('cm-strike')
}
const linkText = style('cm-link')

// 코드 블록 오른쪽 아래의 언어 표시. 누르면 입력창으로 바뀌어 언어를 바꿀 수 있다 (목록에서 고르거나 직접 입력).
class LangTag extends WidgetType {
  constructor(readonly lang: string, readonly pos: number) {
    super()
  }
  eq(o: LangTag) {
    return o.lang === this.lang && o.pos === this.pos
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span')
    wrap.className = 'cm-langtag'
    const show = () => {
      const b = document.createElement('button')
      b.textContent = this.lang || '언어'
      b.className = this.lang ? '' : 'empty'
      b.addEventListener('mousedown', (e) => (e.preventDefault(), edit()))
      wrap.replaceChildren(b)
    }
    const edit = () => {
      const i = document.createElement('input')
      i.value = this.lang
      i.placeholder = '언어'
      // 목록은 본문에 잘리지 않도록 body에 띄운다.
      const pop = document.createElement('div')
      pop.className = 'cm-langpop'
      let items = matchLangs('')
      let sel = -1
      const draw = () => {
        pop.replaceChildren(
          ...items.map((l, k) => {
            const r = document.createElement('div')
            r.className = k === sel ? 'on' : ''
            r.append(langIcon(l.name), l.name)
            r.addEventListener('mousedown', (e) => (e.preventDefault(), finish(l.id)))
            return r
          })
        )
        pop.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
      }
      const place = () => {
        const r = i.getBoundingClientRect()
        const below = innerHeight - r.bottom > 240
        pop.style.left = `${Math.max(8, r.right - 220)}px`
        pop.style.top = below ? `${r.bottom + 2}px` : ''
        pop.style.bottom = below ? '' : `${innerHeight - r.top + 2}px`
        pop.style.maxHeight = `${Math.min(260, (below ? innerHeight - r.bottom : r.top) - 12)}px`
      }
      let done = false
      const finish = (value?: string) => {
        if (done) return
        done = true
        pop.remove()
        if (value !== undefined) this.apply(view, value)
        show() // 값이 그대로여서 문서가 안 바뀌면 위젯이 다시 그려지지 않으므로 입력창을 직접 닫는다
      }
      i.addEventListener('input', () => ((items = matchLangs(i.value)), (sel = items.length ? 0 : -1), draw()))
      i.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') (e.preventDefault(), !e.isComposing && finish(items[sel]?.id ?? i.value.trim()))
        else if (e.key === 'Escape') (e.preventDefault(), finish())
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          sel = items.length ? (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length : -1
          draw()
        }
      })
      i.addEventListener('blur', () => finish(i.value.trim()))
      wrap.replaceChildren(i)
      document.body.append(pop)
      draw()
      place()
      i.focus()
      i.select()
    }
    show()
    return wrap
  }
  // 여는 펜스의 언어(CodeInfo)를 바꾼다. 없으면 ``` 바로 뒤에 넣는다.
  apply(view: EditorView, value: string) {
    let n: SyntaxNode | null = syntaxTree(view.state).resolve(this.pos, 1)
    while (n && n.name !== 'FencedCode') n = n.parent
    if (!n || value === this.lang) return
    const info = n.getChild('CodeInfo')
    const mark = n.getChild('CodeMark')
    if (info) view.dispatch({ changes: { from: info.from, to: info.to, insert: value } })
    else if (mark) view.dispatch({ changes: { from: mark.to, insert: value } })
    view.focus()
  }
  ignoreEvent() {
    return true
  }
}

// 글머리 기호: 깊이에 따라 ● ○ ■ □ 가 돌아가며 나온다. 글꼴 문자(•)는 작고 글꼴마다 크기가 달라 CSS로 직접 그린다.
class Bullet extends WidgetType {
  constructor(readonly level: number) {
    super()
  }
  eq(o: Bullet) {
    return o.level === this.level
  }
  toDOM() {
    const e = document.createElement('span')
    e.className = 'cm-bullet'
    e.append(Object.assign(document.createElement('i'), { className: `s${this.level}` }))
    return e
  }
}
// 목록: 들여쓰기(실제 공백 문자)는 깊이에 비례하는 고정 폭 칸으로 바꿔 보여 주고, 줄이 길어 넘어가면 항목 글자 위치에 맞춘다(hanging indent).
// 단위는 em. 한 단계 들여쓰기는 1.9em(약 30px).
const INDENT_EM = 1.9
const MARK_EM = { bullet: 1.9, ol: 1.9, task: 1.9 } // 표시 칸 폭 = 한 단계 폭. 항목 글자는 (깊이+1) × 1.9em 위치에서 시작한다

class ImgIcon extends WidgetType {
  toDOM() {
    const e = document.createElement('span')
    e.className = 'cm-img-icon'
    e.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><rect x="1.5" y="2.5" width="11" height="9" rx="1.5"/><circle cx="5" cy="5.6" r="1"/><path d="M2 10.5l3-3 2.2 2.2 1.8-1.8 3 3"/></svg>'
    return e
  }
}

class HBadge extends WidgetType {
  constructor(readonly level: string) {
    super()
  }
  eq(o: HBadge) {
    return o.level === this.level
  }
  toDOM() {
    const e = document.createElement('span')
    e.className = 'cm-hbadge'
    e.textContent = 'h' + this.level
    return e
  }
}

class Spacer extends WidgetType {
  constructor(readonly em: number) {
    super()
  }
  eq(o: Spacer) {
    return o.em === this.em
  }
  toDOM() {
    const e = document.createElement('span')
    e.className = 'cm-spacer'
    e.style.width = `${this.em}em`
    return e
  }
}

class OlMark extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  eq(o: OlMark) {
    return o.text === this.text
  }
  toDOM() {
    const e = document.createElement('span')
    e.className = 'cm-ol'
    e.textContent = this.text
    return e
  }
}

const BULLETS = [0, 1, 2, 3].map((l) => Decoration.replace({ widget: new Bullet(l) }))

class Check extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super()
  }
  eq(o: Check) {
    return o.checked === this.checked && o.pos === this.pos
  }
  toDOM(view: EditorView) {
    const i = document.createElement('input')
    i.type = 'checkbox'
    i.className = 'cm-check'
    i.tabIndex = -1 // Tab 키로 포커스가 체크박스로 넘어가지 않게 한다
    i.checked = this.checked
    i.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const p = this.pos + 1 // "[ ]" 가운데 글자
      view.dispatch({ changes: { from: p, to: p + 1, insert: this.checked ? ' ' : 'x' } })
    })
    return i
  }
}

class Rule extends WidgetType {
  toDOM() {
    const e = document.createElement('span')
    e.className = 'cm-hr'
    return e
  }
}
const rule = Decoration.replace({ widget: new Rule() })

// 상대 경로 이미지를 해석할 기준 폴더(현재 문서가 있는 폴더). 문서가 저장되기 전에는 없다.
// ponytail: 문서 경로가 바뀌어도 다음 편집/선택 때 다시 그린다 (즉시 갱신은 필요해지면).
let baseDir: string | null = null
export const setBaseDir = (path: string | null) => {
  baseDir = path ? path.replace(/\\/g, '/').replace(/\/[^/]*$/, '') : null
}

// 로컬 파일은 main의 읽기 전용 프로토콜(nib-file)로, 원격 이미지는 그대로 로드한다.
function imageUrl(raw: string): string | null {
  // `<경로 공백>` 형태(꺾쇠로 감싼 주소)도 허용한다.
  const s = raw.trim().replace(/^<(.*)>$/, '$1').replace(/ /g, '%20')
  if (/^(https?:|data:)/i.test(s)) return s
  let abs: string
  if (/^([A-Za-z]:)?[\\/]/.test(s)) abs = new URL(s.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '/$1'), 'file:///').pathname
  else if (baseDir) abs = new URL(s, 'file://' + (baseDir.startsWith('/') ? '' : '/') + baseDir + '/').pathname
  else return null
  return 'nib-file://local' + abs
}

// alt 끝의 `|300`을 이미지 너비(px)로 쓴다 (Obsidian 방식). 다른 에디터에서도 문법이 깨지지 않는다.
class Img extends WidgetType {
  // below: 커서가 이미지 줄에 있어 원문이 보일 때, 그 아래에 덧붙여 보여 주는 미리보기
  constructor(readonly src: string | null, readonly raw: string, readonly pos: number, readonly below = false) {
    super()
  }
  eq(o: Img) {
    return o.src === this.src && o.raw === this.raw && o.pos === this.pos && o.below === this.below
  }
  toDOM(view: EditorView) {
    const m = /^(.*)\|(\d+)$/.exec(this.raw)
    const alt = m ? m[1] : this.raw
    const broken = () => {
      const e = document.createElement('span')
      e.className = 'cm-img-broken'
      e.textContent = `🖼 ${alt || '이미지를 불러올 수 없음'}`
      return e
    }
    const box = document.createElement('span')
    box.className = 'cm-img-box' + (this.below ? ' below' : '')
    if (!this.src) box.append(broken())
    else {
      const i = document.createElement('img')
      i.className = 'cm-img'
      i.alt = alt
      i.src = this.src
      if (m) (i.style.width = `${m[2]}px`, i.classList.add('sized'))
      i.onerror = () => box.replaceChildren(broken())
      box.append(i)
      // 모서리를 끌어 너비를 바꾼다. 놓을 때 문서(alt)에 반영한다. 왼쪽 모서리는 방향이 반대다.
      for (const side of ['tl', 'tr', 'bl', 'br']) {
        const h = document.createElement('span')
        h.className = `cm-img-h ${side}`
        h.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
          const x0 = e.clientX, w0 = i.getBoundingClientRect().width
          const dir = side.endsWith('l') ? -1 : 1
          let w = w0
          i.classList.add('sized')
          const move = (ev: MouseEvent) => {
            w = Math.max(40, Math.round(w0 + dir * (ev.clientX - x0)))
            i.style.width = `${w}px`
          }
          const up = () => {
            document.removeEventListener('mousemove', move)
            document.removeEventListener('mouseup', up)
            const from = this.pos + 2 // `![` 다음이 alt
            if (view.state.sliceDoc(from, from + this.raw.length) !== this.raw) return
            view.dispatch({ changes: { from, to: from + this.raw.length, insert: `${alt}|${w}` }, userEvent: 'input.image' })
          }
          document.addEventListener('mousemove', move)
          document.addEventListener('mouseup', up)
        })
        box.append(h)
      }
    }
    // 클릭하면 그 줄로 커서를 옮겨 원문을 편집할 수 있게 한다.
    box.addEventListener('mousedown', (e) => {
      e.preventDefault()
      if (this.below) return // 이미 이 줄을 편집 중
      view.dispatch({ selection: { anchor: this.pos } })
      view.focus()
    })
    return box
  }
  ignoreEvent() {
    return true
  }
}

// n 바로 뒤에 공백이 하나 있으면 그 끝, 아니면 n (같은 줄 안에서만).
const spaceEnd = (doc: EditorView['state']['doc'], n: number) => (doc.sliceString(n, n + 1) === ' ' ? n + 1 : n)

const listDepth = (n: SyntaxNode) => {
  let d = 0
  for (let p = n.parent; p; p = p.parent) if (p.name === 'BulletList' || p.name === 'OrderedList') d++
  return Math.max(0, d - 1)
}

// 항목 안에서 마커가 없는 줄(이어지는 글줄)과 공백만 남은 줄: 앞쪽 공백(실제 글자)을 항목 글자 위치와 같은 폭의 칸으로 바꿔 보여 준다.
// 빈 항목에서 Backspace로 글머리만 지웠을 때 커서가 그 자리에 그대로 남고, 이어서 글자를 쳐도 위치가 튀지 않게 한다.
function listContinuations(
  view: EditorView,
  items: { from: number; to: number; deco: Decoration }[],
  atomic: { from: number; to: number; deco: Decoration }[],
  listLines: Set<number>,
  spans: { first: number; last: number; depth: number }[],
  skip: [number, number][]
) {
  const { doc } = view.state
  const depthAt = new Map<number, number>() // 줄 → 그 줄을 가장 안쪽에서 포함하는 항목의 깊이
  for (const sp of spans.sort((a, b) => a.depth - b.depth)) for (let l = sp.first; l <= sp.last; l++) depthAt.set(l, sp.depth)
  const done = new Set<number>(listLines)
  for (const { from, to } of view.visibleRanges) {
    for (let l = doc.lineAt(from).number; l <= doc.lineAt(to).number; l++) {
      const ln = doc.line(l)
      if (done.has(l) || skip.some(([a, z]) => ln.from >= a && ln.from < z)) continue
      const lead = /^[ \t]+/.exec(ln.text)
      if (!lead) continue
      const blank = lead[0].length === ln.text.length
      let depth: number
      if (!blank && depthAt.has(l)) depth = depthAt.get(l)! // 항목에 이어지는 글줄
      else if (blank && l > 1 && done.has(l - 1)) depth = Math.floor(lead[0].replace(/\t/g, '    ').length / 4) // 목록 바로 아래의 공백만 남은 줄
      else continue
      const em = (depth + 1) * INDENT_EM
      const sp = Decoration.replace({ widget: new Spacer(em) })
      items.push({ from: ln.from, to: ln.from + lead[0].length, deco: sp })
      atomic.push({ from: ln.from, to: ln.from + lead[0].length, deco: sp })
      if (!blank) items.push({ from: ln.from, to: ln.from, deco: Decoration.line({ attributes: { style: `padding-left:calc(${em}em + 6px);text-indent:-${em}em` } }) })
      done.add(l)
    }
  }
}

// 내용이 아직 없는 목록 항목(`- `, `1. `)은 Markdown 규칙상 목록으로 해석되지 않고 글자로 남는다(빈 항목은 문단 중간에 끼어들 수 없음).
// 입력하는 즉시 목록 표시로 바뀌어 보이도록 같은 모양으로 그려 준다. 들여쓰기 4칸을 한 단계로 본다.
const EMPTY_LI = /^([ \t]*)([-*+]|\d+[.)])[ \t]+$/
function emptyListItems(
  view: EditorView,
  listItem: (ln: { from: number; number: number }, markFrom: number, markTo: number, depth: number, kind: keyof typeof MARK_EM, mark: Decoration) => void,
  listLines: Set<number>,
  skip: [number, number][]
) {
  const { doc } = view.state
  for (const { from, to } of view.visibleRanges) {
    for (let l = doc.lineAt(from).number; l <= doc.lineAt(to).number; l++) {
      const ln = doc.line(l)
      const m = EMPTY_LI.exec(ln.text)
      if (!m || listLines.has(l) || skip.some(([a, z]) => ln.from >= a && ln.from < z)) continue
      const depth = Math.floor(m[1].replace(/\t/g, '    ').length / 4)
      const ordered = /\d/.test(m[2])
      const mark = ordered ? Decoration.replace({ widget: new OlMark(m[2]) }) : BULLETS[depth % 4]
      listItem(ln, ln.from + m[1].length, ln.to, depth, ordered ? 'ol' : 'bullet', mark)
    }
  }
}

// 확장 인라인 서식: 밑줄 <u>..</u>, 하이라이트 ==..==, 위첨자 ^..^, 아래첨자 ~..~ (공백 없는 짧은 글자만 첨자로 본다).
// 커서가 있는 줄에서는 기호를 옅은 회색으로 보여 주고, 아니면 숨긴다.
const EXTRAS: { re: RegExp; open: number; close: number; cls: string }[] = [
  { re: /<u>([^<\n]+)<\/u>/g, open: 3, close: 4, cls: 'cm-u' },
  { re: /==(?=\S)([^=\n]+?)(?<=\S)==/g, open: 2, close: 2, cls: 'cm-hl' },
  { re: /(?<![[\\^])\^([^\s^[\]]+)\^/g, open: 1, close: 1, cls: 'cm-sup' },
  { re: /(?<![~\\])~(?!~)([^\s~]+)~(?!~)/g, open: 1, close: 1, cls: 'cm-sub' }
]
function inlineExtras(view: EditorView, items: { from: number; to: number; deco: Decoration }[], touch: (a: number, z: number) => boolean, skip: [number, number][]) {
  const { doc } = view.state
  const inSkip = (p: number) => skip.some(([a, z]) => p >= a && p < z)
  for (const { from, to } of view.visibleRanges) {
    for (let l = doc.lineAt(from).number; l <= doc.lineAt(to).number; l++) {
      const ln = doc.line(l)
      if (!/[<=^~]/.test(ln.text) || inSkip(ln.from)) continue
      for (const x of EXTRAS) {
        for (const m of ln.text.matchAll(x.re)) {
          const a = ln.from + m.index!, z = a + m[0].length
          if (inSkip(a)) continue
          items.push({ from: a + x.open, to: z - x.close, deco: Decoration.mark({ class: x.cls }) })
          const mk = (f: number, t: number) => items.push({ from: f, to: t, deco: touch(a, z) ? Decoration.mark({ class: 'cm-syntax' }) : hide })
          mk(a, a + x.open)
          mk(z - x.close, z)
        }
      }
    }
  }
}

// 수식 원문(블록 수식, 커서가 안에 있는 인라인 수식)의 LaTeX 색칠: 명령(\frac), 중괄호, 환경 이름, 주석.
const TEX = /\\[A-Za-z]+|\\[^A-Za-z]|%[^\n]*|[{}]|&/g
const TEX_ENV = /(?<=\\(?:begin|end)\{)[A-Za-z*]+(?=\})/g
function texMarks(items: { from: number; to: number; deco: Decoration }[], text: string, at: number) {
  const mark = (cls: string, f: number, t: number) => items.push({ from: at + f, to: at + t, deco: Decoration.mark({ class: cls }) })
  for (const m of text.matchAll(TEX)) {
    const t = m[0]
    mark(t[0] === '\\' && /[A-Za-z]/.test(t[1] ?? '') ? 'cm-tex-cmd' : t[0] === '%' ? 'cm-tex-comment' : t === '{' || t === '}' ? 'cm-tex-brace' : 'cm-tex-op', m.index!, m.index! + t.length)
  }
  for (const m of text.matchAll(TEX_ENV)) mark('cm-tex-env', m.index!, m.index! + m[0].length)
}
function texBlocks(view: EditorView, items: { from: number; to: number; deco: Decoration }[]) {
  const { doc, selection } = view.state
  const tree = syntaxTree(view.state)
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from, to,
      enter: (n) => {
        if (n.name === 'BlockMath') {
          const first = doc.lineAt(n.from), last = doc.lineAt(n.to)
          for (let l = first.number + 1; l < last.number; l++) texMarks(items, doc.line(l).text, doc.line(l).from)
          return false
        }
        if (n.name === 'InlineMath' && selection.ranges.some((r) => r.from < n.to && r.to > n.from)) {
          const raw = doc.sliceString(n.from, n.to)
          const d = raw.startsWith('$$') ? 2 : 1
          texMarks(items, raw.slice(d, raw.length - d), n.from + d)
        }
      }
    })
  }
}

// 각주: 참조 [^id]는 위첨자로(커서가 있는 줄에서는 원문), 정의 줄 `[^id]: 내용`은 작은 글씨로 보여 준다.
// ponytail: 정의는 한 줄짜리만 다룬다(여러 줄 정의는 첫 줄만 말풍선에 표시).
const FN_REF = /\[\^([^\]\s]+)\]/g
const FN_DEF = /^\[\^([^\]\s]+)\]:[ \t]*/
function footnotes(view: EditorView, items: { from: number; to: number; deco: Decoration }[], touch: (a: number, z: number) => boolean, skip: [number, number][]) {
  const { doc } = view.state
  let defs: Map<string, string> | null = null
  const defsOf = () => {
    if (defs) return defs
    defs = new Map()
    for (const ln of doc.iterLines()) {
      const m = ln.startsWith('[^') ? FN_DEF.exec(ln) : null
      if (m && !defs.has(m[1])) defs.set(m[1], ln.slice(m[0].length))
    }
    return defs
  }
  const inSkip = (p: number) => skip.some(([a, z]) => p >= a && p < z)
  for (const { from, to } of view.visibleRanges) {
    for (let l = doc.lineAt(from).number; l <= doc.lineAt(to).number; l++) {
      const ln = doc.line(l)
      if (!ln.text.includes('[^') || inSkip(ln.from)) continue
      const def = FN_DEF.exec(ln.text)
      if (def) {
        items.push({ from: ln.from, to: ln.from, deco: Decoration.line({ class: 'cm-fndef' }) })
        items.push({ from: ln.from, to: ln.from + def[0].length, deco: Decoration.mark({ class: 'cm-syntax' }) })
        continue
      }
      for (const m of ln.text.matchAll(FN_REF)) {
        const at = ln.from + m.index!
        if (inSkip(at)) continue
        if (touch(at, at + m[0].length)) items.push({ from: at, to: at + m[0].length, deco: Decoration.mark({ class: 'cm-syntax' }) })
        else items.push({ from: at, to: at + m[0].length, deco: Decoration.replace({ widget: new FnRef(m[1], defsOf().get(m[1]) ?? null) }) })
      }
    }
  }
}

function build(view: EditorView): { deco: DecorationSet; atomic: DecorationSet } {
  const b = new RangeSetBuilder<Decoration>()
  const { doc, selection } = view.state
  const active = new Set<number>()
  for (const r of selection.ranges) {
    for (let l = doc.lineAt(r.from).number; l <= doc.lineAt(r.to).number; l++) active.add(l)
  }
  const items: { from: number; to: number; deco: Decoration }[] = []
  // 숨겨진 제목/인용 기호: 커서가 그 안에 멈추지 않고 건너뛰게 한다.
  const atomic: { from: number; to: number; deco: Decoration }[] = []
  const quoteLines = new Set<number>()
  const skip: [number, number][] = [] // 코드·수식 구간: 각주 `[^1]` 검색에서 제외
  // 서식 기호는 커서가 그 요소의 **안쪽**에 있는 동안에만 보인다 (줄 단위가 아니라 요소 단위).
  // 요소의 맨 앞/맨 뒤는 안쪽으로 치지 않는다: 닫는 기호를 치는 순간 바로 서식이 적용되고 기호는 숨는다.
  // (끝에서 기호를 보여 주면, 뒤이어 한글을 조합할 때 CodeMirror가 조합 중인 글자 옆을 다시 그리지 않아 기호가 남는다.)
  const touch = (a: number, z: number) => view.state.selection.ranges.some((r) => r.from < z && r.to > a)
  // 문법이 확정되어야 서식을 적용한다: 제목은 `#` 뒤에 공백이 와야 하고, 인용은 `>` 한 글자만 있는 줄이 아니어야 한다.
  const headingOk = (h: SyntaxNode) => {
    const mk = h.firstChild
    return !!mk && mk.name === 'HeaderMark' && /[ \t]/.test(doc.sliceString(mk.to, mk.to + 1))
  }
  const bareQuote = (text: string) => /^[ \t>]*$/.test(text) && text.endsWith('>')
  const listLines = new Set<number>()
  const itemSpans: { first: number; last: number; depth: number }[] = [] // 목록 항목이 차지하는 줄 범위(깊이 포함)
  // 목록 줄 하나를 그린다: 들여쓰기 칸 + 표시(•, ◦, ▪, 번호, 체크박스 자리) + 줄 간격 + 줄 넘김 시 항목 글자에 맞춘 들여쓰기.
  const listItem = (ln: { from: number; number: number }, markFrom: number, markTo: number, depth: number, kind: keyof typeof MARK_EM, mark: Decoration) => {
    const plain = /^[ \t]*$/.test(doc.sliceString(ln.from, markFrom)) // 같은 줄 앞에 인용(>) 등이 없을 때만 들여쓰기를 바꾼다
    const indent = plain ? depth * INDENT_EM : 0
    if (plain && markFrom > ln.from) {
      const sp = Decoration.replace({ widget: new Spacer(indent) })
      items.push({ from: ln.from, to: markFrom, deco: sp })
      atomic.push({ from: ln.from, to: markFrom, deco: sp })
    }
    items.push({ from: markFrom, to: markTo, deco: mark })
    atomic.push({ from: markFrom, to: markTo, deco: mark })
    if (!listLines.has(ln.number)) {
      listLines.add(ln.number)
      const P = indent + MARK_EM[kind]
      items.push({ from: ln.from, to: ln.from, deco: Decoration.line({ class: 'cm-li', attributes: plain ? { style: `padding-left:calc(${P}em + 6px);text-indent:-${P}em` } : {} }) })
    }
  }
  const lineDeco = (pos: number, cls: string) => {
    const f = doc.lineAt(pos).from
    items.push({ from: f, to: f, deco: Decoration.line({ class: cls }) })
  }
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (n) => {
        const on = active.has(doc.lineAt(n.from).number)
        if (n.name === 'InlineCode') skip.push([n.from, n.to])
        if (n.name === 'ListItem') itemSpans.push({ first: doc.lineAt(n.from).number, last: doc.lineAt(n.to).number, depth: listDepth(n.node) })
        if (n.name === 'FencedCode') {
          // 닫는 펜스까지 있는 완성된 블록은 커서가 안에 있어도 펜스(```)를 숨기고 박스 안의 내용만 보여 준다.
          // 닫는 펜스가 없는(입력 중인) 블록은 원문 그대로 둔다.
          skip.push([n.from, n.to])
          const first = doc.lineAt(n.from), last = doc.lineAt(n.to)
          const closed = n.node.getChildren('CodeMark').length >= 2
          const lastBody = closed ? last.number - 1 : last.number // 박스의 마지막 줄
          const info = n.node.getChild('CodeInfo')
          const lang = info ? doc.sliceString(info.from, info.to).trim() : ''
          const hideLine = (ln: { from: number; to: number }) => {
            if (ln.to > ln.from) (items.push({ from: ln.from, to: ln.to, deco: hide }), atomic.push({ from: ln.from, to: ln.to, deco: hide }))
          }
          // 막 만든 빈 블록의 여는 줄에 커서가 있으면(언어 입력 중) 여는 줄만 한 줄짜리 박스로 보이고, 빈 본문 줄은 숨긴다.
          // 엔터로 본문에 들어가면 여는 줄이 숨고 본문 줄이 같은 높이로 나타나 박스 크기가 변하지 않는다.
          const typingLang = closed && last.number - first.number === 2 && doc.line(first.number + 1).length === 0 && view.state.selection.ranges.some((r) => doc.lineAt(r.head).number === first.number)
          for (let l = first.number; l <= last.number; l++) {
            const ln = doc.line(l)
            if (typingLang && l === first.number + 1) {
              lineDeco(ln.from, 'cm-cb-hidden')
              continue
            }
            if (closed && l === last.number) {
              // 닫는 펜스 줄은 박스 밖의 얇은 줄이 되고 그 오른쪽에 언어 태그를 둔다.
              lineDeco(ln.from, 'cm-codefoot')
              hideLine(ln)
              // 언어 표시는 커서가 이 코드 블록 안에 있을 때만 보인다.
              if (view.state.selection.ranges.some((r) => r.from <= last.to && r.to >= first.from)) items.push({ from: ln.to, to: ln.to, deco: Decoration.widget({ widget: new LangTag(lang, n.from), side: 1 }) })
              continue
            }
            const fenceOff = closed && l === first.number && !typingLang
            const isLast = typingLang ? l === first.number : l === lastBody
            lineDeco(ln.from, 'cm-codeblock' + (l === first.number ? ' cm-cb-first' : '') + (isLast ? ' cm-cb-last' + (closed ? ' cm-cb-pad' : '') : '') + (fenceOff ? ' cm-fence-off' : ''))
            if (fenceOff) hideLine(ln)
          }
          return false
        }
        if (n.name === 'InlineMath') {
          // 커서가 수식 안에 있으면 원문 + 입력 중 미리보기, 아니면 렌더된 수식만 보여 준다 (줄이 아니라 수식 단위로 판정).
          skip.push([n.from, n.to])
          const raw = doc.sliceString(n.from, n.to)
          const display = raw.startsWith('$$')
          const body = raw.slice(display ? 2 : 1, raw.length - (display ? 2 : 1))
          if (!touch(n.from, n.to)) {
            items.push({ from: n.from, to: n.to, deco: Decoration.replace({ widget: new MathInline(body, display) }) })
          } else {
            items.push({ from: n.from, to: n.to, deco: Decoration.mark({ class: 'cm-math-src' }) })
            items.push({ from: n.to, to: n.to, deco: Decoration.widget({ widget: new MathBubble(body, display), side: 1 }) })
          }
          return false
        }
        if (n.name === 'BlockMath') {
          // 수식 블록: 편집 중(또는 닫히지 않은) 상태의 원문을 코드 블록처럼 상자로 보여 준다. 렌더 결과는 richBlocks가 담당.
          skip.push([n.from, n.to])
          const first = doc.lineAt(n.from), last = doc.lineAt(n.to)
          for (let l = first.number; l <= last.number; l++) {
            lineDeco(doc.line(l).from, 'cm-codeblock' + (l === first.number ? ' cm-cb-first' : '') + (l === last.number ? ' cm-cb-last' : ''))
          }
          return false
        }
        // 각주(`[^1]`, `[^1]: ...`)는 아래 각주 처리에서 다루므로 링크로는 보지 않는다.
        if ((n.name === 'Link' || n.name === 'LinkReference') && doc.sliceString(n.from, n.from + 2) === '[^') return false
        const h = /^ATXHeading(\d)$/.exec(n.name)
        if (h) {
          if (headingOk(n.node)) {
            lineDeco(n.from, `cm-h cm-h${h[1]}`)
            // 편집 중이면 왼쪽에 h2 같은 레벨 배지. 줄의 ::before로 그리면 기호가 숨은 빈 제목에서 한글 조합 첫 글자가 화면에서 사라져 위젯으로 둔다.
            if (on) items.push({ from: n.from, to: n.from, deco: Decoration.widget({ widget: new HBadge(h[1]), side: -1 }) })
          }
        }
        else if (n.name === 'Blockquote') {
          // 인용 블록의 모든 줄에 막대와 배경을 입힌다 (중첩되어도 한 번만).
          // 바깥 인용의 첫/끝 줄은 위아래 여백을 더 준다.
          // 엔터로 나눈 줄은 문단처럼 간격을 두고, 자동 줄바꿈(한 줄이 길어서 접힌 것)은 붙여 보인다. 목록·제목·코드 줄은 제외.
          const special = (t: string) => /^[>\s]*([-*+]|\d+[.)])\s|^[>\s]*(#|```|\|)/.test(t)
          const filled = (t: string) => /^[>\s]*[^>\s]/.test(t) && !special(t)
          // 글자를 쓰기 전의 `> `(기호 뒤 공백만 있는 줄)도 같은 모양으로 그려, 첫 글자를 칠 때 줄이 움직이지 않게 한다.
          const typing = (t: string) => filled(t) || (/^[>\s]*>[ \t]+$/.test(t) && !special(t))
          let nested = false
          for (let p = n.node.parent; p; p = p.parent) if (p.name === 'Blockquote') nested = true
          // 문법상 인용에 이어 붙은 줄(> 없이 아랫줄에 바로 쓴 글)은 인용 상자에서 뺀다.
          const a = doc.lineAt(n.from).number
          let z = doc.lineAt(n.to).number
          while (z > a && !/^\s{0,3}>/.test(doc.line(z).text)) z--
          if (!nested && quoteGap(doc, z + 1)) lineDeco(doc.line(z + 1).from, 'cm-quote-gap')
          for (let l = a; l <= z; l++) {
            if (!quoteLines.has(l) && (l > a || !bareQuote(doc.line(l).text))) (quoteLines.add(l), lineDeco(doc.line(l).from, 'cm-quote' + (nested ? '' : (l === a ? ' cm-q-first' : '') + (l === z ? ' cm-q-last' : '')) + (l > a && typing(doc.line(l).text) && filled(doc.line(l - 1).text) ? ' cm-q-next' : '')))
          }
        }
        else if (n.name === 'HorizontalRule' && !on) items.push({ from: n.from, to: n.to, deco: rule })
        else if (n.name === 'Image') {
          const url = n.node.getChild('URL')
          const m = n.node.getChildren('LinkMark')
          if (url && m.length >= 2) {
            const raw = doc.sliceString(m[0].to, m[1].from)
            const src = imageUrl(doc.sliceString(url.from, url.to))
            if (!touch(n.from, n.to)) {
              // 이미지 하나만 있는 줄은 가운데 정렬한다.
              if (doc.lineAt(n.from).text.trim() === doc.sliceString(n.from, n.to)) lineDeco(n.from, 'cm-img-only')
              items.push({ from: n.from, to: n.to, deco: Decoration.replace({ widget: new Img(src, raw, n.from) }) })
              return false
            }
            // 편집 중에는 원문을 고정폭 글꼴로 보여 주고 앞에 이미지 아이콘을 둔다. 줄 아래에는 이미지를 계속 보여 준다.
            items.push({ from: n.from, to: n.to, deco: Decoration.mark({ class: 'cm-img-src' }) })
            items.push({ from: n.from, to: n.from, deco: Decoration.widget({ widget: new ImgIcon(), side: -1 }) })
            items.push({ from: n.to, to: n.to, deco: Decoration.widget({ widget: new Img(src, raw, n.from, true), side: 1 }) })
          }
        } else if (n.name === 'Link') {
          const m = n.node.getChildren('LinkMark')
          if (m.length >= 2) items.push({ from: m[0].to, to: m[1].from, deco: linkText })
        } else if (MARKS[n.name]) items.push({ from: n.from, to: n.to, deco: MARKS[n.name] })
        else if (n.name === 'TaskMarker') {
          // 체크박스/글머리 기호 줄은 커서가 있어도 `- [ ]`, `-` 원문을 보여 주지 않는다 (뒤따르는 공백까지 한 덩어리).
          // 지우는 방법은 내용 맨 앞에서 Backspace (commands.ts).
          const end = spaceEnd(doc, n.to)
          const d = Decoration.replace({ widget: new Check(/\[[xX]\]/.test(doc.sliceString(n.from, n.to)), n.from) })
          items.push({ from: n.from, to: end, deco: d })
          atomic.push({ from: n.from, to: end, deco: d })
        } else if (n.name === 'ListMark') {
          // 기호만 있는 줄(`*`, `-`, `1.`)은 공백이 입력되어야 목록으로 확정한다 (제목의 `#`과 같은 규칙).
          const after = doc.sliceString(n.to, n.to + 1)
          if (after !== ' ' && after !== '\t') return
          const bullet = n.node.parent?.parent?.name === 'BulletList'
          const kind = n.node.nextSibling?.name === 'Task' ? 'task' : bullet ? 'bullet' : 'ol'
          const depth = listDepth(n.node)
          const mark = kind === 'task' ? hide : kind === 'bullet' ? BULLETS[depth % 4] : Decoration.replace({ widget: new OlMark(doc.sliceString(n.from, n.to)) })
          listItem(doc.lineAt(n.from), n.from, spaceEnd(doc, n.to), depth, kind, mark)
        } else if ((n.name === 'HeaderMark' && n.node.parent?.name.startsWith('ATXHeading')) || n.name === 'QuoteMark') {
          // 제목/인용 기호는 편집 중에도 숨긴다. 제목 레벨은 배지로, 해제는 Backspace/단축키로.
          const ln = doc.lineAt(n.from)
          const confirmed = n.name === 'QuoteMark' ? !bareQuote(ln.text) || ln.number > doc.lineAt(n.node.parent!.from).number : headingOk(n.node.parent!)
          const end = Math.min(n.to + (doc.sliceString(n.to, n.to + 1) === ' ' ? 1 : 0), ln.to)
          if (confirmed && end > n.from) (items.push({ from: n.from, to: end, deco: hide }), atomic.push({ from: n.from, to: end, deco: hide }))
        } else if (HIDE.has(n.name)) {
          // URL은 링크/이미지 안의 것만 대상 (본문에 그냥 적힌 URL은 그대로 둔다).
          if (n.name === 'URL' && n.node.parent?.name !== 'Link' && n.node.parent?.name !== 'Image') return
          // 문단 아랫줄의 `-`/`=`(Setext 제목 밑줄)는 숨기지 않는다: `- `로 목록을 쓰기 시작한 줄이 이렇게 해석된다.
          if (n.name === 'HeaderMark') return
          const el = n.node.parent
          if (el ? touch(el.from, el.to) : on) items.push({ from: n.from, to: n.to, deco: syntax })
          else {
            // 제목 기호는 뒤따르는 공백까지 숨긴다.
            const end = n.name === 'HeaderMark' ? Math.min(n.to + 1, doc.lineAt(n.from).to) : n.to
            if (end > n.from) items.push({ from: n.from, to: end, deco: hide })
          }
        }
      }
    })
  }
  emptyListItems(view, listItem, listLines, skip)
  listContinuations(view, items, atomic, listLines, itemSpans, skip)
  footnotes(view, items, touch, skip)
  inlineExtras(view, items, touch, skip)
  texBlocks(view, items)
  items.sort((a, c) => a.from - c.from || a.deco.startSide - c.deco.startSide)
  for (const i of items) b.add(i.from, i.to, i.deco)
  const ab = new RangeSetBuilder<Decoration>()
  atomic.sort((a, c) => a.from - c.from)
  for (const i of atomic) ab.add(i.from, i.to, i.deco)
  return { deco: b.finish(), atomic: ab.finish() }
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    atomic: DecorationSet
    constructor(view: EditorView) {
      ;({ deco: this.decorations, atomic: this.atomic } = build(view))
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) ({ deco: this.decorations, atomic: this.atomic } = build(u.view))
    }
  },
  { decorations: (v) => v.decorations, provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.atomic ?? Decoration.none) }
)

const IMAGE_FILE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i

// 파일 경로를 Markdown 이미지로 (변환 규칙은 imagePath.ts).
// ponytail: 원본 파일을 참조만 한다(복사 안 함). assets 폴더로 복사하는 정책은 필요해지면.
export const imageMarkdown = (absPath: string) => toMarkdownImage(absPath, baseDir)

// 이미지 파일을 끌어다 놓으면 놓은 위치에 삽입한다. 그 외 파일은 무시한다(창이 그 파일로 이동하는 기본 동작도 막는다).
export const imageDrop = EditorView.domEventHandlers({
  dragover: (e) => (e.dataTransfer?.types.includes('Files') ? (e.preventDefault(), true) : false),
  drop(e, view) {
    const files = [...(e.dataTransfer?.files ?? [])]
    if (!files.length) return false
    e.preventDefault()
    const text = files
      .map((f) => window.api.pathForFile(f))
      .filter((p) => IMAGE_FILE.test(p))
      .map(imageMarkdown)
      .join('\n\n')
    if (!text) return true
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head
    // 이미지는 자기 줄에 두고 커서를 다음 줄로 옮긴다 (커서가 있는 줄은 원문으로 보이므로).
    const eol = view.state.lineBreak
    const ins = (pos > view.state.doc.lineAt(pos).from ? eol : '') + text + eol
    view.dispatch({ changes: { from: pos, insert: ins }, selection: { anchor: pos + ins.length }, userEvent: 'input.drop' })
    view.focus()
    return true
  }
})

// Cmd/Ctrl+클릭으로 링크를 연다. 일반 클릭은 커서 이동(편집).
export const linkClick = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!(e.metaKey || e.ctrlKey)) return false
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
    if (pos == null) return false
    let n: SyntaxNode | null = syntaxTree(view.state).resolve(pos, 1)
    while (n && n.name !== 'Link') n = n.parent
    const url = n?.getChild('URL')
    if (!url) return false
    const raw = view.state.sliceDoc(url.from, url.to).trim()
    // 스킴이 없으면(naver.com) https를 붙인다. 허용 스킴 검사는 main에서 한다.
    window.api.openExternal(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
    e.preventDefault()
    return true
  }
})
