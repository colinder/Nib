// 사용자 설정(글꼴). 같은 출처의 localStorage에 저장하므로 모든 창이 공유하고, 한 창에서 바꾸면 다른 창에도 즉시 반영된다(storage 이벤트).
// ponytail: 설정이 늘어나면 main 프로세스의 settings.json으로 옮긴다. 개발(localhost)과 배포(file://)는 출처가 달라 설정이 따로 저장된다.

// 본문/코드 두 설정 모두 같은 글꼴 목록에서 고른다. 목록에 없는 글자(한글 등)는 시스템 글꼴로 대체된다.
export const FONTS = {
  opensans: { label: 'Open Sans', family: "'Open Sans'" },
  pretendard: { label: 'Pretendard', family: "'Pretendard'" },
  cascadia: { label: 'Cascadia Code', family: "'Cascadia Code'" },
  'system-sans': { label: '시스템 기본', family: 'system-ui, -apple-system' },
  'system-mono': { label: '시스템 고정폭', family: 'ui-monospace, Menlo, Consolas' }
}
export type FontKey = keyof typeof FONTS
const CJK = "'Apple SD Gothic Neo', 'Malgun Gothic'"
export const bodyStack = (k: FontKey) => `${FONTS[k].family}, ${CJK}, sans-serif`
export const codeStack = (k: FontKey) => `${FONTS[k].family}, ui-monospace, Menlo, Consolas, ${CJK}, monospace`

export type Settings = { body: FontKey; code: FontKey }
export const DEFAULTS: Settings = { body: 'opensans', code: 'cascadia' }
const KEY = 'nib.settings'

export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    // 이전 버전은 'system' 하나였다: 본문이면 시스템 기본, 코드면 시스템 고정폭으로 옮긴다.
    const pick = (v: string, old: FontKey, d: FontKey): FontKey => (v === 'system' ? old : v in FONTS ? (v as FontKey) : d)
    return { body: pick(s.body, 'system-sans', DEFAULTS.body), code: pick(s.code, 'system-mono', DEFAULTS.code) }
  } catch {
    return DEFAULTS
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* 저장소를 쓸 수 없어도 이번 실행 동안은 적용된다 */
  }
}

export function applySettings(s: Settings) {
  const root = document.documentElement.style
  root.setProperty('--font-body', bodyStack(s.body))
  root.setProperty('--font-mono', codeStack(s.code))
}
