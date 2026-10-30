const $ = (selector) => document.querySelector(selector);
const svgNS = 'http://www.w3.org/2000/svg';
const copy = {
  single: {
    kind: 'SINGLE NODE EPILEPTOR', title: '신호의 흔들림이 커질 때',
    desc: '신호의 표준편차(σ)를 조건으로 바꾸며 정상 유지 비율을 살펴봅니다. 가로축은 측정 통계값입니다.',
    unit: 'σ', digits: 4, axis: '표준편차 σ · 커질수록 전이 방향 →', start: '낮은 σ', end: '높은 σ',
    caveat: '단일 노드 그래프는 관찰된 재상승을 다루기 위해 사후에 더한 탐색적 기준을 적용했습니다. 이 기준으로 모델 선택과 독립 시험을 다시 수행한 확정 결과는 아닙니다.',
    figure: './assets/single-trajectories.png', statistics: './assets/single-statistics.png',
    figureAlt: '단일 노드 실험의 정상 및 정상 이탈 조건에서 참조 모형과 디지털 트윈의 대표 궤적 비교',
    figureCaption: '단일 노드의 이탈 트윈 파형은 지연 이탈을 보이는 선택 사례입니다. 이탈 후 평평한 부분은 출력 포화로, 실제 발작 파형을 뜻하지 않습니다.'
  },
  multi: {
    kind: 'THREE NODE EPILEPTOR', title: '연결된 세 노드의 평균이 낮아질 때',
    desc: '세 노드에서 측정한 신호 평균을 조건으로 바꾸며 정상 유지 비율을 살펴봅니다. 전이 방향으로 갈수록 평균이 낮아집니다.',
    unit: '평균', digits: 4, axis: '노드 평균 · 낮아질수록 전이 방향 →', start: '높은 평균', end: '낮은 평균',
    caveat: '3노드 모델의 학습 범위 안에서도 생존율이 출렁입니다. 정상 검증 120초에서는 0/32가 이탈했지만, 그래프는 200초 시험이며 간헐적 거짓 이탈이 나타났습니다.',
    figure: './assets/multi-trajectories.png', statistics: './assets/multi-statistics.png',
    figureAlt: '3노드 실험의 정상 및 정상 이탈 조건에서 참조 모형과 디지털 트윈의 대표 궤적 비교',
    figureCaption: '3노드 이탈 파형은 코호트에서 이탈 시점이 중앙값에 가까운 대표 사례입니다. 이탈 후 트윈 출력은 하한 근처에 포화됩니다.'
  }
};

let data;
let mode = 'single';
let index = 0;

