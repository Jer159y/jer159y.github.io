const $ = selector => document.querySelector(selector);
const NS = 'http://www.w3.org/2000/svg';
const CHART_TOP = 18;
const CHART_BOTTOM = 210;
const NORMAL_BLUE = '#1769b3';
const DEPARTURE_RED = '#c83a3a';
const copy = {
  single: {
    kind: 'SINGLE NODE EPILEPTOR', title: '신호의 흔들림이 커질 때',
    desc: '표준편차 σ와 순열 엔트로피를 함께 바꾸며 정상 이탈을 살펴봅니다.',
    unit: 'σ', axis: '표준편차 σ · 커질수록 전이 방향 →', start: '낮은 σ', end: '높은 σ',
    caveat: '단일 노드 곡선에는 관찰된 재상승을 다루기 위해 사후에 더한 탐색적 기준이 적용됐습니다. 이 기준으로 모델 선택과 독립 시험을 다시 수행한 확정 결과는 아닙니다.',
    waveNames: ['신호 x₂ − x₁'], colors: ['#168d94']
  },
  multi: {
    kind: 'THREE NODE EPILEPTOR', title: '연결된 세 노드의 평균이 낮아질 때',
    desc: '노드 평균과 표준편차를 함께 바꾸며 정상 이탈을 살펴봅니다.',
    unit: '평균', axis: '노드 평균 · 낮아질수록 전이 방향 →', start: '높은 평균', end: '낮은 평균',
    caveat: '3노드 모델은 정상 학습 범위에서도 생존율이 출렁이며 간헐적인 거짓 이탈을 보였습니다.',
    waveNames: ['노드 1', '노드 2', '노드 3'], colors: ['#168d94', '#d18a63', '#8074bb']
  }
};
let curves, trajectories;
let mode = 'single', index = 0;

function add(parent, tag, attrs = {}, label) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (label !== undefined) node.textContent = label;
  parent.appendChild(node);
  return node;
}

function episodeFromSamples(points, kind) {
  const crossings = points.filter(row => row[0] >= 5 && row.slice(1).some(value => value <= -0.5));
  let onset = crossings.length ? crossings[0][0] : null;
  let offset = crossings.length ? Math.min(points.at(-1)[0], crossings.at(-1)[0] + 1) : null;
  if (kind === 'single') {
    let sustained = 0;
    for (let i = 40; i < points.length; i += 4) {
      const values = points.slice(i - 40, i).map(row => row[1]);
      const sorted = [...values].sort((a, b) => a - b);
      const median = (sorted[19] + sorted[20]) / 2;
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
      sustained = median > 0.910824 || deviation < 0.0486308 ? sustained + 1 : 0;
      if (sustained >= 5) {
        onset = onset === null ? points[i][0] : Math.min(onset, points[i][0]);
        offset = points.at(-1)[0];
        break;
      }
    }
  }
  return {onset, offset};
}

function addColoredTrace(svg, points, series, x, y, onset, offset, normalColor, departureColor, width) {
  const render = (start, end, color) => {
    if (end <= start) return;
    const part = points.slice(start, end + 1);
    const d = part.map((row, i) => `${i ? 'L' : 'M'}${x(row[0]).toFixed(1)} ${y(row[series]).toFixed(1)}`).join(' ');
    add(svg, 'path', {d, fill:'none', stroke:color, 'stroke-width':width, 'stroke-linejoin':'round'});
  };
  let start = 0;
  let departed = onset !== null && (points[0][0] >= onset && points[0][0] <= offset);
  for (let i = 1; i < points.length; i++) {
    const midpoint = (points[i-1][0] + points[i][0]) / 2;
    const next = onset !== null && midpoint >= onset && midpoint <= offset;
    if (next !== departed) {
      render(start, i, departed ? departureColor : normalColor);
      start = i - 1;
      departed = next;
    }
  }
  render(start, points.length - 1, departed ? departureColor : normalColor);
}

