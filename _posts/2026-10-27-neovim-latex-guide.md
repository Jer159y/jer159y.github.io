---
layout: post
title: Neovim × LaTeX 실전 가이드
date: 2026-10-27
description: VimTeX, latexmk, Skim으로 논문과 한국어 Beamer를 편집·컴파일·미리보기하는 방법.
published: true
tags: [tools, latex]
---

Neovim에서 논문·한국어/영어 Beamer·TikZ를 편집하고 latexmk로 컴파일하며 Skim에서 PDF를 확인하는 실전 가이드.

## 1. 구성과 설치 전 점검

- Neovim: .tex 편집
- VimTeX: LaTeX 환경 인식, 컴파일 제어, SyncTeX, 오류·목차
- latexmk: 필요한 횟수만큼 컴파일하고 참고문헌 등을 처리
- MacTeX 또는 BasicTeX: 실제 TeX 엔진과 패키지 제공
- Skim: macOS PDF 뷰어, forward/inverse search
- texlab(선택): LSP 진단과 자동완성. VimTeX와 역할이 다름.

```bash
nvim --version
command -v latexmk
command -v pdflatex
command -v xelatex
command -v lualatex
command -v skim
command -v tlmgr
```

Skim은 앱이므로 `command -v skim`이 실패해도 설치되지 않았다는 뜻은 아니다. `ls /Applications/Skim.app` 또는 `open -a Skim`으로 확인한다. 이미 설치된 TeX 배포판은 중복 설치하지 않는다. 없다면 MacTeX 설치를 검토하고 터미널을 다시 연다.

## 2. 플러그인 없이 먼저 빌드

```bash
cd /path/to/latex-project
nvim main.tex
latexmk -pdf -interaction=nonstopmode -file-line-error main.tex
open -a Skim main.pdf
```

Neovim 내부에서 일회성 실행은 `:!latexmk -pdf -interaction=nonstopmode %`, PDF 열기는 `:!open -a Skim %:r.pdf`. 다중 파일 프로젝트에서 현재 파일(%)이 루트 문서가 아닐 수 있으므로 이때는 `main.tex`을 명시한다.

한국어 문서에서 XeLaTeX를 쓴다면 `latexmk -xelatex main.tex`. LuaLaTeX는 `latexmk -lualatex main.tex`. 프로젝트의 .latexmkrc 및 문서의 기존 엔진 설정이 우선이다.

## 3. lazy.nvim에서 VimTeX 설정

`~/.config/nvim/lua/plugins/vimtex.lua` (lazy.nvim이 해당 경로를 읽는 구성일 때):

```lua
return {
  {
    "lervag/vimtex",
    lazy = false,
    init = function()
      vim.g.vimtex_view_method = "skim"
      vim.g.vimtex_compiler_method = "latexmk"
    end,
  },
}
```

설정 후 Neovim을 재시작하고 `:Lazy sync`, `:VimtexInfo`로 확인. 직접 init.lua를 쓰는 경우에는 사용 중인 플러그인 관리자 형식에 맞게 등록한다. 모든 설정에 동일한 디렉터리 구조가 적용되는 것은 아니다.

## 4. 프로젝트별 엔진 설정 — 전역 XeLaTeX 강제하지 않기

영문 프로젝트는 pdfLaTeX, 한글 Beamer는 XeLaTeX 또는 LuaLaTeX가 적합할 수 있다. 전역에서 `-xelatex`를 강제하기보다 프로젝트 루트에 `.latexmkrc`를 둔다.

```perl
# .latexmkrc — XeLaTeX 프로젝트 예시
$pdf_mode = 5;
$xelatex = 'xelatex -synctex=1 -interaction=nonstopmode -file-line-error %O %S';
```

주의: 기존 .latexmkrc가 있다면 덮어쓰지 말고 확인. VimTeX와 latexmk의 옵션/설정에 따라 명령이 달라질 수 있으니 `latexmk -xelatex main.tex`를 먼저 테스트한다. 단순히 `latexmk -pdf`는 기본적으로 pdfLaTeX 경로일 수 있다.

## 5. 편집 → 자동 컴파일 → PDF 보기

