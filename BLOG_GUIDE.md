# 블로그 관리 가이드

이 사이트는 Jekyll(al-folio)로 만들어졌습니다. 웹 주소는 <https://jer159y.github.io/>이며, 저장소의 `main` 브랜치에 변경 사항을 올리면 GitHub Actions의 **Deploy site** 작업이 사이트를 빌드해 `gh-pages` 브랜치에 배포합니다.

## 로컬에서 보기와 끄기

터미널을 열고 먼저 저장소 폴더로 이동합니다.

```sh
cd ~/Documents/GitHub/jer159y.github.io
```

**Ruby 방식 (권장):** 이 Mac에는 Homebrew Ruby 3.3, Bundler 2.6.9, ImageMagick과 `vendor/jekyll-python`의 nbconvert가 설치되어 있습니다. 아래 명령은 필요한 실행 경로를 자동으로 잡고 사이트를 띄웁니다.

```sh
./bin/local
```

브라우저에서 <http://localhost:4000/>으로 접속합니다. 서버를 끄려면 **실행한 터미널에서 `Ctrl+C`**를 누르세요. `Ctrl+C`를 누르기 전까지 터미널을 열어 둡니다. 콘텐츠를 수정하면 Jekyll이 자동으로 다시 빌드합니다.

Ruby 의존성을 다시 설치해야 할 때는 다음 명령을 실행합니다.

```sh
PATH="$(brew --prefix ruby@3.3)/bin:$PATH" BUNDLE_PATH=vendor/bundle bundle install
```

**Docker 방식:** 이 Mac에는 Docker CLI, Compose, Colima가 설치되어 있습니다. Docker는 Colima 엔진을 먼저 켜야 합니다.

```sh
colima start
docker-compose up
```

브라우저에서 <http://localhost:8080/>으로 접속합니다. 사이트를 끄려면 `docker-compose up`을 실행한 터미널에서 `Ctrl+C`를 누르세요. Docker 엔진까지 끄고 싶다면 이어서 `colima stop`을 실행합니다. 첫 실행은 컨테이너 이미지 다운로드로 시간이 걸릴 수 있습니다.

빌드만 확인하려면 `./bin/local` 대신 `PATH="$(pwd)/vendor/jekyll-python/bin:$(brew --prefix ruby@3.3)/bin:$PATH" BUNDLE_PATH=vendor/bundle bundle exec jekyll build`를 실행합니다.

## 실제 사이트에 올리기

작성한 파일을 저장한 뒤 다음 명령을 실행합니다.

```sh
git add .
git commit -m "Update site content"
git push origin main
```

GitHub 저장소의 **Actions → Deploy site**에서 진행 상태를 확인합니다. **Settings → Pages**의 게시 소스는 `gh-pages` 브랜치여야 합니다. 배포가 끝나면 <https://jer159y.github.io/>에서 확인하세요. 수동 재배포는 **Actions → Deploy site → Run workflow**에서 실행할 수 있습니다.

## 콘텐츠 수정 위치

| 바꾸고 싶은 것 | 파일 |
| --- | --- |
| 이름, 소개, 메인 화면 링크 | `_config.yml`, `_pages/about.md` |
| CV 항목 | `_data/cv.yml` |
| 이메일과 소셜 링크 | `_data/socials.yml` |
| 새 프로젝트 | `_projects/프로젝트-이름.md` |
| 새 글 | `_posts/YYYY-MM-DD-글-이름.md` |

새 프로젝트는 아래 형식으로 만들면 프로젝트 페이지에 카드가 자동으로 나타납니다. `img`는 실제 이미지가 있을 때만 넣으세요.

```md
---
layout: page
title: Project title
description: One sentence about the project.
importance: 1
category: Research
---

여기에 프로젝트 배경, 본인이 맡은 일, 결과와 링크를 적습니다.
```

새 글은 날짜가 포함된 파일명과 아래 머리말을 사용합니다. 기존 `_posts` 파일은 테마 예시 또는 작성 중인 초안이라 `published: false`로 숨겨져 있습니다. 완성된 글은 `published: true`로 바꾸세요.

```md
---
layout: post
title: 글 제목
date: 2026-10-11
description: 목록에 표시할 짧은 설명
published: true
tags: [Mathematics]
---

본문을 여기에 작성합니다.
```

공개 글이 생긴 뒤 첫 화면에도 최신 글을 표시하고 싶다면 `_pages/about.md`의 `latest_posts.enabled`를 `true`로 바꾸면 됩니다. PDF CV를 올릴 때는 `assets/pdf/`에 파일을 넣고 `_pages/cv.md`의 머리말에 `cv_pdf: 파일명.pdf`를 추가하세요.
