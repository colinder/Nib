import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { EditorState } from '@codemirror/state'
import { writeAtomic } from './fs.ts'

// 열기→(무편집)→저장 시 바이트가 같아야 한다. 에디터(CodeMirror)를 거치는 경로까지 검증한다.
const cases: Record<string, string> = {
  lf: '# 제목\n\n- a\n- b\n',
  crlf: '# 제목\r\n\r\n**굵게**\r\n',
  noTrailingNewline: '끝에 개행 없음',
  trailingSpaces: '두 칸 줄바꿈  \n다음 줄\n\n\n\n빈 줄 여러 개\n',
  fences: '```ts\nconst a = 1\n```\n',
  emoji: '🍃 이모지와 한글 ₩\n'
}

for (const [name, text] of Object.entries(cases)) {
  test(`왕복 무손실: ${name}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nib-'))
    const file = join(dir, 'a.md')
    await writeFile(file, text, 'utf8')

    const content = await readFile(file, 'utf8')
    const eol = content.includes('\r\n') ? '\r\n' : '\n'
    const state = EditorState.create({ doc: content, extensions: [EditorState.lineSeparator.of(eol)] })
    await writeAtomic(file, state.sliceDoc())

    assert.equal(await readFile(file, 'utf8'), text)
  })
}
