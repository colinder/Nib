// Markdown(GFM) 표 <-> 모델 변환. DOM/CodeMirror에 의존하지 않는다.
export type Align = 'left' | 'center' | 'right' | null
export type Table = { rows: string[][]; aligns: Align[] } // rows[0]은 헤더

export const splitRow = (line: string): string[] => {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') (cur += '|', i++)
    else if (s[i] === '|') (cells.push(cur.trim()), (cur = ''))
    else cur += s[i]
  }
  cells.push(cur.trim())
  return cells
}

export function parseTable(text: string): Table {
  const lines = text.split(/\r?\n/)
  const delim = splitRow(lines[1] ?? '')
  const aligns = delim.map((d): Align => {
    const l = d.startsWith(':'), r = d.endsWith(':')
    return l && r ? 'center' : r ? 'right' : l ? 'left' : null
  })
  const cols = Math.max(1, delim.length)
  const rows = lines.filter((l, i) => i !== 1 && l.trim()).map((l) => {
    const c = splitRow(l).slice(0, cols)
    while (c.length < cols) c.push('')
    return c
  })
  return { rows, aligns: Array.from({ length: cols }, (_, i) => aligns[i] ?? null) }
}

const esc = (c: string) => c.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

export function serializeTable(t: Table, eol = '\n'): string {
  const line = (cells: string[]) => '| ' + cells.map(esc).join(' | ') + ' |'
  const d = t.aligns.map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'))
  return [line(t.rows[0]), '| ' + d.join(' | ') + ' |', ...t.rows.slice(1).map(line)].join(eol)
}

const cols = (t: Table) => t.aligns.length

// 행 r 아래에 빈 행 추가 (r은 rows 인덱스, 헤더 아래 추가도 가능)
export const addRow = (t: Table, r: number): Table => ({
  ...t,
  rows: [...t.rows.slice(0, r + 1), Array(cols(t)).fill(''), ...t.rows.slice(r + 1)]
})
// 헤더(0)는 삭제할 수 없다.
export const deleteRow = (t: Table, r: number): Table => (r < 1 ? t : { ...t, rows: t.rows.filter((_, i) => i !== r) })
export const addCol = (t: Table, c: number): Table => ({
  rows: t.rows.map((row) => [...row.slice(0, c + 1), '', ...row.slice(c + 1)]),
  aligns: [...t.aligns.slice(0, c + 1), null, ...t.aligns.slice(c + 1)]
})
// 마지막 한 열은 삭제할 수 없다.
export const deleteCol = (t: Table, c: number): Table =>
  cols(t) < 2 ? t : { rows: t.rows.map((row) => row.filter((_, i) => i !== c)), aligns: t.aligns.filter((_, i) => i !== c) }

export const emptyTable = (rows = 2, cols = 3): Table => ({
  rows: Array.from({ length: rows + 1 }, () => Array(cols).fill('')),
  aligns: Array(cols).fill(null)
})

export const setAlign = (t: Table, c: number, a: Align): Table => ({ ...t, aligns: t.aligns.map((x, i) => (i === c ? a : x)) })

const swap = <T>(a: T[], i: number, j: number) => {
  const b = [...a]
  ;[b[i], b[j]] = [b[j], b[i]]
  return b
}
// 본문 행끼리만 이동한다(헤더는 고정). d: -1 위, +1 아래
export const moveRow = (t: Table, r: number, d: -1 | 1): Table =>
  r < 1 || r + d < 1 || r + d >= t.rows.length ? t : { ...t, rows: swap(t.rows, r, r + d) }
export const moveCol = (t: Table, c: number, d: -1 | 1): Table =>
  c + d < 0 || c + d >= cols(t) ? t : { rows: t.rows.map((row) => swap(row, c, c + d)), aligns: swap(t.aligns, c, c + d) }

// 크기 변경: 줄어들면 잘려 나간 칸의 내용은 사라진다. rows는 헤더 포함.
export function resize(t: Table, rows: number, c: number): Table {
  const R = Math.min(50, Math.max(1, rows)), C = Math.min(50, Math.max(1, c))
  const fit = (row: string[]) => Array.from({ length: C }, (_, i) => row[i] ?? '')
  return {
    rows: Array.from({ length: R }, (_, i) => fit(t.rows[i] ?? [])),
    aligns: Array.from({ length: C }, (_, i) => t.aligns[i] ?? null)
  }
}