function addSvg(parent, tag, attrs = {}, text) {
  const node = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function setMode(next) {
  mode = next;
  const c = copy[mode];
  const d = data[mode];
  index = d.scdt.reduce((best, point, i) => Math.abs(point.x - d.modelThreshold) < Math.abs(d.scdt[best].x - d.modelThreshold) ? i : best, 0);
  for (const key of ['single', 'multi']) {
    const tab = $(`#tab-${key}`);
    tab.setAttribute('aria-selected', String(key === mode));
    tab.tabIndex = key === mode ? 0 : -1;
  }
  $('#experiment-panel').setAttribute('aria-labelledby', `tab-${mode}`);
  $('#experiment-kind').textContent = c.kind;
  $('#experiment-title').textContent = c.title;
  $('#experiment-desc').textContent = c.desc;
  $('#threshold-value').textContent = `${c.unit} ${d.modelThreshold.toFixed(c.digits)}`;
  $('#threshold-compare').textContent = `참조 모형 ${d.gtThreshold.toFixed(c.digits)} · 차이 ${Math.abs(d.modelThreshold - d.gtThreshold).toFixed(4)}`;
  $('#axis-start').textContent = c.start;
  $('#axis-end').textContent = c.end;
  $('#axis-label').textContent = c.axis;
  $('#chart-caveat').textContent = c.caveat;
  $('#coordinate').max = String(d.scdt.length - 1);
  $('#coordinate').value = String(index);
  setFigure(mode);
  drawChart();
  updateSelection();
}

function setFigure(which) {
  const c = copy[which];
  $('#trajectory-image').src = c.figure;
  $('#trajectory-image').alt = c.figureAlt;
  $('#statistics-image').src = c.statistics;
  $('#statistics-image').alt = `${c.title} · 숨은 파라미터와 통계값의 관계`;
  $('#figure-caption').textContent = c.figureCaption;
  document.querySelectorAll('[data-figure]').forEach(button => button.classList.toggle('active', button.dataset.figure === which));
}

function drawChart() {
  const svg = $('#chart');
  svg.replaceChildren();
  const d = data[mode];
  const all = [...d.scdt, ...d.gt];
  const min = Math.min(...all.map(p => p.x));
  const max = Math.max(...all.map(p => p.x));
  const reverse = mode === 'multi';
  const left = 45, right = 727, top = 22, bottom = 285;
  const x = value => left + (reverse ? (max - value) : (value - min)) / (max - min) * (right - left);
  const y = value => bottom - value * (bottom - top);
  for (const rate of [0, .25, .5, .75, 1]) {
    const py = y(rate);
    addSvg(svg, 'line', {x1:left,y1:py,x2:right,y2:py,stroke:rate === .5 ? '#8ba5a8' : '#dfe9e8','stroke-dasharray':rate === .5 ? '5 5' : 'none'});
    addSvg(svg, 'text', {x:31,y:py+4,'text-anchor':'end',fill:'#6d858c','font-size':12}, `${Math.round(rate*100)}`);
  }
  addSvg(svg, 'line', {x1:left,y1:bottom,x2:right,y2:bottom,stroke:'#9fb7b9'});
  const modelX = x(d.modelThreshold), gtX = x(d.gtThreshold);
  addSvg(svg, 'line', {x1:gtX,y1:top,x2:gtX,y2:bottom,stroke:'#ed8c65','stroke-width':1.5,'stroke-dasharray':'4 5'});
  addSvg(svg, 'line', {x1:modelX,y1:top,x2:modelX,y2:bottom,stroke:'#088e88','stroke-width':1.5,'stroke-dasharray':'4 5'});
  const path = points => points.map((p,i) => `${i ? 'L':'M'}${x(p.x).toFixed(1)} ${y(p.survivors/p.total).toFixed(1)}`).join(' ');
  addSvg(svg, 'path', {d:path(d.gt),fill:'none',stroke:'#ee8860','stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'});
  addSvg(svg, 'path', {d:path(d.scdt),fill:'none',stroke:'#078e8a','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'});
  for (const point of d.scdt) addSvg(svg, 'circle', {cx:x(point.x),cy:y(point.survivors/point.total),r:3.3,fill:'#078e8a'});
  addSvg(svg, 'line', {id:'selected-line',x1:0,y1:top,x2:0,y2:bottom,stroke:'#10283a','stroke-width':1.5});
  addSvg(svg, 'circle', {id:'selected-dot',cx:0,cy:0,r:7,fill:'#fff',stroke:'#087e7b','stroke-width':3});
  addSvg(svg, 'rect', {x:left,y:top,width:right-left,height:bottom-top,fill:'transparent',style:'cursor:crosshair'}).addEventListener('pointerdown', event => {
    const bounds = svg.getBoundingClientRect();
    const px = (event.clientX - bounds.left) / bounds.width * 760;
    index = d.scdt.reduce((best,p,i) => Math.abs(x(p.x)-px) < Math.abs(x(d.scdt[best].x)-px) ? i : best,0);
    $('#coordinate').value = String(index);
    updateSelection();
  });
  svg.setAttribute('aria-label', `${mode === 'single' ? '단일 노드' : '3노드'} 정상 유지 비율 그래프. 디지털 트윈 50% 경계 ${d.modelThreshold.toFixed(4)}, 참조 모형 ${d.gtThreshold.toFixed(4)}. 슬라이더 또는 그래프를 조작하면 30개 반복 결과가 표시됩니다.`);
  svg.dataset.min = min;
  svg.dataset.max = max;
}

function updateSelection() {
  const d = data[mode], c = copy[mode], p = d.scdt[index];
  $('#coordinate-value').textContent = `${c.unit} = ${p.x.toFixed(c.digits)}`;
  $('#survivor-count').textContent = p.survivors;
  const rate = p.survivors / p.total;
  $('#result-explanation').textContent = rate === 1 ? '30개 모두 관찰 시간 동안 정상을 유지했습니다.' : rate === 0 ? '30개 모두 정해 둔 정상 이탈 기준에 걸렸습니다.' : `${p.total-p.survivors}개는 정해 둔 정상 이탈 기준에 걸렸습니다.`;
  const dots = $('#dot-matrix');
  dots.replaceChildren();
  dots.setAttribute('aria-label', `총 ${p.total}개 중 정상 유지 ${p.survivors}개, 이탈 ${p.total-p.survivors}개`);
  for (let i=0;i<p.total;i++) {
    const dot = document.createElement('i');
    dot.setAttribute('aria-hidden','true');
    if (i >= p.survivors) dot.className = 'departed';
    dots.appendChild(dot);
  }
  const min = Number($('#chart').dataset.min), max = Number($('#chart').dataset.max);
  const px = 45 + (mode === 'multi' ? (max-p.x) : (p.x-min))/(max-min)*682;
  const py = 285-rate*263;
  const line = $('#selected-line'), circle = $('#selected-dot');
  line.setAttribute('x1',px); line.setAttribute('x2',px);
  circle.setAttribute('cx',px); circle.setAttribute('cy',py);
}

async function init() {
  try {
    const response = await fetch('./data/curves.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    $('#tab-single').addEventListener('click', () => setMode('single'));
    $('#tab-multi').addEventListener('click', () => setMode('multi'));
    document.querySelector('.tabs').addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = mode === 'single' ? 'multi' : 'single';
      setMode(next);
      $(`#tab-${next}`).focus();
    });
    $('#coordinate').addEventListener('input', event => { index = Number(event.target.value); updateSelection(); });
    document.querySelectorAll('[data-figure]').forEach(button => button.addEventListener('click', () => setFigure(button.dataset.figure)));
    setMode('single');
  } catch (error) {
    $('#experiment-panel').innerHTML = '<p class="load-error">실험 데이터를 읽지 못했습니다. 웹 서버 또는 GitHub Pages에서 페이지를 열어 주세요.</p>';
    console.error(error);
  }
}
init();
