const $=id=>document.getElementById(id);
const definitions={
  ns:{name:'2D Navier–Stokes',summary:'평면의 와류가 이류·병합·소산하는 과정을 봅니다.',equation:'∂ₜζ + J(ψ,ζ) = ν∇²ζ − rζ + A sin(4y),  ∇²ψ = ζ',params:['nu','drag','forcing','amp'],fields:[['vorticity','와도 ζ'],['speed','유속 크기 |u|'],['height','유선함수 ψ']],method:'Arakawa Jacobian + 이산 Poisson FFT 역산 + SSP-RK3. 무강제·무점성에서는 이산 에너지와 enstrophy의 보존을 근사합니다. 시간 적분 오차는 남습니다.',invariant:'운동에너지 E · enstrophy Z',defaults:{nu:.002,drag:0,forcing:0,amp:.18}},
  swe:{name:'Rotating shallow-water',summary:'자유수면의 융기가 퍼지고 회전하며 조정되는 과정을 봅니다.',equation:'∂ₜh + ∇·m = 0,  ∂ₜm + ∇·(m⊗m/h + ½gh²I) + f k×m = −rm + ν∇²m + hF',params:['c','f','nu','drag','forcing','amp'],fields:[['height','수면 변위 η = h − 1'],['speed','유속 크기 |u|'],['vorticity','와도 ζ'],['pv','잠재와도 (ζ+f)/h']],method:'보존형 유한체적 Rusanov flux + SSP-RK3. 격자 합 질량을 보존하며, flux의 수치 소산 때문에 ν=0에서도 파동 에너지가 감소합니다. 평저·주기 경계이며 wetting/drying은 없습니다.',invariant:'기계에너지 E · potential enstrophy Z',defaults:{c:1,f:2,nu:.002,drag:0,forcing:0,amp:.18}},
  qg:{name:'Single-layer QG',summary:'중력파를 걸러낸 균형 소용돌이와 Rossby 파동을 봅니다.',equation:'∂ₜq′ + J(ψ,q′) + β∂ₓψ = ν∇²q′ − rq′ + A sin(4y),  q′ = ∇²ψ − ψ/Lᴅ²',params:['beta','ld','nu','drag','forcing','amp'],fields:[['pv','PV anomaly q′'],['vorticity','와도 ζ'],['speed','유속 크기 |u|'],['height','유선함수 ψ']],method:'Arakawa Jacobian + 이산 Helmholtz FFT 역산 + SSP-RK3. q′를 주기장으로 적분하고 βv 항을 별도 포함합니다. βy 자체를 주기장으로 취급하지 않습니다.',invariant:'QG 에너지 E · anomaly enstrophy Z',defaults:{beta:1,ld:1,nu:.002,drag:0,forcing:0,amp:.18}}
};
const parameters={nu:['점성 / PV 확산 ν',0,.03,.0005],drag:['선형 마찰 r',0,.2,.005],forcing:['외력 진폭 A',0,.15,.005],amp:['초기 진폭',.02,.4,.01],c:['외부 중력파 속도 c',.3,3,.1],f:['회전 f',0,10,.25],beta:['회전의 남북 변화 β',0,3,.1],ld:['변형반경 Lᴅ',.3,5,.1]};
let model='ns',worker,generation=0,pending=false,running=false,latest,history=[],initialMetrics,lockedScale=null;
let exportUrl;
let options={model:'ns',n:64,initial:'vortices',...definitions.ns.defaults},appliedOptions;
const fieldCanvas=$('sim-field'),ctx=fieldCanvas.getContext('2d'),plot=$('sim-chart'),pctx=plot.getContext('2d');
const raster=document.createElement('canvas'),rctx=raster.getContext('2d');

