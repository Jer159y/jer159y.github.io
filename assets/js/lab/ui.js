// Shared page logic for the Climate and Marine labs. The page sets data-lab="climate" | "marine".
import { VIEWS } from './views.js';
import { fmt, clearCanvas, diverging } from './plots.js';
import { renderRealData } from './realdata.js';

// Everything runs inside an async function: the site's JS minifier drops files with top-level await.
(async () => {
const root = document.querySelector('[data-lab]');
const { default: lab } = await import(`./catalog-${root.dataset.lab}.js`);
const $ = id => document.getElementById(id);
const { tasks, systems } = lab;
const TERM_LABELS = {
  asr: 'ASR', olr: '−OLR', noise: '잡음 일', freshwater: '담수 강제 η₂', restoring: '복원 −η₃S', advection: '이류',
  growth: 'Bjerknes ωRT²', damping: '감쇠', dissipation: '감쇠', forcing: '강제', production: '생성', coupling: '빠른 변수 결합',
  hyperdiffusion: '초확산 소산', drag: '바닥 마찰', filter: '필터 소산', topography: '지형 상호작용', nonlinear: '비선형 교환',
  wind: '바람 응력', friction: '마찰', beta: 'β 항', viscosity: '점성', tendency: '실제 변화율', residual: '잔차',
};

let current, params = {}, worker, id = 0, pending = false, running = false, viewId;
const st = { trail: [], twinTrail: [], history: [], samples: { t: [], data: {} }, pairs: [], hov: null, last: null, errorStart: 0, experiment: null, opts: {}, real: {} };
st.termLabel = k => TERM_LABELS[k] ?? k;
st.legend = html => { $('lab-view-legend').innerHTML = html; };

/* ------------------------------ static sections ------------------------------ */
const table = (head, rows) => `<div class="comparison-scroll"><table class="cl-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => (i ? `<td>${c}</td>` : `<th scope="row">${c}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
function renderStatic() {
  for (const block of lab.blocks) {
    const el = $(block.target); if (!el) continue;
    el.innerHTML += `${block.title ? `<h3 class="cl-subhead">${block.title}</h3>` : ''}${block.intro ? `<p>${block.intro}</p>` : ''}${block.head ? table(block.head, block.rows) : ''}${block.notes ? `<p class="ol-fine">${block.notes}</p>` : ''}`;
  }
  $('lab-refs').innerHTML = lab.refs.map(r => `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title} ↗</a></li>`).join('');
}
function renderOverview(activeTask = null) {
  $('lab-task-chips').innerHTML = tasks.map(t => `<button type="button" data-task="${t.id}" aria-pressed="${t.id === activeTask}">${t.name}</button>`).join('');
  const rows = systems.map(s => {
    const hit = activeTask && s.tasks[activeTask];
    return `<tr class="${activeTask && !hit ? 'cl-dim' : ''}"><th scope="row"><button type="button" class="text-btn" data-system="${s.id}">${s.name}</button></th><td>${s.dim}<small>${s.dimNote}</small></td><td>${s.predicts}</td><td>${s.physics}</td><td>${s.omitted}</td><td>${s.cost}</td><td>${Object.keys(s.tasks).map(k => tasks.find(t => t.id === k).name).join(' · ')}</td></tr>`;
  }).join('');
  const tail = (lab.ladderTail ?? []).map(r => `<tr class="cl-tail"><th scope="row">${r.name}</th><td>${r.dim}</td><td>${r.predicts}</td><td>${r.physics}</td><td>—</td><td>${r.cost}</td><td>—</td></tr>`).join('');
  $('lab-ladder').innerHTML = `<thead><tr><th>시스템</th><th>상태 차원</th><th>무엇을 예측·설명하나</th><th>꼭 필요한 물리</th><th>빠진 물리</th><th>1 스텝 비용</th><th>주로 쓰이는 task</th></tr></thead><tbody>${rows}${tail}</tbody>`;
  if (!activeTask) { $('lab-task-view').innerHTML = '<p class="ol-fine">위에서 task를 고르면 각 시스템이 그 task에서 어떻게 쓰이는지 나란히 비교합니다.</p>'; return; }
  const t = tasks.find(t => t.id === activeTask), users = systems.filter(s => s.tasks[activeTask]);
  $('lab-task-view').innerHTML = `<p>${t.desc}</p>${table(['시스템 (차원)', '보편적 method', '이 시스템으로 푸는 방법', '중요해지는 문제'], users.map(s => { const x = s.tasks[activeTask]; return [`<button type="button" class="text-btn" data-system="${s.id}">${s.short}</button><small>dim ${s.dim}</small>`, x.method, x.how, x.issues]; }))}`;
}
function typeset(el, tries = 0) {
  const mj = window.MathJax;
  if (mj?.typesetPromise) { (mj.startup?.promise ?? Promise.resolve()).then(() => mj.typesetPromise([el])).catch(() => {}); return; }
  if (tries < 50) setTimeout(() => typeset(el, tries + 1), 200);
}
function renderDetail() {
  const s = current;
  $('lab-detail-title').textContent = `${s.name} · 상태 차원 ${s.dim}`;
  $('lab-equations').innerHTML = s.equations.map(e => `\\[${e}\\]`).join('');
  $('lab-variables').innerHTML = s.variables;
  $('lab-physics').innerHTML = `<div><h4>무엇을 예측·설명하나</h4><p>${s.predicts}</p></div><div><h4>꼭 필요한 물리</h4><p>${s.physics}</p></div><div><h4>빠진 물리</h4><p>${s.omitted}</p></div><div><h4>차원과 계산</h4><p>상태 차원 ${s.dim} (${s.dimNote}), 1 스텝 비용 ${s.cost}. 시간 단위: ${s.timeUnit}.</p></div>`;
  $('lab-diagnostics').innerHTML = s.diagnostics.map(d => `<div class="cl-diag"><h4>${d.name}</h4><div class="cl-math">\\[${d.tex}\\]</div><p>${d.explain}</p></div>`).join('');
  $('lab-viewguide').innerHTML = table(['시각화', '무엇을 보나', '분야에서 왜 쓰나'], s.ui.views.map(v => [VIEWS[v.id].label, v.what, v.why]));
  $('lab-numerics').textContent = s.numerics;
  $('lab-tasks').innerHTML = table(['Task', '보편적 method', '푸는 방법', '중요해지는 문제'], Object.entries(s.tasks).map(([k, x]) => [tasks.find(t => t.id === k).name, x.method, x.how, x.issues]));
  $('lab-sysrefs').innerHTML = s.refs.map(r => `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title} ↗</a></li>`).join('');
  typeset($('lab-detail'));
}

/* --------------------------------- controls ---------------------------------- */
function renderControls() {
  const s = current, ui = s.ui;
  $('lab-tabs').innerHTML = systems.map(x => `<button type="button" role="tab" data-system="${x.id}" aria-selected="${x.id === s.id}">${x.short} <small>dim ${x.dim}</small></button>`).join('');
  $('lab-summary').textContent = s.summary;
  $('lab-params').innerHTML = s.params.map(p => p.options
    ? `<label for="lab-p-${p.key}">${p.label}<select id="lab-p-${p.key}" data-param="${p.key}">${p.options.map(([v, l]) => `<option value="${v}" ${String(params[p.key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`
    : `<label class="sim-range-label" for="lab-p-${p.key}"><span>${p.label}<output id="lab-o-${p.key}">${fmtParam(params[p.key], p)}</output></span><input type="range" id="lab-p-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${params[p.key]}" data-param="${p.key}"></label>`).join('');
  $('lab-keep-wrap').hidden = !ui.keepState;
  $('lab-perturb').hidden = !s.twin; $('lab-particles').hidden = s.id !== 'gyre'; $('lab-experiment').hidden = !ui.experiment;
  $('lab-field-wrap').hidden = !ui.fields;
  if (ui.fields) $('lab-field').innerHTML = ui.fields.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  $('lab-section-wrap').hidden = s.id !== 'gyre';
  $('lab-pending').hidden = true;
  viewId = ui.views[0].id; renderViewTabs();
}
const fmtParam = (v, p) => (p.log ? Number(v).toExponential(1) : String(+Number(v).toFixed(5)));
function renderViewTabs() {
  $('lab-views').innerHTML = current.ui.views.map(v => `<button type="button" data-view="${v.id}" aria-pressed="${v.id === viewId}">${VIEWS[v.id].label}</button>`).join('');
}
function selectSystem(sysId, scroll = false) {
  current = systems.find(s => s.id === sysId);
  params = { ...current.defaults };
  st.trail = []; st.twinTrail = [];
  st.ui = current.ui; st.sys = current; st.experiment = null;
  renderControls(); renderDetail(); start();
  if (scroll) $('lab-sim').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/* ---------------------------------- worker ----------------------------------- */
function status(text, error = false) { $('lab-status').textContent = text; $('lab-status').classList.toggle('sim-error', error); }
function setRunning(v) {
  running = v; $('lab-play').textContent = v ? '❚❚ 일시정지' : '▶ 재생'; $('lab-play').setAttribute('aria-pressed', String(v));
  if (v) request(); else if (st.last) status(`일시정지 · ${st.last.steps.toLocaleString()} steps · t = ${fmt(st.last.t, 2)} ${current.timeUnit}`);
}
function start({ keep = false } = {}) {
  setRunning(false); id++; pending = false;
  const p = { ...params };
  if (keep && st.last) {
    if (current.id === 'ebm') p.T0 = st.last.diag.T;
    if (current.id === 'stommel') { p.T0 = st.last.diag.T; p.S0 = st.last.diag.S; }
  } else { st.trail = []; st.twinTrail = []; }
  Object.assign(st, { history: [], hov: null, last: null, errorStart: 0, fieldRange: null, pairs: [], params: p, mhwBase: null });
  st.samples = { t: [], data: Object.fromEntries(current.ui.keys.map(k => [k, []])) };
  $('lab-pending').hidden = true;
  if (worker) worker.terminate();
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); }
  catch { status('Worker를 시작할 수 없습니다. HTTP 서버에서 열어 주세요.', true); return; }
  worker.onmessage = ({ data }) => { if (data.id === id) receive(data); };
  worker.onerror = () => { pending = false; setRunning(false); status('계산 스크립트를 불러오지 못했습니다.', true); };
  pending = true;
  const ui = current.ui;
  // sampleDt is given in display units; the worker samples in model time.
  worker.postMessage({ type: 'init', id, engine: current.engine, params: p, field: $('lab-field').value || ui.fields?.[0]?.[0], hovEvery: ui.hovEvery || 1, sampleDt: ui.sampleDt / (ui.tScale ?? 1), keys: ui.keys, extras: ui.extras ?? [], sectionY: st.opts.sectionY ?? 0.25 });
  status('초기 상태를 준비하고 있습니다…');
  st.firstSteps = ui.firstSteps ?? 0;
  if (st.firstSteps) { pending = false; request(true); }
}
function request(single = false) {
  if (!worker || pending || (!running && !single)) return;
  if (current.ui.maxT && st.last && st.last.t >= current.ui.maxT) { setRunning(false); status(`설정된 최대 기간(${fmt(current.ui.maxT, 0)} ${current.timeUnit})에 도달해 멈췄습니다. 설정 적용으로 다시 시작하세요.`); return; }
  pending = true;
  const steps = st.firstSteps || (single ? 1 : current.ui.stepsPerFrame * Number($('lab-rate').value)); st.firstSteps = 0;
  if (steps > 1000 && st.samples.t.length === 0) status('기준기간을 생성하고 있습니다…');
  worker.postMessage({ type: 'advance', steps });
}
const MAX_SAMPLES = 16384;
function receive(data) {
  if (data.type === 'error') { pending = false; setRunning(false); status(data.message, true); return; }
  if (data.type === 'experiment') { st.experiment = { name: data.name, result: data.result }; $('lab-experiment').disabled = false; status('앙상블 실험 완료 — 앙상블 검증 보기에서 결과를 확인하세요.'); viewId = 'ensemble'; renderViewTabs(); draw(); return; }
  if (data.req === 'perturb' || data.req === 'view' || data.req === 'particles') { data.t *= current.ui.tScale ?? 1; st.last = data; draw(); return; }
  pending = false;
  const ts = current.ui.tScale ?? 1; data.t *= ts; st.last = data;
  if (data.result.elapsed > 0 || !st.history.length) {
    st.history.push({ t: data.t, diag: data.diag, rates: data.result.rates });
    if (st.history.length > 2400) st.history = st.history.filter((_, i) => i % 2 === 0 || i === st.history.length - 1);
  }
  const ax = current.ui.axes, tol = ax && !ax.auto ? [(ax.x[1] - ax.x[0]) * 1e-3, (ax.y[1] - ax.y[0]) * 1e-3] : [0, 0];
  for (const [x, y, tx, ty] of data.trail) {
    const prev = st.trail.at(-1);
    if (prev && Math.abs(x - prev[0]) < tol[0] && Math.abs(y - prev[1]) < tol[1]) continue;
    st.trail.push([x, y]); if (tx !== undefined && current.twin) st.twinTrail.push([tx, ty]);
  }
  const maxTrail = current.ui.maxTrail ?? 4000;
  if (st.trail.length > maxTrail) st.trail.splice(0, st.trail.length - maxTrail);
  if (st.twinTrail.length > maxTrail) st.twinTrail.splice(0, st.twinTrail.length - maxTrail);
  for (const row of data.samples) { st.samples.t.push(row[0] * ts); current.ui.keys.forEach((k, i) => st.samples.data[k].push(row[i + 1])); }
  const maxSamples = current.ui.maxSamples ?? MAX_SAMPLES;
  if (st.samples.t.length > maxSamples) { const cut = st.samples.t.length - maxSamples; st.samples.t.splice(0, cut); for (const k in st.samples.data) st.samples.data[k].splice(0, cut); }
  st.pairs.push(...data.pairs); if (st.pairs.length > 6000) st.pairs.splice(0, st.pairs.length - 6000);
  if (data.rows.length) pushRows(data.rows);
  draw();
  status(`${running ? '계산 중' : '일시정지'} · ${data.steps.toLocaleString()} steps · t = ${fmt(data.t, 2)} ${current.timeUnit}`);
  if (running) requestAnimationFrame(() => request());
}
function pushRows(rows) {
  const n = rows[0].length, height = 360;
  if (!st.hov || st.hov.n !== n) { const c = document.createElement('canvas'); c.width = n; c.height = height; st.hov = { n, canvas: c, ctx: c.getContext('2d') }; st.hov.ctx.fillStyle = '#eff3e3'; st.hov.ctx.fillRect(0, 0, n, height); }
  const range = current.ui.range(st.params), k = Math.min(rows.length, height);
  st.hov.ctx.drawImage(st.hov.canvas, 0, -k);
  const img = st.hov.ctx.createImageData(n, k);
  rows.slice(-k).forEach((row, r) => { for (let x = 0; x < n; x++) { const c = diverging(row[x] / range), j = (r * n + x) * 4; img.data[j] = c[0]; img.data[j + 1] = c[1]; img.data[j + 2] = c[2]; img.data[j + 3] = 255; } });
  st.hov.ctx.putImageData(img, 0, height - k);
}

/* ---------------------------------- drawing ---------------------------------- */
let lastDraw = 0, drawQueued = false;
function draw() {
  // Statistics views are recomputed at most ~4 times per second.
  const heavy = ['pdf', 'psd', 'acf', 'lagcorr', 'regime', 'returnmap', 'scatter', 'mhw', 'ews', 'seasonal'].includes(viewId);
  const now = performance.now();
  if (heavy && now - lastDraw < 250) { if (!drawQueued) { drawQueued = true; setTimeout(() => { drawQueued = false; draw(); }, 260); } return; }
  lastDraw = now;
  const canvas = $('lab-view'), ctx = clearCanvas(canvas); $('lab-view-legend').innerHTML = '';
  let out = { caption: '' };
  try { out = VIEWS[viewId].render(ctx, canvas.width, canvas.height, st) ?? out; } catch (e) { out = { caption: `이 보기를 그리는 중 문제가 생겼습니다: ${e.message}` }; }
  $('lab-view-caption').textContent = out.caption;
  renderMetrics();
}
function renderMetrics() {
  if (!st.last) return;
  const d = st.last.diag;
  $('lab-metrics').innerHTML = current.ui.metrics.map(([k, l, digits]) => `<div><small>${l}</small><b>${fmt(d[k], digits)}</b></div>`).join('');
  $('lab-time').textContent = `t = ${fmt(st.last.t, 2)} ${current.timeUnit}`;
}

/* ----------------------------------- events ---------------------------------- */
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.system) selectSystem(b.dataset.system, !b.closest('#lab-tabs'));
  if (b.dataset.task) { const on = b.getAttribute('aria-pressed') !== 'true'; renderOverview(on ? b.dataset.task : null); }
  if (b.dataset.view) { viewId = b.dataset.view; renderViewTabs(); lastDraw = 0; draw(); }
});
$('lab-params').addEventListener('input', e => {
  const key = e.target.dataset.param; if (!key) return;
  const raw = e.target.value, spec = current.params.find(p => p.key === key); params[key] = Number.isNaN(Number(raw)) ? raw : Number(raw);
  const out = $(`lab-o-${key}`); if (out) out.textContent = fmtParam(raw, spec);
  $('lab-pending').hidden = false;
});
$('lab-apply').addEventListener('click', () => start({ keep: current.ui.keepState && $('lab-keep').checked }));
$('lab-play').addEventListener('click', () => setRunning(!running));
$('lab-step').addEventListener('click', () => { setRunning(false); request(true); });
$('lab-perturb').addEventListener('click', () => { if (!worker || !st.last) return; st.errorStart = st.last.t; worker.postMessage({ type: 'perturb' }); });
$('lab-particles').addEventListener('click', () => { if (worker) worker.postMessage({ type: 'particles' }); });
$('lab-field').addEventListener('change', () => { if (!worker) return; st.fieldRange = null; worker.postMessage({ type: 'view', field: $('lab-field').value }); });
$('lab-section').addEventListener('change', () => { st.opts.sectionY = Number($('lab-section').value); if (worker) worker.postMessage({ type: 'view', field: $('lab-field').value, sectionY: st.opts.sectionY }); });
$('lab-experiment').addEventListener('click', () => {
  if (!worker) return; $('lab-experiment').disabled = true; status('앙상블 실험을 계산하고 있습니다…');
  worker.postMessage({ type: 'experiment', id, name: current.ui.experiment, params: st.params, options: {} });
});
document.addEventListener('visibilitychange', () => { if (document.hidden) setRunning(false); });
new MutationObserver(() => { lastDraw = 0; draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

renderStatic();
renderOverview();
st.real = await renderRealData(root.dataset.lab, $('lab-realdata')).catch(() => ({}));
const want = new URLSearchParams(location.search).get('system');
selectSystem(systems.some(s => s.id === want) ? want : systems[0].id);
})();
