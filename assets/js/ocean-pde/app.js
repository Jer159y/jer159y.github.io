import {models,sources,physics,purposes,defaultState,diagnostics,evaluate,storageEstimate} from './models.js';

const $=id=>document.getElementById(id);
let state=defaultState();
let toastTimer;
const costLabels=['','낮은 상태 부담','낮음–중간','층수에 비례','높음 · 3D','높음 · 3D 압력'];
const iconSVG=(color='#168e83')=>`<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="1.2"><path d="M9 21Q21 9 32 21T55 21M9 32Q21 20 32 32T55 32M9 43Q21 31 32 43T55 43"/><path d="M45 13l7 5-7 2M45 24l7 5-7 2M45 35l7 5-7 2"/></g></svg>`;
const sourceLinks=ids=>ids.map(id=>{const s=sources.find(s=>s.id===id);return `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title.split(' · ')[0]} ↗</a>`;}).join('');
const getPurpose=()=>purposes.find(p=>p.id===state.purpose);
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function formatTime(seconds){if(seconds<3600)return `${(seconds/60).toFixed(1)}<span>min</span>`;if(seconds<86400)return `${(seconds/3600).toFixed(1)}<span>h</span>`;return `${(seconds/86400).toFixed(1)}<span>d</span>`;}

function renderControls(){
  $('purpose-options').setAttribute('role','radiogroup');
  $('purpose-options').setAttribute('aria-label','예측 목적');
  $('purpose-options').innerHTML=purposes.map(p=>`<button type="button" role="radio" id="purpose-${p.id}" class="purpose-option" data-purpose="${p.id}" aria-checked="${p.id===state.purpose}" tabindex="${p.id===state.purpose?'0':'-1'}"><span class="purpose-icon" aria-hidden="true">${p.icon}</span><span><b>${p.name}</b><small>${p.description}</small></span><span class="radio-dot" aria-hidden="true"></span></button>`).join('');
  const mandatory=getPurpose().requirements;
  $('physics-options').innerHTML=physics.map(p=>`<label class="physics-option" for="phys-${p.id}"><input id="phys-${p.id}" type="checkbox" data-physics="${p.id}" ${state.requirements.includes(p.id)||mandatory.includes(p.id)?'checked':''} ${mandatory.includes(p.id)?'disabled':''}><span><b>${p.name}</b><small>${p.detail}</small></span>${mandatory.includes(p.id)?'<span class="locked">목적 필수</span>':''}</label>`).join('');
  $('geometry').value=state.geometry;$('budget').value=state.budget;
}

