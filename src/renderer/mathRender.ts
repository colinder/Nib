import katex from 'katex'
import 'katex/contrib/mhchem' // \ce{...} 화학식, \pu{...}

// el에 수식을 그린다. 문법 오류가 있으면 원문을 빨갛게 보여 주고 오류 메시지를 돌려준다(없으면 null).
export function renderMath(el: HTMLElement, src: string, display: boolean): string | null {
  try {
    katex.render(src, el, { displayMode: display, throwOnError: true, strict: 'ignore', output: 'html' })
    return null
  } catch (e) {
    el.textContent = src
    el.classList.add('cm-math-error')
    return (e as Error).message.replace(/^KaTeX parse error: /, '')
  }
}

// Mermaid는 무거워서 처음 필요할 때만 불러온다. 같은 코드는 다시 그리지 않도록 결과(SVG)를 보관한다.
// ponytail: 보관 크기 제한 없음. 문서를 오래 편집하면 늘어나므로 필요하면 LRU로 바꾼다.
const cache = new Map<string, string>()
let seq = 0
let themeSet: string | null = null

export async function renderMermaid(code: string): Promise<{ svg: string } | { error: string }> {
  const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
  const key = theme + '\0' + code
  const hit = cache.get(key)
  if (hit) return { svg: hit }
  const id = `mmd-${++seq}`
  try {
    const { default: mermaid } = await import('mermaid')
    if (themeSet !== theme) {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, fontFamily: 'inherit' })
      themeSet = theme
    }
    const { svg } = await mermaid.render(id, code)
    cache.set(key, svg)
    return { svg }
  } catch (e) {
    // 어느 줄이 틀렸는지 보이도록 앞의 몇 줄을 줄 모양 그대로 돌려준다.
    return { error: String((e as Error).message ?? e).split('\n').slice(0, 6).join('\n') }
  } finally {
    // 오류가 나면 Mermaid가 임시 요소를 문서에 남긴다.
    document.getElementById(id)?.remove()
    document.getElementById('d' + id)?.remove()
  }
}