let gtData;
function drawGroundTruth() {
  const trace = gtData.traces[Number($('#gt-excitability').value)];
  const svg = $('#gt-trajectory-chart');
  svg.replaceChildren();
  const left = 46, right = 730, top = 18, bottom = 220;
  const x = time => left + time / gtData.metadata.rolloutSeconds * (right - left);
  const y = value => bottom - (value + 3) / 6 * (bottom - top);
  for (const value of [-3,-2,-1,0,1,2,3]) {
    const py = y(value);
    add(svg,'line',{x1:left,y1:py,x2:right,y2:py,stroke:value===0?'#c2cdd3':'#e6ecef'});
    add(svg,'text',{x:left-8,y:py+4,'text-anchor':'end',fill:'#6e838e','font-size':11},String(value));
  }
  for (const time of [0,35,70,105,140]) {
    add(svg,'text',{x:x(time),y:bottom+21,'text-anchor':'middle',fill:'#6e838e','font-size':11},`${time}s`);
  }
  const thresholdY = y(-0.5);
  add(svg,'line',{x1:left,y1:thresholdY,x2:right,y2:thresholdY,stroke:'#9fabb3','stroke-dasharray':'5 5'});
  if (trace.onset !== null) {
    add(svg,'rect',{x:x(trace.onset),y:top,width:x(trace.offset)-x(trace.onset),height:bottom-top,fill:'#c83a3a','fill-opacity':0.065});
    add(svg,'line',{x1:x(trace.onset),y1:top,x2:x(trace.onset),y2:bottom,stroke:DEPARTURE_RED,'stroke-dasharray':'4 4'});
  }
  addColoredTrace(svg,trace.samples,1,x,y,trace.onset,trace.offset,NORMAL_BLUE,DEPARTURE_RED,1.8);
  const x0 = trace.x0.toFixed(2).replace('-', '−');
  $('#gt-x0-value').textContent = `x₀ = ${x0}`;
  $('#gt-summary').textContent = trace.onset === null
    ? `x₀ = ${x0}: 140초 동안 −0.5 기준의 정상 이탈이 관찰되지 않았습니다.`
    : `x₀ = ${x0}: ${trace.onset.toFixed(1)}초에 처음 −0.5 아래로 내려갑니다. 빨간 구간은 발작 유사 이탈을 보여 줍니다.`;
  svg.setAttribute('aria-label',`Epileptor GT x0 ${x0}. ${trace.onset === null ? '140초 동안 정상 이탈 없음' : `${trace.onset.toFixed(1)}초에 정상 이탈 시작`}. 파랑은 정상형, 빨강은 발작 유사 이탈 구간.`);
  const scroller = svg.parentElement;
  scroller.scrollLeft = trace.onset === null ? 0 : x(trace.onset) / 760 * svg.clientWidth - scroller.clientWidth / 2;
}

