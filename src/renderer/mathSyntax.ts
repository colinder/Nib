import type { MarkdownConfig } from '@lezer/markdown'

// Markdown 파서 확장: 인라인 수식 `$x$`, `$$x$$`(같은 줄)와 블록 수식(`$$` 줄로 둘러싼 여러 줄).
// 수식 안의 `_`, `*`가 강조로 해석되지 않도록 별도 노드(InlineMath/BlockMath)로 잡는다.
// ponytail: 닫는 `$$`가 없으면 문서 끝까지 수식 블록으로 본다(코드 펜스와 같은 동작). 입력 직후 닫는 줄을 자동으로 넣어 완화한다(commands.ts).
const DOLLAR = 36, BACKSLASH = 92, NEWLINE = 10

const isSpace = (c: number) => c === 32 || c === 9 || c === NEWLINE
const isDigit = (c: number) => c >= 48 && c <= 57

export const mathSyntax: MarkdownConfig = {
  defineNodes: [{ name: 'InlineMath' }, { name: 'BlockMath', block: true }],
  parseInline: [
    {
      name: 'InlineMath',
      before: 'Emphasis',
      parse(cx, next, pos) {
        if (next !== DOLLAR || cx.char(pos - 1) === BACKSLASH) return -1
        if (cx.char(pos + 1) === DOLLAR) {
          // $$ ... $$ (같은 줄)
          for (let j = pos + 2; j < cx.end - 1; j++) {
            const c = cx.char(j)
            if (c === NEWLINE) return -1
            if (c === DOLLAR && cx.char(j + 1) === DOLLAR && j > pos + 2) return cx.addElement(cx.elt('InlineMath', pos, j + 2))
          }
          return -1
        }
        // $ ... $ : 여는 $ 뒤와 닫는 $ 앞은 공백이 아니고, 닫는 $ 뒤에 숫자가 오지 않는다 (가격 "$5 and $6" 같은 글을 수식으로 오인하지 않기 위해)
        if (isSpace(cx.char(pos + 1))) return -1
        for (let j = pos + 1; j < cx.end; j++) {
          const c = cx.char(j)
          if (c === NEWLINE) return -1
          if (c === BACKSLASH) { j++; continue }
          if (c === DOLLAR) {
            if (j === pos + 1 || isSpace(cx.char(j - 1)) || isDigit(cx.char(j + 1))) return -1
            return cx.addElement(cx.elt('InlineMath', pos, j + 1))
          }
        }
        return -1
      }
    }
  ],
  parseBlock: [
    {
      name: 'BlockMath',
      before: 'FencedCode',
      parse(cx, line) {
        if (line.next !== DOLLAR || line.text.slice(line.pos).trim() !== '$$') return false
        const from = cx.lineStart + line.pos
        let to = -1
        while (cx.nextLine()) {
          if (line.text.slice(line.pos).trim() === '$$') {
            to = cx.lineStart + line.text.length
            cx.nextLine()
            break
          }
        }
        cx.addElement(cx.elt('BlockMath', from, to < 0 ? cx.prevLineEnd() : to))
        return true
      }
    }
  ]
}