function renderResults(ranked){
  const eligible=ranked.filter(m=>m.eligible);const rejected=ranked.filter(m=>!m.eligible);
  $('scenario-title').textContent=getPurpose().name;
  $('candidate-count').textContent=`${eligible.length} / ${models.length} 후보`;
  if(eligible.length){
    const top=eligible[0];
    $('recommendation').innerHTML=`<article class="recommendation" data-top-model="${top.id}"><div class="rec-topline"><span>↗ 먼저 검토할 모델</span><span>현재 조건 기준 · 정확도 순위 아님</span></div><div class="rec-body"><div class="rec-header"><div><div class="model-kicker">MODEL ${top.number} / ${top.dimension}</div><h3>${top.name}</h3><p class="rec-korean">${top.korean}</p></div><div class="model-icon">${iconSVG(top.color)}</div></div><p class="rec-reason">${top.reason}</p><div class="rec-facts">${top.features.map(f=>`<span class="tag emphasis">${f}</span>`).join('')}<span class="tag">${costLabels[top.cost]}</span></div>${top.cautions.map(c=>`<p class="rec-caution">${c}</p>`).join('')}<div class="rec-footer"><button class="small-link" type="button" data-inspect="${top.id}">방정식과 한계 살펴보기 ↗</button><button class="text-btn" type="button" data-compare-add="${top.id}">${state.compare.includes(top.id)?'✓ 비교 중':'비교에 추가 +'}</button></div></div></article>`;
    const alt=eligible.slice(1,3);
    $('alternatives').innerHTML=alt.length?`<div class="alternatives">${alt.map(m=>`<article class="alternative"><div class="alt-header"><h4>${m.short}</h4><span class="tiny-index">${m.number}</span></div><p>${m.reason}</p>${m.cautions.length?`<p class="small-muted">△ ${m.cautions[0]}</p>`:''}<button type="button" class="small-link" data-inspect="${m.id}">다른 가정 살펴보기 ↗</button></article>`).join('')}</div>`:'';
  }else{
    const constraints=state.geometry==='flat'?'평면 2D 제한':state.geometry==='layered'?'유한층 제한':'현재 물리 조건';
    $('recommendation').innerHTML=`<article class="empty-result" data-empty="true"><div class="eyebrow">NO COMPATIBLE MODEL</div><h3>현재 조건을 동시에 만족하는 모델이 없습니다.</h3><p>${constraints}과 필수 물리가 충돌합니다. 수직가속도나 연속 T/S 구조가 필요하면 수직격자를 허용해야 합니다. 아래 제외 이유를 확인하고, 필요한 물리를 유지한 채 차원 제한부터 조정해 보세요.</p>${state.geometry!=='any'?'<button type="button" id="relax-geometry">수직 구조 제한 풀기 ↗</button>':'<button type="button" id="restore-scenario">현재 목적의 기본 설정으로 ↺</button>'}</article>`;
    $('alternatives').innerHTML='';
  }
  $('rejected-panel').hidden=!rejected.length;
  $('rejected-title').textContent=`현재 조건에서 제외된 ${rejected.length}개 모델 · 이유 확인`;
  $('rejected-list').innerHTML=rejected.map(m=>`<div class="rejected-item"><div><b>${m.short}</b><button type="button" data-inspect="${m.id}">상세 ↗</button></div><ul>${m.excluded.map(e=>`<li>— ${e}</li>`).join('')}</ul></div>`).join('');
}

function renderDiagnostics(){
  const d=diagnostics(state);
  $('diagnostics').innerHTML=`<div class="diagnostic"><small>ROSSBY NUMBER</small><b>${Number.isFinite(d.Ro)?(d.Ro<0.01?d.Ro.toPrecision(2):d.Ro.toFixed(2)):'∞'}</b><p>Ro · 이류 / 회전</p></div><div class="diagnostic"><small>ASPECT RATIO</small><b>${d.aspect<0.01?d.aspect.toPrecision(2):d.aspect.toFixed(2)}</b><p>H/L · 수심 / 규모</p></div><div class="diagnostic"><small>ADVECTION</small><b>${formatTime(d.advective)}</b><p>L/U · 이류 시간</p></div><div class="diagnostic"><small>EXTERNAL WAVE</small><b>${formatTime(d.wave)}</b><p>L/√(gH) · 장파 시간</p></div>`;
  const notes=[];
  if(Math.abs(state.lat)<5)notes.push('적도 부근: 이 도구의 중위도 QG는 제외됩니다. 다른 회전 모델에서는 적도 β-plane/구면 표현을 검토하세요.');
  else if(d.Ro>=0.3)notes.push('큰 Ro: 느린 지균 균형만 가정하기 어렵습니다. 이 선별 기준에서는 QG를 제외합니다.');
  else if(d.Ro>=0.1)notes.push('중간 Ro: QG를 쓰려면 비지균 오차를 더 넓은 방정식과 비교해 확인하세요.');
  else notes.push('작은 Ro는 QG 검토를 뒷받침합니다. 다만 필수 파동·성층 물리까지 자동으로 충족하는 것은 아닙니다.');
  if(d.aspect>=0.1)notes.push('H/L이 작지 않습니다. 수직가속도와 관심 파장의 분산 효과를 별도로 점검하세요.');
  $('regime-note').textContent=notes.join(' ');
}

