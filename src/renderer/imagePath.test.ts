import assert from 'node:assert/strict'
import { test } from 'node:test'
import { imageMarkdown } from './imagePath.ts'

test('공백이 있는 경로는 퍼센트 인코딩 없이 <> 로 감싼다', () => {
  assert.equal(imageMarkdown('/Users/a/Downloads/스크린샷, 2026-10-28 오후 3.32.57.png', null), '![스크린샷, 2026-10-28 오후 3.32.57](</Users/a/Downloads/스크린샷, 2026-10-28 오후 3.32.57.png>)')
})
test('괄호가 있는 경로도 <> 로 감싼다', () => {
  assert.equal(imageMarkdown('/Users/a/내 사진 (1).png', null), '![내 사진 (1)](</Users/a/내 사진 (1).png>)')
})
test('공백/괄호가 없으면 그대로', () => {
  assert.equal(imageMarkdown('/Users/a/pic.png', null), '![pic](/Users/a/pic.png)')
})
test('문서 폴더 아래 파일은 상대 경로', () => {
  assert.equal(imageMarkdown('/Users/a/docs/img/pic.png', '/Users/a/docs'), '![pic](img/pic.png)')
  assert.equal(imageMarkdown('/Users/a/docs/img/a b.png', '/Users/a/docs'), '![a b](<img/a b.png>)')
  assert.equal(imageMarkdown('/Users/a/other/pic.png', '/Users/a/docs'), '![pic](/Users/a/other/pic.png)')
})
test('윈도우 경로', () => {
  assert.equal(imageMarkdown('C:\\docs\\img\\x y.png', 'C:/docs'), '![x y](<img/x y.png>)')
})