function renderParameterForm(){
 const d=definitions[model];
 $('sim-summary').textContent=d.summary;$('sim-equation').textContent=d.equation;$('sim-method').textContent=d.method;$('sim-invariants').textContent=d.invariant;
 $('sim-params').innerHTML=d.params.map(id=>{const [name,min,max,step]=parameters[id];return `<label class="sim-range-label" for="sim-p-${id}"><span>${name}<output id="sim-o-${id}">${options[id]}</output></span><input type="range" id="sim-p-${id}" min="${min}" max="${max}" step="${step}" value="${options[id]}" data-param="${id}"></label>`;}).join('');
 $('sim-view').innerHTML=d.fields.map(([v,label])=>`<option value="${v}">${label}</option>`).join('');
 $('sim-view').value=model==='swe'?'height':model==='qg'?'pv':'vorticity';
 $('sim-amp-note').textContent=model==='swe'?'SWE의 초기 진폭은 h=1 기준 수면 높이입니다.':'NS/QG의 초기 진폭은 유선함수 ψ의 크기입니다. 모델 간 같은 숫자가 같은 에너지를 뜻하지 않습니다.';
}
function status(text,error=false){$('sim-status').textContent=text;$('sim-status').classList.toggle('sim-error',error);}
function setRunning(value){running=value;$('sim-play').textContent=running?'❚❚ 일시정지':'▶ 재생';$('sim-play').setAttribute('aria-pressed',String(running));if(running)requestFrame();}
function initialize(){
 setRunning(false);generation++;pending=false;history=[];latest=null;initialMetrics=null;lockedScale=null;
 options.model=model;options.n=Number($('sim-n').value);options.initial=$('sim-initial').value;appliedOptions={...options};
 if(worker)worker.terminate();
 try{worker=new Worker(new URL('./sim-worker.js',import.meta.url),{type:'module'});}catch(error){status('Worker를 시작할 수 없습니다. HTTP 서버 또는 GitHub Pages로 열어 주세요.',true);return;}
 worker.onmessage=({data})=>{
  if(data.generation!==generation)return;pending=false;
  if(data.type==='error'){setRunning(false);status(data.message,true);return;}
  if(data.field!==$('sim-view').value){refreshView();return;}
  latest=data;if(!initialMetrics)initialMetrics=data.metrics;
  const m=data.metrics;
  if(!history.length||history.at(-1).t!==m.t){history.push(m);if(history.length>1200)history.splice(1,1);}
  renderFrame();renderMetrics();drawChart();
  status(m.steps?`${running?'계산 중':'일시정지'} · ${m.steps.toLocaleString()} steps · Δt ${m.dt.toExponential(2)}`:'초기장 준비 완료 · 재생을 누르세요');
  if(running)requestAnimationFrame(()=>requestFrame());
 };
 worker.onerror=e=>{pending=false;setRunning(false);status('계산 스크립트를 불러오지 못했습니다. 배치 경로·HTTP 서버를 확인하세요.',true);};
 status('초기장을 계산하고 있습니다…');pending=true;
 worker.postMessage({type:'init',options,generation,field:$('sim-view').value});
 $('sim-apply').textContent='설정 적용 · 초기화';$('sim-pending').hidden=true;
}
function requestFrame(single=false){
 if(!worker||pending||(!running&&!single))return;
 pending=true;worker.postMessage({type:'advance',steps:single===true?1:Number($('sim-rate').value),generation,field:$('sim-view').value});
}
function refreshView(){if(!worker||pending)return;pending=true;worker.postMessage({type:'view',generation,field:$('sim-view').value});}
function color(value,sequential){
 if(sequential){const t=Math.max(0,Math.min(1,value));return [Math.round(13+220*t),Math.round(43+185*t),Math.round(66+70*t)];}
 const t=Math.max(-1,Math.min(1,value)),a=Math.abs(t),base=[239,243,227],end=t<0?[26,88,145]:[185,68,52];return base.map((b,i)=>Math.round(b+(end[i]-b)*a));
}
function renderFrame(){
 if(!latest)return;const {n,values,u,v}=latest;
 const sequential=$('sim-view').value==='speed';let lo=Infinity,hi=-Infinity;
 for(const v of values){lo=Math.min(lo,v);hi=Math.max(hi,v);}
 const scale=$('sim-scale').value;
 const auto=sequential?Math.max(hi,1e-10):Math.max(Math.abs(lo),Math.abs(hi),1e-10);
 if(lockedScale===null)lockedScale=auto;
 const range=scale==='locked'?lockedScale:auto;
 raster.width=raster.height=n;const pixels=rctx.createImageData(n,n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=y*n+x,j=((n-1-y)*n+x)*4,c=color(values[k]/range,sequential);pixels.data[j]=c[0];pixels.data[j+1]=c[1];pixels.data[j+2]=c[2];pixels.data[j+3]=255;}
 rctx.putImageData(pixels,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(raster,0,0,fieldCanvas.width,fieldCanvas.height);
 if($('sim-vectors').checked){let max=0;for(let k=0;k<u.length;k++)max=Math.max(max,Math.hypot(u[k],v[k]));ctx.strokeStyle='rgba(11,44,53,.65)';ctx.lineWidth=1.3;const stride=n/16,W=fieldCanvas.width;
  for(let y=0;y<n;y+=stride)for(let x=0;x<n;x+=stride){const k=y*n+x,X=(x+.5)/n*W,Y=(1-(y+.5)/n)*W,dx=u[k]/(max||1)*15,dy=-v[k]/(max||1)*15,angle=Math.atan2(dy,dx);ctx.beginPath();ctx.moveTo(X,Y);ctx.lineTo(X+dx,Y+dy);if(Math.hypot(dx,dy)>2){ctx.lineTo(X+dx-3*Math.cos(angle-.5),Y+dy-3*Math.sin(angle-.5));ctx.moveTo(X+dx,Y+dy);ctx.lineTo(X+dx-3*Math.cos(angle+.5),Y+dy-3*Math.sin(angle+.5));}ctx.stroke();}
 }
 $('sim-time').textContent=`t = ${latest.metrics.t.toFixed(3)}`;
 $('sim-colorbar').style.background=sequential?'linear-gradient(90deg,#0d2b42,#e9e48c)':'linear-gradient(90deg,#1a5891,#eff3e3,#b94434)';
 $('sim-lo').textContent=(sequential?0:-range).toPrecision(3);$('sim-hi').textContent=range.toPrecision(3);
 $('sim-color-mode').textContent=scale==='locked'?'초기 범위 고정':'매 프레임 자동 범위';
}
function renderMetrics(){if(!latest)return;const m=latest.metrics,base=initialMetrics;const ratio=(a,b)=>Math.abs(b)>1e-15?(a/b).toFixed(4):'—';
 $('sim-metrics').innerHTML=`<div><small>ENERGY / E₀</small><b>${ratio(m.energy,base.energy)}</b></div><div><small>ENSTROPHY / Z₀</small><b>${ratio(m.enstrophy,base.enstrophy)}</b></div><div><small>${model==='swe'?'MASS REL. ERROR':'MAX SPEED'}</small><b>${model==='swe'?((m.mass-base.mass)/base.mass).toExponential(1):m.maxSpeed.toFixed(3)}</b></div>`;
}
function drawChart(){
 const W=plot.width,H=plot.height,left=55,right=16,top=20,bottom=34;pctx.clearRect(0,0,W,H);pctx.fillStyle='#f3f6ef';pctx.fillRect(0,0,W,H);
 if(!history.length)return;const E=initialMetrics.energy||1,Z=initialMetrics.enstrophy||1;
 const end=Math.max(1,history.at(-1).t);let max=1.1;for(const m of history)max=Math.max(max,m.energy/E*1.05,m.enstrophy/Z*1.05);
 pctx.font='12px monospace';pctx.lineWidth=1;
 for(let i=0;i<=4;i++){const y=top+(H-top-bottom)*i/4;pctx.strokeStyle='#dbe3d7';pctx.beginPath();pctx.moveTo(left,y);pctx.lineTo(W-right,y);pctx.stroke();pctx.fillStyle='#6d7d73';pctx.fillText((max*(1-i/4)).toFixed(2),7,y+4);}
 for(const [key,base,color] of [['energy',E,'#137c70'],['enstrophy',Z,'#a7663e']]){pctx.strokeStyle=color;pctx.lineWidth=2;pctx.beginPath();history.forEach((m,i)=>{const x=left+m.t/end*(W-left-right),y=H-bottom-m[key]/base/max*(H-top-bottom);i?pctx.lineTo(x,y):pctx.moveTo(x,y);});pctx.stroke();}
 pctx.fillStyle='#6d7d73';pctx.fillText('0',left,H-10);pctx.fillText(`t = ${end.toFixed(2)}`,W-100,H-10);
}

$('sim-model').addEventListener('change',()=>{model=$('sim-model').value;options={...options,...definitions[model].defaults};renderParameterForm();initialize();});
$('sim-params').addEventListener('input',e=>{const key=e.target.dataset.param;if(!key)return;options[key]=Number(e.target.value);$(`sim-o-${key}`).textContent=e.target.value;$('sim-pending').hidden=false;$('sim-apply').textContent='새 설정 적용 · 처음부터';});
for(const id of ['sim-n','sim-initial'])$(id).addEventListener('change',()=>{$('sim-pending').hidden=false;});
$('sim-apply').addEventListener('click',initialize);
$('sim-play').addEventListener('click',()=>setRunning(!running));
$('sim-step').addEventListener('click',()=>{setRunning(false);requestFrame(true);});
$('sim-view').addEventListener('change',()=>{lockedScale=null;refreshView();});
$('sim-scale').addEventListener('change',()=>{lockedScale=null;renderFrame();});
$('sim-vectors').addEventListener('change',renderFrame);
$('sim-save').addEventListener('click',()=>{
 if(!latest)return;const m=latest.metrics;
 const snapshot={schema:'ocean-pde-lab/v1',createdAt:new Date().toISOString(),options:{...appliedOptions},metrics:m,history,n:latest.n,field:latest.field,fieldValues:Array.from(latest.values),note:'Nondimensional periodic educational solver; field values are row-major, y increases upwards. Snapshot is an export, not a restart checkpoint.'};
 const json=JSON.stringify(snapshot),blob=new Blob([json],{type:'application/json'});if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=URL.createObjectURL(blob);const a=$('sim-export-link');a.href=exportUrl;a.download=`ocean-${model}-t${m.t.toFixed(2)}.json`;$('sim-export-text').value=json;$('sim-export-panel').hidden=false;$('sim-export-panel').open=true;a.click();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false);});
for(const b of document.querySelectorAll('[data-sim-preset]'))b.addEventListener('click',()=>{const which=b.dataset.simPreset;model=which==='rossby'?'qg':which==='adjustment'?'swe':'ns';$('sim-model').value=model;options={...options,...definitions[model].defaults};$('sim-initial').value=which==='rossby'?'wave':'vortices';renderParameterForm();initialize();$('simulator').scrollIntoView({behavior:'smooth'});});
renderParameterForm();initialize();