const rows=[
  ['차원과 수직 구조','DIMENSION','dimension'],
  ['대표 방정식','EQUATIONS','equations'],
  ['상태변수','STATE','prognostic'],
  ['핵심 가정','ASSUMPTIONS','assumptions'],
  ['보존량과 조건','INVARIANTS','conservation'],
  ['공간·현상 규모','SPATIAL SCALES','scale'],
  ['시간 척도','TIME SCALES','time'],
  ['계산비용 구조','COMPUTATION','compute'],
  ['적합한 해양 문제','OCEAN TASKS','problems'],
  ['빠진 물리·한계','LIMITATIONS','limits'],
  ['준비할 입력','REQUIRED INPUTS','needs']
];
function renderComparison(ranked){
  $('compare-options').innerHTML=models.map(m=>`<button type="button" id="compare-${m.id}" class="compare-option" data-compare="${m.id}" aria-pressed="${state.compare.includes(m.id)}"><span aria-hidden="true">${state.compare.includes(m.id)?'✓':'+'}</span>${m.short}</button>`).join('');
  const chosen=state.compare.map(id=>ranked.find(m=>m.id===id));
  $('comparison-table').innerHTML=`<caption class="sr-only">선택한 ${chosen.length}개 해양 PDE 모델의 상태변수, 가정, 보존량, 척도, 계산비용과 적용 문제 비교</caption><thead><tr><th scope="col">무엇이 다른가요?</th>${chosen.map(m=>`<th scope="col"><div class="model-kicker" style="color:${m.color}">${m.number} / ${m.short}</div><h3>${m.name}</h3><div class="table-korean">${m.korean}</div><span class="table-status ${m.eligible?'':'excluded'}">${m.eligible?'현재 후보':'현재 조건에서 제외'}</span></th>`).join('')}</tr></thead><tbody>${rows.map(([title,eng,key])=>`<tr class="${key==='dimension'?'dimension-row':''}"><th scope="row">${title}<small>${eng}</small></th>${chosen.map(m=>`<td>${key==='equations'?`<div class="table-equation">${m.equations.slice(0,2).map(eq=>`<div>${eq}</div>`).join('')}</div><button type="button" class="small-link" data-inspect="${m.id}">기호·전체 식 확인 ↗</button>`:m[key]}</td>`).join('')}</tr>`).join('')}<tr><th scope="row">근거<small>PRIMARY SOURCES</small></th>${chosen.map(m=>`<td><div class="model-refs">${sourceLinks(m.refs)}</div></td>`).join('')}</tr></tbody>`;
  $('comparison-table').style.minWidth=chosen.length===1?'420px':chosen.length===2?'640px':'860px';
}

function diagram(model){
  let body='';let label='';
  const defs=`<defs><marker id="d-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6" fill="${model.color}"/></marker></defs>`;
  const arrow=(x,y,length)=>`<path d="M${x} ${y}h${length}" fill="none" stroke="${model.color}" stroke-width="1.4" marker-end="url(#d-arrow)"/>`;
  if(model.id==='qg'||model.id==='ns'){
    body=`<g fill="none" stroke="${model.color}" opacity=".7"><ellipse cx="120" cy="55" rx="52" ry="34"/><ellipse cx="120" cy="55" rx="35" ry="22"/><ellipse cx="120" cy="55" rx="16" ry="11"/><ellipse cx="238" cy="55" rx="38" ry="25"/><ellipse cx="238" cy="55" rx="20" ry="13"/></g>${arrow(98,21,26)}${arrow(246,80,-21)}`;
    label=model.id==='qg'?'q → ψ 역산 · 균형 유동':'ζ → ψ 역산 · 평면 와류';
  }else{
    const n=model.id==='swe'?1:model.id==='layer'?3:6;
    body=`<path d="M20 18Q70 7 120 18T220 18T320 18V99H20Z" fill="${model.color}" opacity=".07"/><path d="M20 18Q70 7 120 18T220 18T320 18" fill="none" stroke="${model.color}" stroke-width="1.3"/>`;
    for(let i=1;i<n;i++)body+=`<path d="M20 ${18+i*81/n}Q100 ${8+i*81/n}180 ${18+i*81/n}T320 ${18+i*81/n}" fill="none" stroke="${model.color}" stroke-width=".7" opacity=".4"/>`;
    body+='<path d="M20 99H320" fill="none" stroke="#a9b4a3" stroke-width="2"/>';
    for(let i=0;i<n;i++){const y=18+(i+.6)*81/n;for(const x of [55,155,255])body+=arrow(x,y,model.id==='swe'?32:42-i*5);}
    if(model.id==='nh')body+=`<g fill="none" stroke="${model.color}" stroke-width="1.5" marker-end="url(#d-arrow)"><path d="M120 85V30"/><path d="M220 28V85"/></g>`;
    label=model.id==='swe'?'수직 평균 · 하나의 속도장':model.id==='layer'?'층별 속도 · 움직이는 밀도 계면':model.id==='pe'?'수직 격자 · w는 연속식으로 진단':'수직 격자 · w의 운동량도 적분';
  }
  return `<svg viewBox="0 0 340 125" role="img" aria-label="${model.korean}의 수직 구조 개념도">${defs}${body}<text x="20" y="117" font-size="8" fill="#667d73" font-family="sans-serif">${label} · 개념도</text></svg>`;
}

