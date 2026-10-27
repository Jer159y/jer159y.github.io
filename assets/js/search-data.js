// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "about",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-cv",
          title: "cv",
          description: "Education, research interests, and contact information.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/cv/";
          },
        },{id: "nav-projects",
          title: "projects",
          description: "Research and experiments I want to share.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/projects/";
          },
        },{id: "nav-notes",
          title: "notes",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/blog/";
          },
        },{id: "nav-lab",
          title: "lab",
          description: "Interactive experiments that run in the browser.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/lab/";
          },
        },{id: "post-tmux-사용-설명서와-필수-명령어",
        
          title: "tmux 사용 설명서와 필수 명령어",
        
        description: "원격 서버에서 장기 실험을 돌릴 때 필요한 tmux 세션·window·pane 사용법과 종료·복구 요령.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/tmux-guide/";
          
        },
      },{id: "post-neovim-latex-실전-가이드",
        
          title: "Neovim × LaTeX 실전 가이드",
        
        description: "VimTeX, latexmk, Skim으로 논문과 한국어 Beamer를 편집·컴파일·미리보기하는 방법.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/neovim-latex-guide/";
          
        },
      },{id: "articles-project-1",
          title: 'project 1',
          description: "with background image",
          section: "Articles",handler: () => {
              window.location.href = "/articles/1_project/";
            },},{id: "books-the-godfather",
          title: 'The Godfather',
          description: "",
          section: "Books",handler: () => {
              window.location.href = "/books/the_godfather/";
            },},{id: "news-a-simple-inline-announcement",
          title: 'A simple inline announcement.',
          description: "",
          section: "News",},{id: "news-a-long-announcement-with-details",
          title: 'A long announcement with details',
          description: "",
          section: "News",handler: () => {
              window.location.href = "/news/announcement_2/";
            },},{id: "news-a-simple-inline-announcement-with-markdown-emoji-sparkles-smile",
          title: 'A simple inline announcement with Markdown emoji! :sparkles: :smile:',
          description: "",
          section: "News",},{id: "projects-dynamicsmetrics-jl",
          title: 'DynamicsMetrics.jl',
          description: "An early-stage Julia toolkit for evaluating predictions of dynamical systems.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/dynamicsmetrics/";
            },},{id: "projects-ensemble-reservoir-computing-for-spatiotemporal-chaos",
          title: 'Ensemble reservoir computing for spatiotemporal chaos',
          description: "Two ensemble strategies for long-term prediction of the Kuramoto–Sivashinsky equation. Poster, KSIAM Annual Meeting 2026.05.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/ensemble-rc-spatiotemporal-chaos/";
            },},{
        id: 'social-email',
        title: 'email',
        section: 'Socials',
        handler: () => {
          window.open("mailto:%6C%6F%6F%61%63%6B%65%72%30%39@%75%6E%69%73%74.%61%63.%6B%72", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/Jer159y", "_blank");
        },
      },{
        id: 'social-rss',
        title: 'RSS Feed',
        section: 'Socials',
        handler: () => {
          window.open("/feed.xml", "_blank");
        },
      },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];
