import { createRoot } from 'react-dom/client'
import { App } from './App'
// 본문 글꼴 (Open Sans, 라틴 문자만. 한글은 시스템 글꼴).
import '@fontsource/open-sans/latin-400.css'
import '@fontsource/open-sans/latin-400-italic.css'
import '@fontsource/open-sans/latin-700.css'
import '@fontsource/open-sans/latin-700-italic.css'
// Pretendard(한글 포함)와 Cascadia Code는 앱에 포함해 오프라인에서도 쓴다.
import '@fontsource/cascadia-code/latin-400.css'
import '@fontsource/cascadia-code/latin-700.css'
import 'katex/dist/katex.min.css'
import './style.css'
import { applySettings, loadSettings } from './settings'

applySettings(loadSettings())

createRoot(document.getElementById('root')!).render(<App />)
