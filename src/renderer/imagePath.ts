// 파일 경로를 Markdown 이미지 문법으로 바꾼다 (DOM에 의존하지 않아 테스트할 수 있다).
// 문서 폴더(baseDir) 아래 파일이면 상대 경로, 아니면 절대 경로. 공백이나 괄호가 있는 경로는 `<...>`로 감싼다
// (표준 Markdown이고 %20 같은 인코딩 없이 사람이 읽을 수 있다). 윈도우 경로의 `\`는 `/`로 바꾼다.
export function imageMarkdown(absPath: string, baseDir: string | null): string {
  const p = absPath.replace(/\\/g, '/')
  const name = p.split('/').pop()!.replace(/\.[^.]+$/, '')
  const rel = baseDir && p.startsWith(baseDir + '/') ? p.slice(baseDir.length + 1) : p
  return `![${name}](${/[\s()]/.test(rel) ? `<${rel}>` : rel})`
}