1. 프로젝트 루트의 `main.tex`을 Neovim으로 연다.
2. `:VimtexInfo`에서 root, compiler, viewer를 확인한다.
3. 일반적인 VimTeX 기본 매핑: `\ll` 컴파일 토글, `\lv` 뷰어, `\le` 오류 목록, `\lt` 목차, `\lc` 생성 파일 정리.
4. `\ll`로 latexmk 연속 컴파일을 시작하면 저장할 때 변경을 감지해 다시 빌드한다. `:w` 후 PDF를 확인한다.
5. 실제 키 매핑은 `:nmap <localleader>` 또는 `:VimtexInfo`에서 확인. localleader나 사용자 설정에 따라 달라질 수 있다.

컴파일이 반복 실패하면 `:VimtexErrors`, `:messages`, `main.log`를 확인한다. 단순 저장만으로 자동 빌드하려면 latexmk의 연속 실행 상태가 유지되어야 한다.

## 6. Skim + SyncTeX 양방향 이동

- TeX → PDF: VimTeX의 `\lv` 또는 `:VimtexView`로 해당 소스 위치를 PDF에서 찾는다.
- PDF → TeX: Skim 설정에서 Sync(동기화)의 Preset을 Custom으로 지정하고 Neovim과 연동하는 역방향 검색 명령을 구성한다. 터미널/tmux 환경에서는 Neovim 서버 소켓과 `nvr`(neovim-remote)을 사용하는 방법이 일반적이다.
- 먼저 forward search만 검증하고, inverse search는 사용 중인 터미널(WezTerm), tmux, Neovim 서버 구성에 맞춰 설정한다. `nvr` 설치와 `NVIM_LISTEN_ADDRESS`/서버 주소가 일치해야 한다.
- `-synctex=1`이 활성화되어야 .synctex.gz를 생성할 수 있다.

## 7. 한국어 Beamer 최소 예시

```latex
% !TeX program = xelatex
\documentclass{beamer}
\usepackage{kotex}
\usepackage{fontspec}
\setmainfont{Noto Sans CJK KR}
\setsansfont{Noto Sans CJK KR}
\title{Physical Reservoir Computing}
\author{Research presentation}
\begin{document}
\frame{\titlepage}
\begin{frame}{핵심 아이디어}
물리적 동역학을 계산 자원으로 활용한다.
\end{frame}
\end{document}
```

폰트 이름은 로컬 설치 상태에 맞춰 바꾼다. `fc-list` 또는 macOS 서체 관리자에서 확인. `kotex`와 XeLaTeX 관련 패키지가 없으면 TeX 배포판에서 설치해야 한다. 발표 자료의 기존 preamble이 있다면 그것을 우선 사용한다.

## 8. 자주 겪는 문제

- `latexmk: command not found`: TeX 배포판 또는 PATH 확인(`/Library/TeX/texbin`).
- `Undefined control sequence`: 명령 오타, 패키지 누락, 엔진 불일치 점검.
- 한글 폰트 오류: XeLaTeX/LuaLaTeX 사용 여부와 실제 폰트 이름 확인.
- PDF 갱신 안 됨: `\ll`로 compiler가 실행 중인지, 저장했는지, 빌드 대상 root가 맞는지 확인.
- `\lv` 동작 안 함: Skim 설치 및 `:VimtexInfo`의 viewer 확인.
- `\lc` 정리 전에 삭제될 보조 파일 범위 확인. `latexmk -c`는 일반적으로 PDF를 유지하지만 사용자 정의 규칙을 확인한다.
- 다중 파일 프로젝트: `% !TeX root = main.tex` 지시문 또는 VimTeX의 root 탐지 설정 확인.

## 9. 최소 점검 체크리스트

- [ ]  `latexmk -v` 실행
- [ ]  `xelatex --version` 실행 (한글 문서)
- [ ]  `:VimtexInfo`에 compiler/viewer 표시
- [ ]  작은 샘플을 CLI에서 PDF로 컴파일
- [ ]  `\ll` 후 저장 시 PDF 갱신
- [ ]  Skim에서 PDF 열림
- [ ]  forward search 확인
- [ ]  필요하다면 inverse search 별도 구성

참고: [VimTeX 공식 README](https://github.com/lervag/vimtex), [latexmk CTAN](https://ctan.org/pkg/latexmk), [Skim](https://skim-app.sourceforge.io/).
