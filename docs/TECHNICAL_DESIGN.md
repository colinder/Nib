# Nib 기술 설계

상태: **잠정 결정**. 확정은 [ROADMAP](ROADMAP.md) Phase 0 검증 결과에 따릅니다.

## 1. 조사 시점 환경 (2026-10-28)

- 기존 앱 코드/설정 없음. 저장소에는 `LICENSE`(MIT), `CLAUDE.md`만 존재 (초기 커밋 1개).
- 로컬: Node v24.22.0, npm 11.19.1.
- `npm view`로 확인한 최신 버전: electron 45.1.0, react 19.3.1, typescript 7.0.2, @tiptap/core·@tiptap/markdown 3.32.0, codemirror 6.0.2, @codemirror/lang-markdown 6.5.2, electron-vite 6.0.0, vite 8.3.5, vitest 5.0.5.
  버전은 스캐폴딩 시 다시 확인하고 lockfile로 고정합니다. 호환성(예: electron-vite 6 ↔ vite 8, TypeScript 7)은 **미검증**입니다.

## 2. 편집 엔진 비교

요구: WYSIWYG(서식이 즉시 적용, 편집 중 요소만 문법 노출), 파일은 Markdown.

| 기준 | Tiptap / ProseMirror | CodeMirror 6 (Live Preview) |
|---|---|---|
| 문서 모델 | 구조화된 트리(노드/마크). 렌더된 결과가 곧 편집 대상 | Markdown **원문 텍스트**. 장식(decoration)으로 렌더처럼 보이게 함 |
| WYSIWYG 적합도 | 높음. 제목/목록/인용/테이블이 실제 블록으로 존재 | 가능하나 직접 구현 부담 큼. 블록 위젯, 문법 숨김/표시, 커서 처리 직접 작성 |
| 입력 규칙(`# `→제목) | 확장/InputRule로 내장 | 직접 구현 |
| 테이블, 이미지, 수식 | 노드뷰로 자연스럽게 구현 | 블록 위젯으로 구현, 편집 UX가 어려움 |
| Markdown 왕복(round-trip) | **약점.** 파싱→직렬화 시 공백, 목록 기호, 강조 기호, 이스케이프가 정규화될 수 있음 | **강점.** 문서 = 원문, 사용자 파일이 임의로 바뀌지 않음 |
| 대용량 문서 | 보통. 노드뷰가 많으면 비용 증가 | 우수 |
| 의존성 | `@tiptap/*` + ProseMirror (Markdown은 공식 `@tiptap/markdown`) | `codemirror` + `@codemirror/lang-markdown` + Lezer |
| React 통합 | `@tiptap/react` 공식 | 래퍼 직접 작성 또는 community |

### 결정: CodeMirror 6 (사용자 결정, 2026-10-28)

사용자가 입력 즉시 서식이 적용되는 매끄러운 편집 경험을 목표로 하며 CodeMirror 6로 먼저 구현·검증하기로 결정했습니다. 아래 비교는 당시 검토 기록이며, 아래 '이유'는 Tiptap을 추천했던 초기 분석입니다. 결정은 그것을 뒤집은 것이므로 Tiptap의 장단점은 남겨 둡니다.

**CodeMirror 선택의 이점:** 문서 = 원문이므로 Markdown 왕복 손실이 없고 대용량에 강합니다. **감수할 비용:** 입력 규칙, 문법 기호 숨김/표시, 테이블·이미지 위젯을 직접 구현해야 합니다. Phase 0에서 충분한 편집 체감이 나오는지 직접 화면으로 확인합니다.

**재평가 조건:** 테이블/블록 편집 UX가 허용 수준에 못 미치면 Tiptap을 재검토합니다(그 경우도 두 엔진 동시 사용 금지).

#### 초기 분석(참고): Tiptap 추천 근거

이유: 목표 경험이 "렌더된 문서를 직접 편집"이며, CodeMirror 6에서 이를 재현하려면 입력 규칙, 블록 렌더링, 테이블/이미지 편집을 거의 전부 직접 구현해야 해 "단순성 우선" 원칙에 반합니다. Tiptap은 이 부분이 이미 제공됩니다.

**핵심 리스크:** Markdown 왕복 시 원문 정규화. 이는 로컬 파일을 다루는 에디터에서 신뢰 문제이므로 Phase 0에서 반드시 실측합니다.

**전환 조건:** Phase 0 fixture 테스트에서 허용 불가한 변형이 나오고 해결 비용이 크면 CodeMirror 6 Live Preview로 재평가합니다. 두 엔진을 동시에 도입하지 않습니다. (소스 모드가 필요하면 별도 `<textarea>` 수준의 단순 뷰를 먼저 고려하고 CodeMirror는 도입하지 않습니다.)

고려했으나 제외: Milkdown(7.23.0, ProseMirror 기반 Markdown 중심). 후보이긴 하나 Tiptap 대비 생태계/문서 이점이 확인되지 않아 현 단계에서 추가 비교하지 않음 — 필요시 Phase 0에서 재검토.

## 3. 아키텍처

Electron 표준 3계층. 보안 기본값을 따릅니다.

```
Main process      : 창, 메뉴, 파일 시스템 접근, 다이얼로그
Preload (bridge)  : contextBridge로 최소 API만 노출 (readFile, writeFile, openFolder, listDir ...)
Renderer (React)  : UI, CodeMirror 에디터
```

- `contextIsolation: true`, `nodeIntegration: false`, 렌더러의 직접 `fs` 접근 금지.
- IPC는 채널을 좁게 정의하고 main이 대화상자로 사용자가 고른 경로만 저장을 허용합니다.
- 상태 관리는 React 상태로 시작하고 필요가 확인되면 라이브러리를 추가합니다 (추측 도입 금지).
- 파일 쓰기는 임시 파일 후 교체(atomic write)로 데이터 손실을 방지합니다. 구체 구현은 Phase 1.

### 잠정 디렉터리 구조 (스캐폴딩 시 확정)

```
src/main/       Electron main
src/preload/    contextBridge
src/renderer/   React 앱, 에디터
docs/           문서
```

## 4. 기술 스택

| 영역 | 잠정 | 상태 |
|---|---|---|
| Electron | 최신 안정 | 확정 후보 |
| React + TypeScript | 사용 | 확정 후보 |
| 편집 엔진 | CodeMirror 6 + `@codemirror/lang-markdown` | 사용자 결정, Phase 0에서 UX 검증 |
| 빌드 | electron-vite | 잠정, 버전 호환 미검증 |
| 테스트 | Vitest (단위), Playwright(Electron E2E)는 필요 시 | 미결정 |
| 패키징 | electron-builder 또는 Electron Forge | 미결정 |

## 5. 미결정 사항

- 패키지 매니저(npm 가정), Node 버전 고정
- 패키징 도구, 코드 서명/공증 방식
- 소스 모드 필요 여부와 구현 방식
- 수식/다이어그램 도입 시 라이브러리
- Markdown 방언 범위(CommonMark + GFM 가정, 확인 필요)
- 파일 변경 감지(외부 편집 충돌) 정책
