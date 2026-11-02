import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addCol, addRow, deleteCol, deleteRow, emptyTable, moveCol, moveRow, parseTable, resize, serializeTable, setAlign } from './tableModel.ts'

test('파싱 후 직렬화', () => {
  const t = parseTable('| a | b |\n| :--- | ---: |\n| 1 | 2 |')
  assert.deepEqual(t.rows, [['a', 'b'], ['1', '2']])
  assert.deepEqual(t.aligns, ['left', 'right'])
  assert.equal(serializeTable(t), '| a | b |\n| :--- | ---: |\n| 1 | 2 |')
})
test('양끝 파이프 없는 표, CRLF', () => {
  assert.deepEqual(parseTable('a | b\r\n--|--\r\n1 | 2').rows, [['a', 'b'], ['1', '2']])
})
test('이스케이프된 파이프와 줄바꿈', () => {
  const t = parseTable('| a\\|b | c |\n|---|---|\n| x | y |')
  assert.equal(t.rows[0][0], 'a|b')
  assert.equal(serializeTable(t).split('\n')[0], '| a\\|b | c |')
  assert.equal(serializeTable({ rows: [['a\nb']], aligns: [null] }).split('\n')[0], '| a b |')
})
test('부족한 셀은 채우고 넘치는 셀은 자른다', () => {
  assert.deepEqual(parseTable('| a | b |\n|-|-|\n| 1 |\n| 1 | 2 | 3 |').rows, [['a', 'b'], ['1', ''], ['1', '2']])
})
test('행/열 조작', () => {
  let t = parseTable('| a | b |\n|-|-|\n| 1 | 2 |')
  t = addRow(t, 1)
  assert.equal(t.rows.length, 3)
  assert.deepEqual(deleteRow(t, 0), t) // 헤더 보호
  assert.equal(deleteRow(t, 2).rows.length, 2)
  t = addCol(t, 0)
  assert.deepEqual(t.rows[0], ['a', '', 'b'])
  assert.equal(deleteCol(deleteCol(deleteCol(t, 0), 0), 0).aligns.length, 1) // 마지막 열 보호
})
test('빈 표 직렬화', () => {
  assert.equal(serializeTable(emptyTable()), '|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |')
})

test('정렬, 이동, 크기 변경', () => {
  let t = parseTable('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')
  assert.deepEqual(setAlign(t, 1, 'center').aligns, [null, 'center'])
  assert.deepEqual(moveRow(t, 2, -1).rows.map((r) => r[0]), ['a', '3', '1'])
  assert.deepEqual(moveRow(t, 1, -1), t) // 헤더 위로는 못 간다
  assert.deepEqual(moveCol(setAlign(t, 0, 'right'), 0, 1).aligns, [null, 'right'])
  assert.deepEqual(moveCol(t, 1, 1), t)
  t = resize(t, 2, 3)
  assert.deepEqual(t.rows, [['a', 'b', ''], ['1', '2', '']])
  assert.equal(resize(t, 99, 99).rows.length, 50)
})
