---
layout: post
title: tmux 사용 설명서와 필수 명령어
date: 2026-10-27
description: 원격 서버에서 장기 실험을 돌릴 때 필요한 tmux 세션·window·pane 사용법과 종료·복구 요령.
published: true
tags: [tools]
---

## 개념과 입력법

- **session**: 작업의 최상위 묶음 (`research`, `notes` 등).
- **window**: 한 세션 안의 탭.
- **pane**: 창 내부의 분할 터미널.
- **prefix**: 기본값 `Ctrl+b`. 아래의 `Ctrl+b → d`는 Ctrl+b를 누르고 **손을 뗀 뒤** `d`를 누르는 뜻.
- 원격 서버에서 시작한 tmux는 노트북이나 모바일 SSH 연결이 끊겨도 보통 계속 동작한다. **재부팅이나 전원 종료까지 막아주지는 않는다**.

## 세션 명령 — 반드시 익히기

| 셸 명령 | 동작 |
| --- | --- |
| `tmux new -s research` | 새 세션 생성·접속; 같은 이름 존재 시 오류 |
| `tmux new -A -s research` | 기존 세션이 있으면 접속, 없으면 생성 |
| `tmux ls` | 세션 목록 |
| `tmux attach -t research` | 기존 `research` 세션에 접속 |
| `tmux attach -d -t research` | 다른 클라이언트를 분리하고 이 기기에서 접속; 다른 사용 기기 화면을 끊음 |
| `tmux detach-client` | 현재 tmux 클라이언트 분리(세션 내부에서 실행할 경우) |
| `tmux rename-session -t research work` | 세션 이름 변경 |
| `tmux kill-session -t research` | 세션과 내부 작업 종료 가능 — **주의** |
| `tmux kill-server` | 모든 tmux 세션 종료 — **매우 주의** |
| `tmux list-windows -t research` | 창 목록 |
| `tmux list-panes -a` | 모든 pane 정보 |
| `tmux list-panes -F '#{pane_index} #{pane_id} #{pane_current_command}'` | vim-slime용 pane 확인 |

## 세션 안 단축키 (기본 키맵)

| 키 | 결과 |
| --- | --- |
| `Ctrl+b → d` | detach: **프로세스 유지**, 바깥 셸로 |
| `Ctrl+b → c` | 새 window |
| `Ctrl+b → n` / `p` | 다음 / 이전 window |
| `Ctrl+b → w` | window 목록/선택 |
| `Ctrl+b → 0…9` | window 번호로 이동 |
| `Ctrl+b → ,` | window 이름 변경 |
| `Ctrl+b → %` | 좌우 분할 (`%`는 보통 Shift+5) |
| `Ctrl+b → "` | 위아래 분할 |
| `Ctrl+b → 방향키` | pane 이동 |
| `Ctrl+b → o` | 다음 pane으로 이동 |
| `Ctrl+b → q` | pane 번호 표시 |
| `Ctrl+b → z` | 현재 pane 확대/복귀 (모바일에 유용) |
| `Ctrl+b → x` | 현재 pane 종료 확인 (실행 작업 종료될 수 있음) |
| `Ctrl+b → [` | 복사 모드/스크롤 보기 (`q`로 나가기) |
| `Ctrl+b → :` | tmux 명령 프롬프트 |
| `Ctrl+b → s` | 세션 목록/선택 |
| `Ctrl+b → ?` | 실제 사용 가능한 키 바인딩 목록 |

## 실제 작업 흐름

**노트북에서:**

```bash
ssh research-server
cd ~/projects/my-project
tmux new -A -s research
```

window 1에서 편집기나 AI 코딩 도구를 띄우고, `Ctrl+b → c`로 window 2를 만든 뒤 `julia --project=.` 같은 장기 실행 작업을 둔다. 완료 전 노트북을 닫을 때 `Ctrl+b → d`.

**모바일 SSH 앱(예: Termius):** VPN 등으로 서버에 접속 → `tmux attach -t research`. `Ctrl+b → w`로 window를 선택. 노트북에서 다시 이어서 사용하려면 모바일에서 먼저 detach.

## 종료·중단의 차이

| 동작 | 무슨 일이 생기나? |
| --- | --- |
| `Ctrl+b → d` | tmux 화면만 떠남. 실행 중 작업 유지 |
| SSH 연결 종료 | tmux가 살아 있다면 내부 작업 유지 |
| `Ctrl+c` | **현재 foreground 프로세스에 중단 신호**; Julia 실험이나 AI 실행 중단 가능 |
| `exit` / `Ctrl+d` | 현재 셸 종료. 마지막 pane이라면 session도 종료될 수 있음 |
| `tmux kill-session` | 해당 세션의 프로세스 종료 가능 |
| 서버 재부팅 | tmux 프로세스와 메모리 상태 소실 |

## 여러 기기에서 동시에 연결할 때

같은 tmux 세션에 두 화면을 동시에 attach하면 크기 제한·입력 충돌이 생길 수 있다. **기기 변경 시 detach → 다른 기기 attach**가 가장 간단하다. 여러 기기로 붙어도 별도의 독립 복제본이 생기는 것이 아니다.

## REPL / Claude Code 주의

- AI 대화, REPL의 변수 상태는 **그 프로세스가 살아 있는 동안만** 유지된다. 중요한 결과는 반드시 파일로 저장.
- Julia 장기 실험은 AI 대화 창과 다른 window/session에서 실행해 중단 위험을 줄인다.
- tmux의 기본 prefix와 사용자 `~/.tmux.conf` 매핑은 다를 수 있다: `tmux list-keys`로 확인.
- tmux 세션이 존재해도 Claude/Codex 프로세스가 이미 종료됐으면 대화는 남아 있지 않을 수 있다.

## 복구 및 진단

```bash
hostname                       # 접속한 서버가 맞는지 먼저 확인
tmux -V
tmux ls
tmux list-windows -t research
tmux show-options -g | head
```

`can't find session`이면 이름을 `tmux ls`로 확인. `duplicate session`이면 `tmux attach -t 이름` 사용. 화면이 이상하면 `Ctrl+b → z` 확대, 창 크기 확인, 실행 중 프로그램 강제 종료 전에 로그 검사.