async function initGroundTruth() {
  try {
    const response = await fetch('./data/gt-parameter-trajectories.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    gtData = await response.json();
    $('#gt-excitability').max = String(gtData.traces.length - 1);
    $('#gt-excitability').addEventListener('input', drawGroundTruth);
    drawGroundTruth();
  } catch (error) {
    $('#gt-summary').textContent = '참조 모형 궤적을 읽지 못했습니다.';
    console.error(error);
  }
}
function accent() { return getComputedStyle($('.poster-explorer')).getPropertyValue('--pe-accent').trim() || '#168d94'; }
function setMode(next) {
  mode = next;
  const c = copy[mode], d = curves[mode];
  index = d.scdt.reduce((best, point, i) => Math.abs(point.x-d.modelThreshold) < Math.abs(d.scdt[best].x-d.modelThreshold) ? i : best, 0);
  for (const key of ['single', 'multi']) {
    const tab = $(`#tab-${key}`);
    tab.setAttribute('aria-selected', String(key === mode));
    tab.tabIndex = key === mode ? 0 : -1;
  }
  $('#experiment-panel').setAttribute('aria-labelledby', `tab-${mode}`);
  $('#experiment-kind').textContent = c.kind;
  $('#experiment-title').textContent = c.title;
  $('#experiment-desc').textContent = c.desc;
  $('#threshold-value').textContent = `${c.unit} ${d.modelThreshold.toFixed(4)}`;
  $('#threshold-compare').textContent = `참조 모형 ${d.gtThreshold.toFixed(4)} · 차이 ${Math.abs(d.modelThreshold-d.gtThreshold).toFixed(4)}`;
  $('#axis-label').textContent = c.axis;
  $('#axis-start').textContent = c.start;
  $('#axis-end').textContent = c.end;
  $('#chart-caveat').textContent = c.caveat;
  $('#coordinate').max = String(d.scdt.length - 1);
  $('#coordinate').value = String(index);
  drawChart();
  updateSelection();
}
function drawChart() {
  const svg = $('#chart'), d = curves[mode];
  svg.replaceChildren();
  const all = [...d.scdt, ...d.gt];
  const min = Math.min(...all.map(p => p.x)), max = Math.max(...all.map(p => p.x));
  const left = 45, right = 727, top = CHART_TOP, bottom = CHART_BOTTOM;
  const x = value => left + (mode === 'multi' ? max-value : value-min) / (max-min) * (right-left);
  const y = rate => bottom-rate*(bottom-top);
  for (const rate of [0,.25,.5,.75,1]) {
    const py = y(rate);
    add(svg,'line',{x1:left,y1:py,x2:right,y2:py,stroke:rate===.5?'#a9b2b8':'#e5e8ea','stroke-dasharray':rate===.5?'5 5':'none'});
    add(svg,'text',{x:32,y:py+4,'text-anchor':'end',fill:'#7a838a','font-size':12},String(Math.round(rate*100)));
  }
  for (const [value,color] of [[d.gtThreshold,'#d18a63'],[d.modelThreshold,accent()]]) {
    add(svg,'line',{x1:x(value),y1:top,x2:x(value),y2:bottom,stroke:color,'stroke-dasharray':'4 5'});
  }
  const path = points => points.map((p,i)=>`${i?'L':'M'}${x(p.x).toFixed(1)} ${y(p.survivors/p.total).toFixed(1)}`).join(' ');
  add(svg,'path',{d:path(d.gt),fill:'none',stroke:'#d18a63','stroke-width':2.5});
  add(svg,'path',{d:path(d.scdt),fill:'none',stroke:accent(),'stroke-width':3});
  d.scdt.forEach((p,i) => {
    const circle=add(svg,'circle',{cx:x(p.x),cy:y(p.survivors/p.total),r:4,fill:accent(),role:'presentation'});
    circle.style.cursor='pointer';
    circle.addEventListener('click',()=>select(i));
  });
  add(svg,'line',{id:'selected-line',x1:0,y1:top,x2:0,y2:bottom,stroke:'#343a40','stroke-width':1.2});
  add(svg,'circle',{id:'selected-dot',cx:0,cy:0,r:7,fill:'white',stroke:accent(),'stroke-width':3});
  add(svg,'rect',{x:left,y:top,width:right-left,height:bottom-top,fill:'transparent',style:'cursor:crosshair'}).addEventListener('pointerdown',event=>{
    const box=svg.getBoundingClientRect();
    const px=(event.clientX-box.left)/box.width*760;
    const closest=d.scdt.reduce((best,p,i)=>Math.abs(x(p.x)-px)<Math.abs(x(d.scdt[best].x)-px)?i:best,0);
    select(closest);
  });
  svg.dataset.min=min; svg.dataset.max=max;
  svg.setAttribute('aria-label',`${mode==='single'?'단일 노드':'3노드'}의 정상 유지 비율. 좌표를 선택하면 아래에 해당 좌표의 생성 궤적이 표시됩니다.`);
}
function drawTrajectory() {
  const svg=$('#trajectory-chart'), points=trajectories[mode][index].samples, c=copy[mode];
  svg.replaceChildren();
  const left=46,right=730,top=14,bottom=212;
  const values=points.flatMap(row=>row.slice(1));
  const lo=Math.min(...values), hi=Math.max(...values), span=Math.max(hi-lo,.1);
  const min=lo-.06*span,max=hi+.06*span;
  const x=t=>left+(t/points[points.length-1][0])*(right-left);
  const y=v=>bottom-(v-min)/(max-min)*(bottom-top);
  for(let k=0;k<=4;k++) {
    const value=min+(max-min)*k/4, py=y(value);
    add(svg,'line',{x1:left,y1:py,x2:right,y2:py,stroke:'#e5e8ea'});
    add(svg,'text',{x:left-7,y:py+4,'text-anchor':'end',fill:'#7a838a','font-size':10},value.toFixed(1));
  }
  for(let k=0;k<=4;k++) {
    const t=points[points.length-1][0]*k/4,px=x(t);
    add(svg,'text',{x:px,y:bottom+20,'text-anchor':'middle',fill:'#7a838a','font-size':10},`${Math.round(t)}s`);
  }
  const episode=episodeFromSamples(points,mode);
  const normalColors=[NORMAL_BLUE,'#4c8dd4','#8ab7e8'];
  const departureColors=[DEPARTURE_RED,'#df6767','#ee9797'];
  c.waveNames.forEach((_,series)=>addColoredTrace(svg,points,series+1,x,y,episode.onset,episode.offset,normalColors[series],departureColors[series],series===0?1.8:1.3));
  if(mode==='single') {
    const py=y(-.5);
    if(py>=top && py<=bottom) add(svg,'line',{x1:left,y1:py,x2:right,y2:py,stroke:'#a5aab0','stroke-dasharray':'4 4'});
  }
  const label=mode==='single'?'단일 신호 x₂−x₁': '세 노드의 x₂−x₁ 신호';
  svg.setAttribute('aria-label',`${copy[mode].unit} ${curves[mode].scdt[index].x.toFixed(4)}에서 생성한 ${label}의 시간 궤적`);
  $('#trajectory-caption').textContent=`${label} · 파랑은 정상형 구간, 빨강은 이탈 기준에 걸린 구간입니다. 화면용 희소 표본의 색 판정은 공식 30회 집계와 다를 수 있습니다. 이탈 뒤 출력 포화는 실제 발작 파형이 아닙니다.`;
}
function select(i){index=i;$('#coordinate').value=String(i);updateSelection();}
function updateSelection() {
  const d=curves[mode], p=d.scdt[index], c=copy[mode], rate=p.survivors/p.total;
  $('#coordinate-value').textContent=`${c.unit} = ${p.x.toFixed(4)}`;
  $('#trajectory-coordinate').textContent=`${c.unit} = ${p.x.toFixed(4)}`;
  $('#survivor-count').textContent=p.survivors;
  $('#result-explanation').textContent=rate===1?'모든 반복 궤적이 관찰 시간 동안 정상을 유지했습니다.':rate===0?'모든 반복 궤적이 정상 이탈 기준에 걸렸습니다.':`${p.total-p.survivors}개는 정상 이탈 기준에 걸렸습니다.`;
  const dots=$('#dot-matrix');dots.replaceChildren();
  dots.setAttribute('aria-label',`총 ${p.total}개 중 정상 유지 ${p.survivors}개, 이탈 ${p.total-p.survivors}개`);
  for(let j=0;j<p.total;j++){const dot=document.createElement('i');dot.setAttribute('aria-hidden','true');if(j>=p.survivors)dot.className='departed';dots.appendChild(dot);}
  const min=Number($('#chart').dataset.min),max=Number($('#chart').dataset.max);
  const px=45+(mode==='multi'?max-p.x:p.x-min)/(max-min)*682;
  $('#selected-line').setAttribute('x1',px);$('#selected-line').setAttribute('x2',px);
  $('#selected-dot').setAttribute('cx',px);$('#selected-dot').setAttribute('cy',CHART_BOTTOM-rate*(CHART_BOTTOM-CHART_TOP));
  const chartScroll=$('#chart').parentElement;
  if(chartScroll.scrollWidth>chartScroll.clientWidth){
    chartScroll.scrollLeft=px/760*$('#chart').clientWidth-chartScroll.clientWidth/2;
  }
  drawTrajectory();
}
async function init(){
  try {
    const responses=await Promise.all([fetch('./data/curves.json'),fetch('./data/trajectories.json')]);
    for(const response of responses)if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const [curveData, trajectoryData]=await Promise.all(responses.map(r=>r.json()));
    curves=curveData;
    trajectories=trajectoryData;
    for(const key of ['single','multi']){
      if(curves[key].scdt.length!==trajectories[key].length||curves[key].scdt.some((p,i)=>Math.abs(p.x-trajectories[key][i].x)>1e-6))throw new Error(`${key} trajectory coordinate mismatch`);
      $(`#tab-${key}`).addEventListener('click',()=>setMode(key));
    }
    $('.poster-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const next=mode==='single'?'multi':'single';setMode(next);$(`#tab-${next}`).focus();});
    $('#coordinate').addEventListener('input',event=>select(Number(event.target.value)));
    $('#departure-example').addEventListener('click',()=>{
      const examples=trajectories[mode];
      let example=examples.findIndex(trace=>{
        const trough=trace.samples.find(row=>row[0]>=25 && row[0]<=110 && row.slice(1).some(value=>value<=-0.5));
        return trough!==undefined;
      });
      if(example<0)example=examples.findIndex(trace=>episodeFromSamples(trace.samples,mode).onset!==null);
      if(example>=0)select(example);
    });
    setMode('single');
  }catch(error){$('#experiment-panel').innerHTML='<p class="load-error">실험 데이터를 읽지 못했습니다. GitHub Pages 또는 로컬 Jekyll 서버에서 열어 주세요.</p>';console.error(error);}
}
init();
initGroundTruth();