function renderDetail(){
  const m=models.find(m=>m.id===state.inspector);
  $('model-tabs').innerHTML=models.map(m=>`<button type="button" role="tab" class="model-tab" id="tab-${m.id}" data-tab="${m.id}" aria-controls="model-detail" aria-selected="${state.inspector===m.id}" tabindex="${state.inspector===m.id?'0':'-1'}">${m.short}</button>`).join('');
  $('model-detail').setAttribute('aria-labelledby',`tab-${m.id}`);
  $('model-detail').style.setProperty('--model-color',m.color);
  $('model-detail').innerHTML=`<div class="equation-side"><div class="eyebrow" style="color:${m.color}">${m.dimension.toUpperCase()}</div><h3>${m.name}</h3><p class="tagline">${m.tagline}</p><div class="equation-box" aria-label="${m.korean}의 대표 방정식">${m.equations.map(eq=>`<div class="equation-line">${eq}</div>`).join('')}</div><p class="equation-note">${m.eqnote}</p></div><div class="detail-side"><div class="layer-visual">${diagram(m)}</div><div class="detail-info"><h4>이 방정식이 생략하는 것</h4><p>${m.limits}</p></div><div class="detail-info"><h4>실험을 시작하기 전에</h4><p>${m.needs}</p></div><div class="model-refs">${sourceLinks(m.refs)}</div></div>`;
}

function renderStorage(){
  const values=models.map(m=>({m,...storageEstimate(m,state)}));
  const max=Math.max(...values.map(v=>v.MiB));
  $('storage-bars').innerHTML=values.map(v=>`<div class="storage-row ${v.m.id===state.inspector?'highlight':''}" aria-label="${v.m.short}: ${v.MiB.toFixed(1)} MiB, 예측 변수 ${v.fields}개 장"><span>${v.m.short}</span><div class="storage-track" aria-hidden="true"><div class="storage-fill" style="width:${v.MiB/max*100}%"></div></div><span class="storage-value">${v.MiB.toFixed(1)} MiB</span></div>`).join('');
}

function render({controls=false,autoInspect=false}={}){
  const focused=document.activeElement?.id;
  const ranked=evaluate(state);
  if(autoInspect){const first=ranked.find(m=>m.eligible);if(first)state.inspector=first.id;}
  if(controls)renderControls();
  renderResults(ranked);renderDiagnostics();renderComparison(ranked);renderDetail();renderStorage();
  if(focused&&$(focused))$(focused).focus({preventScroll:true});
}

