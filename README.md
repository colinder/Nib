# Nib

입력하는 즉시 서식이 적용되는 데스크톱 Markdown 에디터입니다. 편집 중인 요소만 원문 문법이 드러나, 문서 작성에 집중할 수 있습니다.

> 상태: **초기 설계 단계**. 앱 코드는 아직 없습니다. 아래 기술 스택은 [기술 설계](docs/TECHNICAL_DESIGN.md)의 잠정 결정이며 Phase 0 검증 후 확정합니다.

## 목표

- 실시간 WYSIWYG Markdown 편집
- 미니멀한 UI, 글쓰기 집중
- 로컬 `.md` 파일 열기/편집/저장. 문서마다 독립된 창(다중 창)을 사용하며 폴더 트리 사이드바는 두지 않음
- Windows, macOS 지원

## 잠정 기술 스택

| 영역 | 선택 |
|---|---|
| 셸 | Electron |
| UI | React + TypeScript |
| 편집 엔진 | CodeMirror 6 (Live Preview 방식) |
| 빌드 | electron-vite |
| 테스트 | Vitest |

## 주요 기능

실시간 WYSIWYG 편집(제목·목록·체크박스·인용·표·이미지·코드 블록), KaTeX 수식, Mermaid 다이어그램, 각주, 다중 창, 글꼴 설정(`Cmd/Ctrl+,`). 단축키와 사용법은 앱 안의 **도움말(`F1`)** 에서 볼 수 있다. 예시 문서는 [docs/samples/math-and-diagrams.md](docs/samples/math-and-diagrams.md).

## 개발 환경

- Node.js 24.x, npm 11.x에서 조사했습니다. 프로젝트 버전 고정(`.nvmrc`, `engines`)은 스캐폴딩 시 결정합니다.
- `npm install` → `npm run dev` (개발 실행, main/preload 변경 시 자동 재시작), `npm run build`, `npm run typecheck`, `npm test`.

## 문서

- [제품 명세](docs/PRODUCT_SPEC.md)
- [기술 설계](docs/TECHNICAL_DESIGN.md)
- [로드맵](docs/ROADMAP.md)
- [작업 지침](CLAUDE.md)

## 라이선스

[MIT](LICENSE)
