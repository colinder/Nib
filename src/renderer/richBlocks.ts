import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { EditorState, RangeSetBuilder, StateField } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { renderMath, renderMermaid } from './mathRender'

// 블록 수식($$ ... $$)과 ```mermaid 블록.
// 커서가 블록 밖에 있으면 결과 그림으로 바꿔 보여 주고, 커서가 안에 있으면 원문을 그대로 두고 그 아래에 미리보기를 붙인다.
// ponytail: 최상위 블록만 다룬다 (목록/인용 안의 수식·다이어그램은 원문 그대로).

type Kind = 'math' | 'mermaid'

// Mermaid가 그림 둘레에 넣는 빈 공간을 걷어내 내용 크기에 맞춘다 (위아래 여백이 커 보이지 않게).
function fitSvg(svg: SVGSVGElement | null) {
  if (!svg) return
  try {
    const b = svg.getBBox()
    if (!b.width || !b.height) return
    const pad = 14
    svg.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`)
    svg.style.maxWidth = `${Math.ceil(b.width + pad * 2)}px`
  } catch {
    /* 크기를 잴 수 없으면(화면에 아직 안 붙은 경우 등) 원본 그대로 둔다 */
  }
}

class RichBlock extends WidgetType {
  constructor(readonly kind: Kind, readonly src: string, readonly pos: number, readonly preview: boolean) {
    super()
  }
  eq(o: RichBlock) {
    return o.kind === this.kind && o.src === this.src && o.pos === this.pos && o.preview === this.preview
  }
  toDOM(view: EditorView) {
    // 루트에는 margin을 두지 않는다(CodeMirror가 블록 위젯 높이를 margin 없이 재므로). 여백은 padding으로만 준다.
    const el = document.createElement('div')
    el.className = `cm-rich cm-rich-${this.kind}` + (this.preview ? ' preview' : '')
    const body = document.createElement('div')
    body.className = 'cm-rich-body'
    el.append(body)
    if (!this.src.trim()) {
      body.textContent = this.kind === 'math' ? '빈 수식' : '빈 다이어그램'
      el.classList.add('empty')
    } else if (this.kind === 'math') {
      const err = renderMath(body, this.src, true)
      if (err) body.append(Object.assign(document.createElement('div'), { className: 'cm-rich-error', textContent: err }))
    } else {
      body.textContent = '다이어그램을 그리는 중…'
      el.classList.add('empty')
      renderMermaid(this.src).then((r) => {
        el.classList.remove('empty')
        if (!('svg' in r)) return void (el.classList.add('error'), (body.textContent = r.error))
        body.innerHTML = r.svg
        fitSvg(body.querySelector('svg'))
      })
    }
    // 결과 그림을 누르면 블록 안으로 들어가 원문을 편집한다.
    if (!this.preview) {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault()
        const line = view.state.doc.lineAt(this.pos)
        view.dispatch({ selection: { anchor: view.state.doc.line(line.number + 1).from } })
        view.focus()
      })
    }
    return el
  }
  ignoreEvent() {
    return true
  }
}

function build(state: EditorState): DecorationSet {
  const b = new RangeSetBuilder<Decoration>()
  const { doc } = state
  const tree = ensureSyntaxTree(state, doc.length, 50) ?? syntaxTree(state)
  const gaps = new Set<number>()
  for (let n = tree.topNode.firstChild; n; n = n.nextSibling) {
    let kind: Kind
    let src: string
    if (n.name === 'BlockMath') {
      const first = doc.lineAt(n.from), last = doc.lineAt(n.to)
      // 닫는 $$가 없는(입력 중인) 블록은 그대로 둔다.
      if (last.number - first.number < 1 || last.text.trim() !== '$$') continue
      kind = 'math'
      src = last.number - first.number >= 2 ? doc.sliceString(doc.line(first.number + 1).from, doc.line(last.number - 1).to) : ''
    } else if (n.name === 'FencedCode') {
      const info = n.getChild('CodeInfo')
      if (!info || !/^mermaid$/i.test(doc.sliceString(info.from, info.to).trim()) || n.getChildren('CodeMark').length < 2) continue
      const first = doc.lineAt(n.from), last = doc.lineAt(n.to)
      kind = 'mermaid'
      src = last.number - first.number >= 2 ? doc.sliceString(doc.line(first.number + 1).from, doc.line(last.number - 1).to) : ''
    } else continue
    const touched = state.selection.ranges.some((r) => r.from <= n.to && r.to >= n.from)
    if (touched) b.add(n.to, n.to, Decoration.widget({ widget: new RichBlock(kind, src, n.from, true), block: true, side: 1 }))
    else {
      // 빈 줄을 그대로 그리면 간격이 너무 벌어지므로, 결과 그림 바로 위아래의 빈 줄은 얇게 줄인다
      // (커서가 있는 줄은 원래 높이로 두어 커서가 보이게 한다).
      const gap = (num: number) => {
        if (num < 1 || num > doc.lines || gaps.has(num)) return
        const ln = doc.line(num)
        if (ln.text.trim() !== '' || state.selection.ranges.some((r) => doc.lineAt(r.head).number === num)) return
        gaps.add(num)
        return ln.from
      }
      const before = gap(doc.lineAt(n.from).number - 1)
      if (before !== undefined) b.add(before, before, Decoration.line({ class: 'cm-gap' }))
      b.add(n.from, n.to, Decoration.replace({ widget: new RichBlock(kind, src, n.from, false), block: true }))
      const after = gap(doc.lineAt(n.to).number + 1)
      if (after !== undefined) b.add(after, after, Decoration.line({ class: 'cm-gap' }))
    }
  }
  return b.finish()
}

export const richBlocks = StateField.define<DecorationSet>({
  create: build,
  update: (v, tr) => (tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState) ? build(tr.state) : v),
  provide: (f) => EditorView.decorations.from(f)
})