function syncInputs(){
  for(const [id,key] of [['length','L'],['speed','U'],['depth','H'],['latitude','lat'],['grid','grid'],['nz','nz'],['layers','k']])$(id).value=state[key];
}
function setPurpose(id){
  const p=purposes.find(p=>p.id===id);
  state={...state,purpose:id,requirements:[...p.requirements],L:p.L,H:p.H,U:p.U,lat:p.lat};
  syncInputs();render({controls:true,autoInspect:true});
}
function toggleCompare(id,addOnly=false){
  if(state.compare.includes(id)){
    if(addOnly){toast('이미 비교 표에 포함된 모델입니다.');return;}
    if(state.compare.length===1){$('compare-message').textContent='비교할 모델을 최소 1개 남겨 주세요.';toast('최소 1개의 모델을 남겨 주세요.');return;}
    state.compare=state.compare.filter(m=>m!==id);
  }else{
    if(state.compare.length>=3){$('compare-message').textContent='최대 3개까지 비교할 수 있습니다. 선택한 모델을 하나 해제해 주세요.';toast('비교 중인 모델을 하나 해제한 뒤 추가해 주세요.');return;}
    state.compare.push(id);
  }
  $('compare-message').textContent=`${state.compare.length}개 모델을 비교하고 있습니다.`;
  render();
}
function inspect(id,scroll=true){state.inspector=id;renderDetail();renderStorage();if(scroll)$('deep-dive').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}

document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.purpose)setPurpose(b.dataset.purpose);
  if(b.dataset.compare)toggleCompare(b.dataset.compare);
  if(b.dataset.compareAdd)toggleCompare(b.dataset.compareAdd,true);
  if(b.dataset.inspect)inspect(b.dataset.inspect);
  if(b.dataset.tab)inspect(b.dataset.tab,false);
  if(b.id==='relax-geometry'){state.geometry='any';render({controls:true,autoInspect:true});toast('수직 구조 제한을 풀었습니다.');}
  if(b.id==='restore-scenario')setPurpose(state.purpose);
});
$('physics-options').addEventListener('change',e=>{const id=e.target.dataset.physics;if(!id)return;state.requirements=e.target.checked?[...new Set([...state.requirements,id])]:state.requirements.filter(p=>p!==id);render({autoInspect:true});});
for(const id of ['geometry','budget'])$(id).addEventListener('change',()=>{state[id]=$(id).value;render({autoInspect:true});});
for(const [id,key] of [['length','L'],['speed','U'],['depth','H'],['latitude','lat']]){
  $(id).addEventListener('input',()=>{const input=$(id);if(input.value===''||!input.validity.valid)return;state[key]=Number(input.value);render({autoInspect:true});});
  $(id).addEventListener('change',()=>{const input=$(id);if(!input.validity.valid||input.value===''){input.value=state[key];toast('표시된 범위 안의 유효한 숫자를 입력해 주세요.');}});
}
for(const [id,key] of [['grid','grid'],['layers','k'],['nz','nz']])$(id).addEventListener('change',()=>{state[key]=Number($(id).value);renderStorage();});
$('reset').addEventListener('click',()=>{state=defaultState();syncInputs();render({controls:true});$('compare-message').textContent='';toast('처음의 조석·연안 수송 예시로 돌아왔습니다.');});
$('compare-best').addEventListener('click',()=>{const best=evaluate(state).filter(m=>m.eligible).slice(0,3);if(!best.length){toast('먼저 물리 조건과 차원 제한의 충돌을 해결해 주세요.');return;}state.compare=best.map(m=>m.id);$('compare-message').textContent=`현재 조건을 만족하는 ${best.length}개 후보를 비교합니다.`;render();});

function arrowTabs(container,selector,ids,setter){container.addEventListener('keydown',e=>{const b=e.target.closest(selector);if(!b)return;const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];if(!keys.includes(e.key))return;e.preventDefault();const i=ids.indexOf(b.dataset.tab||b.dataset.purpose);const next=e.key==='Home'?0:e.key==='End'?ids.length-1:(i+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+ids.length)%ids.length;setter(ids[next]);$(selector==='[data-tab]'?`tab-${ids[next]}`:`purpose-${ids[next]}`).focus({preventScroll:true});});}
arrowTabs($('model-tabs'),'[data-tab]',models.map(m=>m.id),id=>inspect(id,false));
arrowTabs($('purpose-options'),'[data-purpose]',purposes.map(p=>p.id),setPurpose);

$('source-list').innerHTML=sources.map((s,i)=>`<div class="source-item"><span>0${i+1}</span><div><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title} ↗</a><p>${s.note}</p></div></div>`).join('');

syncInputs();render({controls:true});
