# Nib

입력하는 즉시 서식이 적용되는 데스크톱 Markdown 에디터입니다. 편집 중인 요소만 원문 문법이 드러나, 문서 작성에 집중할 수 있습니다.

## 목표

- 실시간 WYSIWYG Markdown 편집
- 미니멀한 UI, 글쓰기 집중
- 로컬 `.md` 파일 열기/편집/저장. 문서마다 독립된 창(다중 창)을 사용하며 폴더 트리 사이드바는 두지 않음
- Windows, macOS 지원

## 기술 스택

| 영역 | 선택 |
|---|---|
| 셸 | Electron |
| UI | React + TypeScript |
| 편집 엔진 | CodeMirror 6 (Live Preview 방식) |
| 빌드 | electron-vite, electron-builder |
| 테스트 | Node 내장 테스트 러너(`node --test`) |

## 주요 기능

실시간 WYSIWYG 편집(제목·목록·체크박스·인용·표·이미지·코드 블록), KaTeX 수식, Mermaid 다이어그램, 각주, 다중 창, 글꼴 설정(`Cmd/Ctrl+,`). 단축키와 사용법은 앱 안의 **도움말(`F1`)** 에서 볼 수 있다. 예시 문서는 [docs/samples/math-and-diagrams.md](docs/samples/math-and-diagrams.md).

## 설치

[Releases](https://github.com/colinder/Nib/releases)에서 내려받습니다.

- **macOS**: Apple Silicon은 `Nib-<버전>-arm64.dmg`, Intel은 `Nib-<버전>.dmg`. Apple 서명·공증을 받은 앱입니다.
- **Windows**: `Nib Setup <버전>.exe`. 서명이 없어 SmartScreen 경고가 뜨면 **추가 정보 → 실행**을 누르세요.

## 삭제

작성한 문서는 앱 데이터에 저장되지 않으므로 아래 데이터를 지워도 문서에는 영향이 없습니다.

- **Windows**: `설정 → 앱`에서 Nib을 제거하면 앱 데이터(`%APPDATA%\Nib`)까지 함께 지워집니다.
- **macOS**: 앱을 휴지통으로 옮긴 뒤, 남은 설정과 캐시를 터미널에서 지웁니다.

  ```sh
  rm -rf ~/Library/Application\ Support/Nib ~/Library/Preferences/io.github.colinder.nib.plist
  ```

## 개발 환경

- Node.js 24.x, npm 11.x에서 조사했습니다. 프로젝트 버전 고정(`.nvmrc`, `engines`)은 스캐폴딩 시 결정합니다.
- `npm install` → `npm run dev` (개발 실행, main/preload 변경 시 자동 재시작), `npm run build`, `npm run typecheck`, `npm test`.
- 설치 파일 빌드: `npm run dist:mac`(dmg, arm64·x64), `npm run dist:win`(NSIS exe, x64). 결과는 `dist/`. macOS는 Developer ID로 서명되며, 공증까지 하려면 `xcrun notarytool store-credentials "nib-notary"`로 인증 정보를 키체인에 저장한 뒤 `APPLE_KEYCHAIN_PROFILE=nib-notary npm run dist:mac`으로 빌드합니다(인증서가 없으면 서명 단계에서 실패). 아이콘은 `build/icon.png`(macOS, 1024px, 가장자리 100px 투명 여백)와 `build/icon.ico`(Windows).

## 문서

- [제품 명세](docs/PRODUCT_SPEC.md)
- [기술 설계](docs/TECHNICAL_DESIGN.md)
- [로드맵](docs/ROADMAP.md)
- [작업 지침](CLAUDE.md)

## 라이선스

[MIT](LICENSE)
