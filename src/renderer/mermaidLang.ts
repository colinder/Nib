import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language'
import { Tag } from '@lezer/highlight'

// Mermaid 전용 태그. 공용 태그(meta, bracket)를 쓰면 Markdown의 기호나 다른 언어의 괄호 색까지 바뀐다.
export const mmMeta = Tag.define() // 화살표, `:` 뒤 라벨
export const mmBracket = Tag.define() // 대괄호/소괄호/중괄호

// Mermaid 코드용 간단한 구문 색칠(공식 CodeMirror 언어가 없어서 직접 만든다).
// 다이어그램 종류/키워드, 화살표와 `:` 뒤 라벨, 대괄호, 문자열, 주석(%%)을 구분한다. 문법 검증은 하지 않는다.
const KEYWORDS = new Set([
  'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie', 'journey', 'gitGraph', 'mindmap', 'timeline',
  'quadrantChart', 'requirementDiagram', 'participant', 'actor', 'as', 'title', 'section', 'subgraph', 'end', 'class', 'state', 'note', 'Note', 'over', 'of',
  'left', 'right', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'rect', 'critical', 'break', 'activate', 'deactivate', 'autonumber', 'direction',
  'TB', 'TD', 'BT', 'RL', 'LR', 'dateFormat', 'axisFormat', 'excludes', 'showData', 'style', 'classDef', 'linkStyle', 'click', 'namespace', 'interface',
  'abstract', 'commit', 'branch', 'checkout', 'merge'
])

const ARROW = /(?:<\|?|<<)?(?:-{2,}|={2,}|-\.+-?|\.{2,}|-(?=>))(?:\|?>|>{1,2}|[ox)])?/
const ER_REL = /[|}{o]{1,2}(?:--|\.\.)[|}{o]{1,2}/

type State = { label: boolean; pipe: boolean }

export const mermaidLanguage = StreamLanguage.define<State>({
  startState: () => ({ label: false, pipe: false }),
  token(stream, st) {
    if (stream.sol()) (st.label = false, (st.pipe = false))
    if (stream.eatSpace()) return null
    if (stream.match(/%%.*/)) return 'comment'
    if (st.label) return (stream.skipToEnd(), 'mmMeta') // `:` 뒤는 줄 끝까지 라벨
    if (st.pipe) {
      if (stream.eat('|')) return ((st.pipe = false), 'mmMeta')
      stream.skipTo('|') || stream.skipToEnd()
      return 'mmMeta'
    }
    if (stream.match(/"[^"]*"?/)) return 'string'
    if (stream.match(ER_REL) || stream.match(ARROW)) return 'mmMeta'
    if (stream.eat('|')) return ((st.pipe = true), 'mmMeta') // 순서도의 -->|라벨|
    if (stream.eat(':')) return ((st.label = true), 'mmMeta')
    if (stream.match(/[[\](){}]/)) return 'mmBracket'
    if (stream.match(/[\p{L}_][\p{L}\p{N}_]*(?:-v2)?/u)) return KEYWORDS.has(stream.current().replace(/-v2$/, '')) ? 'keyword' : null
    if (stream.match(/\d[\d.]*/)) return 'number'
    stream.next()
    return null
  },
  tokenTable: { mmMeta, mmBracket }
})

export const mermaidDescription = LanguageDescription.of({ name: 'mermaid', support: new LanguageSupport(mermaidLanguage) })
