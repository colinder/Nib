import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { HELP } from './helpContent.ts'

// 도움말이 실제 단축키와 어긋나지 않게 한다: 코드(commands.ts)에 있는 단축키는 도움말에도 있어야 한다.
const documented = new Set(HELP.flatMap((t) => t.sections.flatMap((s) => s.rows.flatMap((r) => r.keys ?? []))).map((k) => k.toLowerCase()))
// 방향키/Backspace/Delete/Enter는 상황에 따라 동작하는 내부 처리라 개별 단축키로 설명하지 않는다 (표·코드 블록 항목에서 설명).
const INTERNAL = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'backspace', 'delete', 'enter'])

test('commands.ts의 단축키가 모두 도움말에 있다', () => {
  const src = readFileSync(new URL('./commands.ts', import.meta.url), 'utf8')
  const keys = [...src.matchAll(/key: '([^']+)'/g)].map((m) => m[1].toLowerCase())
  assert.ok(keys.length > 10, '단축키를 읽지 못했다')
  const missing = keys.filter((k) => !INTERNAL.has(k) && !documented.has(k))
  assert.deepEqual(missing, [])
})
test('Mod-1~6 제목 단축키가 도움말에 있다', () => {
  for (let n = 1; n <= 6; n++) assert.ok(documented.has(`mod-${n}`), `Mod-${n}`)
})
test('메뉴 단축키(main/index.ts)가 모두 도움말에 있다', () => {
  const src = readFileSync(new URL('../main/index.ts', import.meta.url), 'utf8')
  const norm = (a: string) => a.replace('CmdOrCtrl', 'Mod').toLowerCase()
  const accs = [...src.matchAll(/accelerator: '([^']+)'/g)].map((m) => norm(m[1]).replace(/\+/g, '-'))
  assert.ok(accs.length >= 5)
  const missing = accs.filter((a) => !documented.has(a) && a !== 'f1')
  assert.deepEqual(missing, [])
  assert.ok(documented.has('f1'))
})
test('모든 행에 설명이 있고 키 또는 예시 중 하나가 있다', () => {
  for (const t of HELP) for (const s of t.sections) for (const r of s.rows) assert.ok(r.desc && (r.keys?.length || r.text), `${t.id}/${s.title}`)
})
