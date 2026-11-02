import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parser } from '@lezer/markdown'
import { mathSyntax } from './mathSyntax.ts'

// 문서에서 InlineMath/BlockMath로 잡힌 구간의 텍스트를 모은다.
const found = (doc: string) => {
  const out: string[] = []
  parser.configure(mathSyntax).parse(doc).iterate({ enter: (n) => { if (n.name === 'InlineMath' || n.name === 'BlockMath') out.push(`${n.name}:${doc.slice(n.from, n.to)}`) } })
  return out
}

test('인라인 수식', () => {
  assert.deepEqual(found('값은 $x^2 + y_1$ 이다'), ['InlineMath:$x^2 + y_1$'])
  assert.deepEqual(found('$a$ 그리고 $b$'), ['InlineMath:$a$', 'InlineMath:$b$'])
})
test('같은 줄 $$ 수식', () => {
  assert.deepEqual(found('가 $$\\frac{a}{b}$$ 나'), ['InlineMath:$$\\frac{a}{b}$$'])
})
test('가격 같은 글은 수식이 아니다', () => {
  assert.deepEqual(found('사과 $5 그리고 배 $6 입니다'), [])
  assert.deepEqual(found('단독 $ 기호'), [])
})
test('이스케이프와 코드', () => {
  assert.deepEqual(found('\\$a\\$ 는 글자'), [])
  assert.deepEqual(found('코드 `$x$` 안은 수식이 아님'), [])
})
test('수식 안의 _ 와 * 는 강조로 해석되지 않는다', () => {
  const tree: string[] = []
  const doc = '$a_1 + b_2$ 와 *강조*'
  parser.configure(mathSyntax).parse(doc).iterate({ enter: (n) => { tree.push(n.name) } })
  assert.equal(tree.filter((n) => n === 'Emphasis').length, 1) // *강조* 하나만
})
test('블록 수식', () => {
  assert.deepEqual(found('앞\n\n$$\n\\sum_{i=1}^n i\n$$\n\n뒤'), ['BlockMath:$$\n\\sum_{i=1}^n i\n$$'])
})
test('닫히지 않은 블록 수식은 문서 끝까지', () => {
  assert.deepEqual(found('앞\n\n$$\nx = 1'), ['BlockMath:$$\nx = 1'])
})
