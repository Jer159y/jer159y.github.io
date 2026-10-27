import { systems, tasks, ladderTail, overviewRefs } from './catalog.js';
import { ebmBranch, stommelBranch, EBM_DEFAULTS, STOMMEL_DEFAULTS, ENSO_DEFAULTS, L63_DEFAULTS, L96_DEFAULTS, KS_DEFAULTS, QG2_DEFAULTS } from './systems.js';

const $ = id => document.getElementById(id);
const DEFAULTS = { ebm: EBM_DEFAULTS, stommel: STOMMEL_DEFAULTS, enso: ENSO_DEFAULTS, l63: L63_DEFAULTS, l96: L96_DEFAULTS, ks: KS_DEFAULTS, qg2: QG2_DEFAULTS };
const PALETTE = ['#2f6db5', '#c0532b', '#2c9a6a', '#8a5cc2', '#b08900'];
const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const fmt = (v, d = 3) => (v === undefined || !Number.isFinite(v) ? '—' : Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : v.toFixed(d));

// What each system shows besides the shared machinery.
const UI = {
  ebm: {
    quantity: 'H = C·T (W·yr m⁻²)',
    metrics: [['T', 'T (°C)', 2], ['albedo', '알베도 α', 3], ['N', 'N = ASR − OLR', 2], ['lambda', 'λ (W m⁻² K⁻¹)', 2], ['ecs', 'ECS (K)', 2]],
    series: [['T', 'T (°C)'], ['N', 'N (W m⁻²)']],
    axes: { x: [0.8, 1.3], y: [-60, 40], xl: '태양 상수 배율 μ', yl: 'T (°C)' }, keepState: true,
  },
  stommel: {
    quantity: 'S',
    metrics: [['q', '순환 q = T − S', 3], ['T', 'T', 3], ['S', 'S', 3]],
    series: [['q', 'q'], ['S', 'S']],
    axes: { x: [0, 2], y: [-1, 2.5], xl: '담수 강제 η₂', yl: '순환 q' }, keepState: true,
  },
  enso: {
    quantity: 'E = ω(T² + h²)/2',
    metrics: [['T', 'T (K)', 2], ['h', 'h', 2], ['R', '현재 R(t) (월⁻¹)', 3], ['month', '달 (0 = 1월)', 0]],
    series: [['T', 'T (Niño 대응)'], ['h', 'h (수온약층)']],
    axes: { auto: true, xl: 'h (수온약층 깊이 이상)', yl: 'T (SST 이상)' },
  },
  l63: {
    quantity: 'V = ½[x² + y² + (z − σ − ρ)²]',
    metrics: [['E', 'E = ½|x|²', 1], ['speed', '위상 속도 |ẋ|', 1], ['lyapunov', 'λ₁ 추정', 3], ['contraction', '∇·f', 2]],
    series: [['x', 'x'], ['E', 'E']],
    axes: { x: [-25, 25], y: [0, 55], xl: 'x', yl: 'z' },
  },
  l96: {
    quantity: 'E = Σx²/(2N)',
    metrics: [['E', 'E', 2], ['max', 'max |xᵢ|', 2], ['mean', '⟨x⟩', 2], ['lyapunov', 'λ₁ 추정', 2]],
    series: [['E', 'E'], ['max', 'max |xᵢ|']],
    range: p => Math.max(1.6 * p.F, 3),
  },
  ks: {
    quantity: 'E = ½⟨u²⟩',
    metrics: [['E', 'E', 3], ['Z', 'Z = ½⟨u_x²⟩', 3], ['max', 'max |u|', 2], ['mean', '⟨u⟩ (보존)', 3], ['lyapunov', 'λ₁ 추정', 3]],
    series: [['E', 'E'], ['Z', 'Z'], ['max', 'max |u|']],
    range: () => 3,
  },
  qg2: {
    quantity: 'E = KE + APE',
    metrics: [['E', 'E', 3], ['KE', 'KE', 3], ['APE', 'APE', 3], ['Z', 'Z', 2], ['max', '최대 유속', 2]],
    series: [['E', 'E'], ['Z', 'Z'], ['max', '최대 유속']],
  },
};
const TERM_LABELS = {
  asr: 'ASR', olr: '−OLR', noise: '잡음 일', freshwater: '담수 강제 η₂', restoring: '복원 −η₃S', advection: '이류',
  growth: 'Bjerknes ωRT²', damping: '감쇠 −ωrh²', dissipation: '감쇠', forcing: '강제', production: '생성',
  hyperdiffusion: '초확산 소산', drag: '바닥 마찰', filter: '필터 소산', tendency: '실제 변화율', residual: '잔차',
};

let current = systems[0], params = {}, worker, id = 0, pending = false, running = false;
let history = [], trail = [], twinTrail = [], hov = null, last = null, errorStart = 0, fieldRange = null;

/* ---------------------------- overview ---------------------------- */
function renderOverview(activeTask = null) {
  $('cl-task-chips').innerHTML = tasks.map(t => `<button type="button" data-task="${t.id}" aria-pressed="${t.id === activeTask}">${t.name}</button>`).join('');
  const rows = systems.map(s => {
    const hit = activeTask && s.tasks[activeTask];
    return `<tr class="${activeTask && !hit ? 'cl-dim' : ''}"><th scope="row"><button type="button" class="text-btn" data-system="${s.id}">${s.name}</button></th><td>${s.dim}<small>${s.dimNote}</small></td><td>${s.predicts}</td><td>${s.physics}</td><td>${s.omitted}</td><td>${s.cost}</td><td>${Object.keys(s.tasks).map(k => tasks.find(t => t.id === k).name).join(' · ')}</td></tr>`;
  }).join('');
  const tail = ladderTail.map(r => `<tr class="cl-tail"><th scope="row">${r.link ? `<a href="${r.link}">${r.name}</a>` : r.name}</th><td>${r.dim}</td><td>${r.predicts}</td><td>${r.physics}</td><td>—</td><td>${r.cost}</td><td>—</td></tr>`).join('');
  $('cl-ladder').innerHTML = `<thead><tr><th>시스템</th><th>상태 차원</th><th>무엇을 예측·설명하나</th><th>꼭 필요한 물리</th><th>빠진 물리</th><th>1 스텝 비용</th><th>주로 쓰이는 task</th></tr></thead><tbody>${rows}${tail}</tbody>`;
  if (!activeTask) { $('cl-task-view').innerHTML = '<p class="ol-fine">위에서 task를 고르면 각 시스템이 그 task에서 어떻게 쓰이는지 나란히 비교합니다.</p>'; return; }
  const t = tasks.find(t => t.id === activeTask);
  const users = systems.filter(s => s.tasks[activeTask]);
  $('cl-task-view').innerHTML = `<p>${t.desc}</p><div class="comparison-scroll"><table class="cl-table"><thead><tr><th>시스템 (차원)</th><th>보편적 method</th><th>이 시스템으로 푸는 방법</th><th>중요해지는 문제</th></tr></thead><tbody>${users.map(s => { const x = s.tasks[activeTask]; return `<tr><th scope="row"><button type="button" class="text-btn" data-system="${s.id}">${s.short}</button><small>dim ${s.dim}</small></th><td>${x.method}</td><td>${x.how}</td><td>${x.issues}</td></tr>`; }).join('')}</tbody></table></div>`;
}

/* ----------------------------- details ---------------------------- */
function typeset(el, tries = 0) {
  const mj = window.MathJax;
  if (mj?.typesetPromise) { (mj.startup?.promise ?? Promise.resolve()).then(() => mj.typesetPromise([el])).catch(() => {}); return; }
  if (tries < 50) setTimeout(() => typeset(el, tries + 1), 200);
}
function renderDetail() {
  const s = current;
  $('cl-detail-title').textContent = `${s.name} · 상태 차원 ${s.dim}`;
  $('cl-equations').innerHTML = s.equations.map(e => `\\[${e}\\]`).join('');
  $('cl-variables').innerHTML = s.variables;
  $('cl-physics').innerHTML = `<div><h4>무엇을 예측·설명하나</h4><p>${s.predicts}</p></div><div><h4>꼭 필요한 물리</h4><p>${s.physics}</p></div><div><h4>빠진 물리</h4><p>${s.omitted}</p></div><div><h4>차원과 계산</h4><p>상태 차원 ${s.dim} (${s.dimNote}), 1 스텝 비용 ${s.cost}. 시간 단위: ${s.timeUnit}.</p></div>`;
  $('cl-diagnostics').innerHTML = s.diagnostics.map(d => `<div class="cl-diag"><h4>${d.name}</h4><div class="cl-math">\\[${d.tex}\\]</div><p>${d.explain}</p></div>`).join('');
  $('cl-numerics').textContent = s.numerics;
  $('cl-tasks').innerHTML = `<thead><tr><th>Task</th><th>보편적 method</th><th>푸는 방법</th><th>중요해지는 문제</th></tr></thead><tbody>${Object.entries(s.tasks).map(([k, x]) => `<tr><th scope="row">${tasks.find(t => t.id === k).name}</th><td>${x.method}</td><td>${x.how}</td><td>${x.issues}</td></tr>`).join('')}</tbody>`;
  $('cl-refs').innerHTML = s.refs.map(r => `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title} ↗</a></li>`).join('');
  typeset($('cl-detail'));
}

/* ----------------------------- controls --------------------------- */
function renderControls() {
  const s = current;
  $('cl-tabs').innerHTML = systems.map(x => `<button type="button" role="tab" data-system="${x.id}" aria-selected="${x.id === s.id}">${x.short} <small>dim ${x.dim}</small></button>`).join('');
  $('cl-summary').textContent = s.summary;
  $('cl-params').innerHTML = s.params.map(p => p.options
    ? `<label for="cl-p-${p.key}">${p.label}<select id="cl-p-${p.key}" data-param="${p.key}">${p.options.map(([v, l]) => `<option value="${v}" ${String(params[p.key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`
    : `<label class="sim-range-label" for="cl-p-${p.key}"><span>${p.label}<output id="cl-o-${p.key}">${+Number(params[p.key]).toFixed(4)}</output></span><input type="range" id="cl-p-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${params[p.key]}" data-param="${p.key}"></label>`).join('');
  $('cl-keep-wrap').hidden = !UI[s.id].keepState;
  $('cl-perturb').hidden = !s.twin;
  $('cl-error-panel').hidden = !s.twin;
  $('cl-field-wrap').hidden = !s.fields;
  if (s.fields) $('cl-field').innerHTML = s.fields.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  $('cl-budget-title').textContent = `${UI[s.id].quantity}의 수지`;
  $('cl-pending').hidden = true;
  $('cl-error-note').textContent = '';
}

function selectSystem(sysId, scroll = false) {
  current = systems.find(s => s.id === sysId);
  params = { ...DEFAULTS[sysId] };
  trail = []; twinTrail = [];
  renderControls(); renderDetail(); start();
  if (scroll) $('cl-sim').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/* ------------------------------ worker ---------------------------- */
function status(text, error = false) { $('cl-status').textContent = text; $('cl-status').classList.toggle('sim-error', error); }
function setRunning(v) {
  running = v; $('cl-play').textContent = v ? '❚❚ 일시정지' : '▶ 재생'; $('cl-play').setAttribute('aria-pressed', String(v));
  if (v) request(); else if (last) status(`일시정지 · ${last.steps.toLocaleString()} steps · t = ${fmt(last.t, 2)} ${current.timeUnit}`);
}

function start({ keep = false } = {}) {
  setRunning(false); id++; pending = false;
  const p = { ...params };
  if (keep && last) {
    if (current.id === 'ebm') p.T0 = last.diag.T;
    if (current.id === 'stommel') { p.T0 = last.diag.T; p.S0 = last.diag.S; }
  } else { trail = []; twinTrail = []; }
  history = []; hov = null; last = null; errorStart = 0; fieldRange = null;
  $('cl-pending').hidden = true;
  if (worker) worker.terminate();
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); }
  catch { status('Worker를 시작할 수 없습니다. HTTP 서버에서 열어 주세요.', true); return; }
  worker.onmessage = ({ data }) => { if (data.id === id) receive(data); };
  worker.onerror = () => { pending = false; setRunning(false); status('계산 스크립트를 불러오지 못했습니다.', true); };
  pending = true;
  worker.postMessage({ type: 'init', id, system: current.id, params: p, field: $('cl-field').value || 'q1', hovEvery: current.hovEvery || 1 });
  status('초기 상태를 준비하고 있습니다…');
}
function request(single = false) {
  if (!worker || pending || (!running && !single)) return;
  pending = true;
  const steps = single ? 1 : current.stepsPerFrame * Number($('cl-rate').value);
  worker.postMessage({ type: 'advance', steps });
}
function receive(data) {
  if (data.type === 'error') { pending = false; setRunning(false); status(data.message, true); return; }
  // Perturb/view replies only refresh the picture; the play loop is driven by advance replies.
  if (data.req === 'perturb' || data.req === 'view') { last = data; draw(); return; }
  pending = false;
  last = data;
  if (data.result.elapsed > 0 || !history.length) {
    history.push({ t: data.t, diag: data.diag, rates: data.result.rates });
    if (history.length > 2400) history = history.filter((_, i) => i % 2 === 0 || i === history.length - 1);
  }
  // Skip points that barely moved, so a long rest at an equilibrium does not push the earlier path out of the buffer.
  const ax = UI[current.id].axes, tol = ax && !ax.auto ? [(ax.x[1] - ax.x[0]) * 1e-3, (ax.y[1] - ax.y[0]) * 1e-3] : [0, 0];
  for (const [x, y, tx, ty] of data.trail) {
    const prev = trail.at(-1);
    if (prev && Math.abs(x - prev[0]) < tol[0] && Math.abs(y - prev[1]) < tol[1]) continue;
    trail.push([x, y]); if (tx !== undefined) twinTrail.push([tx, ty]);
  }
  const maxTrail = current.id === 'l63' ? 2500 : 4000;
  if (trail.length > maxTrail) trail.splice(0, trail.length - maxTrail);
  if (twinTrail.length > maxTrail) twinTrail.splice(0, twinTrail.length - maxTrail);
  if (data.rows.length) pushRows(data.rows);
  draw();
  status(`${running ? '계산 중' : '일시정지'} · ${data.steps.toLocaleString()} steps · t = ${fmt(data.t, 2)} ${current.timeUnit}`);
  if (running) requestAnimationFrame(() => request());
}

/* ------------------------------ drawing --------------------------- */
function diverging(v) {
  const t = Math.max(-1, Math.min(1, v)), a = Math.abs(t), base = [239, 243, 227], end = t < 0 ? [26, 88, 145] : [185, 68, 52];
  return base.map((b, i) => Math.round(b + (end[i] - b) * a));
}
function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}
function axesFrame(ctx, W, H, pad, xr, yr, xl, yl) {
  ctx.strokeStyle = css('--global-divider-color', '#ccc'); ctx.fillStyle = css('--global-text-color-light', '#777'); ctx.lineWidth = 1; ctx.font = '12px sans-serif';
  ctx.strokeRect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b);
  for (let i = 0; i <= 4; i++) {
    const x = pad.l + (W - pad.l - pad.r) * i / 4, y = pad.t + (H - pad.t - pad.b) * i / 4;
    ctx.fillText(fmt(xr[0] + (xr[1] - xr[0]) * i / 4, 2), x - 12, H - pad.b + 16);
    ctx.fillText(fmt(yr[1] - (yr[1] - yr[0]) * i / 4, 1), 4, y + 4);
  }
  ctx.fillText(xl, (W - ctx.measureText(xl).width) / 2, H - 6);
  ctx.fillText(yl, pad.l + 6, pad.t + 14);
}
function drawMain() {
  const canvas = $('cl-main'), ctx = setupCanvas(canvas), W = canvas.width, H = canvas.height, ui = UI[current.id];
  $('cl-state').hidden = current.view !== 'hovmoller';
  if (current.view === 'branch' || current.view === 'phase') {
    const pad = { l: 52, r: 16, t: 24, b: 44 };
    let xr = ui.axes.x, yr = ui.axes.y;
    if (ui.axes.auto) { let m = 0.5; for (const [x, y] of trail) m = Math.max(m, Math.abs(x), Math.abs(y)); m *= 1.1; xr = [-m, m]; yr = [-m, m]; }
    const X = x => pad.l + (x - xr[0]) / (xr[1] - xr[0]) * (W - pad.l - pad.r), Y = y => H - pad.b - (y - yr[0]) / (yr[1] - yr[0]) * (H - pad.t - pad.b);
    axesFrame(ctx, W, H, pad, xr, yr, ui.axes.xl, ui.axes.yl);
    ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b); ctx.clip();
    if (current.view === 'branch') {
      const branch = current.id === 'ebm' ? ebmBranch(params.forcing) : stommelBranch(params);
      ctx.lineWidth = 2; ctx.strokeStyle = css('--global-text-color', '#333');
      for (let i = 1; i < branch.length; i++) {
        const a = branch[i - 1], b = branch[i];
        ctx.setLineDash(a.stable && b.stable ? [] : [5, 5]); ctx.globalAlpha = a.stable && b.stable ? 0.9 : 0.5;
        ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    if (current.id === 'enso' || current.id === 'stommel' || current.id === 'ebm') { ctx.strokeStyle = css('--global-divider-color', '#ccc'); ctx.beginPath(); ctx.moveTo(X(xr[0]), Y(0)); ctx.lineTo(X(xr[1]), Y(0)); ctx.stroke(); }
    const line = (pts, color, alpha) => { if (pts.length < 2) return; ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.globalAlpha = alpha; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke(); ctx.globalAlpha = 1; };
    line(trail, PALETTE[0], 0.8); line(twinTrail, PALETTE[1], 0.6);
    const dot = (pt, color) => { if (!pt) return; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(pt[0]), Y(pt[1]), 5, 0, 2 * Math.PI); ctx.fill(); };
    dot(trail.at(-1), PALETTE[0]); dot(twinTrail.at(-1), PALETTE[1]);
    ctx.restore();
    $('cl-main-note').textContent = current.view === 'branch' ? '실선: 안정 평형 · 점선: 불안정 평형 · 파란 점: 현재 상태와 지나온 경로' : current.twin ? '파랑: 기준 궤적 · 주황: 10⁻⁶만큼 다르게 시작한 쌍둥이 궤적' : '파랑: 위상 평면 궤적. 반시계 회전이 충전→방전 순환입니다.';
  } else if (current.view === 'hovmoller' && hov) {
    ctx.imageSmoothingEnabled = true; ctx.drawImage(hov.canvas, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.font = '12px sans-serif'; ctx.fillText('시간 ↓ (아래가 최신)', 8, 16); ctx.fillText(current.id === 'l96' ? 'i →' : 'x →', W - 30, H - 8);
    $('cl-main-note').textContent = `Hovmöller 도표: 가로는 공간(${current.id === 'l96' ? '격자 i' : 'x'}), 세로는 시간입니다. 색 범위 ±${fmt(UI[current.id].range(params), 1)}.`;
    drawState();
  } else if (current.view === 'field' && last?.view?.kind === 'field') {
    const { n, values } = last.view; let m = 1e-12; for (const v of values) m = Math.max(m, Math.abs(v));
    fieldRange = fieldRange ? 0.9 * fieldRange + 0.1 * m : m;
    const off = document.createElement('canvas'); off.width = off.height = n; const octx = off.getContext('2d'), img = octx.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = diverging(values[y * n + x] / fieldRange), j = ((n - 1 - y) * n + x) * 4; img.data[j] = c[0]; img.data[j + 1] = c[1]; img.data[j + 2] = c[2]; img.data[j + 3] = 255; }
    octx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; const side = Math.min(W, H), ox = (W - side) / 2; ctx.drawImage(off, ox, 0, side, side);
    $('cl-main-note').textContent = `색 범위 ±${fmt(fieldRange, 3)} (자동). 파랑과 빨강은 부호입니다. 평균류는 상층 동쪽(+U), 하층 서쪽(−U).`;
  }
}
function pushRows(rows) {
  const n = rows[0].length, height = 360;
  if (!hov || hov.n !== n) { const c = document.createElement('canvas'); c.width = n; c.height = height; hov = { n, canvas: c, ctx: c.getContext('2d') }; hov.ctx.fillStyle = '#eff3e3'; hov.ctx.fillRect(0, 0, n, height); }
  const range = UI[current.id].range(params), k = rows.length;
  hov.ctx.drawImage(hov.canvas, 0, -k);
  const img = hov.ctx.createImageData(n, k);
  rows.forEach((row, r) => { for (let x = 0; x < n; x++) { const c = diverging(row[x] / range), j = (r * n + x) * 4; img.data[j] = c[0]; img.data[j + 1] = c[1]; img.data[j + 2] = c[2]; img.data[j + 3] = 255; } });
  hov.ctx.putImageData(img, 0, height - k);
}
function drawState() {
  const canvas = $('cl-state'), ctx = setupCanvas(canvas), W = canvas.width, H = canvas.height, v = last?.view;
  if (!v || v.kind !== 'row') return;
  const range = UI[current.id].range(params), n = v.values.length;
  const X = i => i / (n - 1) * W, Y = u => H / 2 - u / range * (H / 2 - 4);
  ctx.strokeStyle = css('--global-divider-color', '#ccc'); ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
  for (const [arr, color] of [[v.twin, PALETTE[1]], [v.values, PALETTE[0]]]) { ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); arr.forEach((u, i) => (i ? ctx.lineTo(X(i), Y(u)) : ctx.moveTo(X(i), Y(u)))); ctx.stroke(); }
}

// Stacked mini panels, each with its own scale, sharing the time axis.
function drawSeries() {
  const canvas = $('cl-diag-chart'), ctx = setupCanvas(canvas), W = canvas.width, H = canvas.height, series = UI[current.id].series;
  $('cl-diag-legend').innerHTML = series.map(([, l], i) => `<span><i style="background:${PALETTE[i]}"></i>${l}</span>`).join('');
  if (history.length < 2) return;
  const t0 = history[0].t, t1 = Math.max(history.at(-1).t, t0 + 1e-9), left = 56, right = 10, rowH = H / series.length;
  ctx.font = '11px sans-serif';
  series.forEach(([key], r) => {
    const vals = history.map(h => h.diag[key]).filter(Number.isFinite); if (!vals.length) return;
    let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1e-12) { hi += 1e-6; lo -= 1e-6; }
    const top = r * rowH + 6, bot = (r + 1) * rowH - 6, Y = v => bot - (v - lo) / (hi - lo) * (bot - top), X = t => left + (t - t0) / (t1 - t0) * (W - left - right);
    ctx.strokeStyle = css('--global-divider-color', '#ddd'); ctx.strokeRect(left, top, W - left - right, bot - top);
    ctx.fillStyle = css('--global-text-color-light', '#777'); ctx.fillText(fmt(hi, 2), 2, top + 9); ctx.fillText(fmt(lo, 2), 2, bot);
    ctx.strokeStyle = PALETTE[r]; ctx.lineWidth = 1.5; ctx.beginPath(); let first = true;
    for (const h of history) { const v = h.diag[key]; if (!Number.isFinite(v)) continue; first ? ctx.moveTo(X(h.t), Y(v)) : ctx.lineTo(X(h.t), Y(v)); first = false; }
    ctx.stroke();
  });
  ctx.fillStyle = css('--global-text-color-light', '#777'); ctx.fillText(`t = ${fmt(t0, 1)}`, left, H - 1); ctx.fillText(`${fmt(t1, 1)} ${current.timeUnit}`, W - 90, H - 1);
}
function drawBudget() {
  const canvas = $('cl-budget-chart'), ctx = setupCanvas(canvas), W = canvas.width, H = canvas.height;
  const rows = history.filter(h => h.rates && Object.keys(h.rates).length);
  const keys = rows.length ? Object.keys(rows.at(-1).rates).filter(k => k !== 'residual') : [];
  const color = k => (k === 'tendency' ? css('--global-text-color', '#333') : PALETTE[keys.filter(x => x !== 'tendency').indexOf(k) % PALETTE.length]);
  $('cl-budget-legend').innerHTML = keys.map(k => `<span><i style="background:${color(k)}${k === 'tendency' ? ';height:3px' : ''}"></i>${TERM_LABELS[k] ?? k}</span>`).join('');
  if (rows.length < 2) { $('cl-budget-residual').textContent = ''; return; }
  const left = 56, right = 10, top = 10, bottom = 22, t0 = rows[0].t, t1 = Math.max(rows.at(-1).t, t0 + 1e-9);
  let lo = 0, hi = 0; for (const h of rows) for (const k of keys) { lo = Math.min(lo, h.rates[k]); hi = Math.max(hi, h.rates[k]); }
  if (hi - lo < 1e-12) { hi += 1e-6; lo -= 1e-6; }
  const X = t => left + (t - t0) / (t1 - t0) * (W - left - right), Y = v => H - bottom - (v - lo) / (hi - lo) * (H - top - bottom);
  ctx.strokeStyle = css('--global-divider-color', '#ddd'); ctx.strokeRect(left, top, W - left - right, H - top - bottom);
  ctx.beginPath(); ctx.moveTo(left, Y(0)); ctx.lineTo(W - right, Y(0)); ctx.stroke();
  ctx.font = '11px sans-serif'; ctx.fillStyle = css('--global-text-color-light', '#777'); ctx.fillText(fmt(hi, 2), 2, top + 9); ctx.fillText(fmt(lo, 2), 2, H - bottom);
  for (const k of keys) {
    ctx.strokeStyle = color(k); ctx.lineWidth = k === 'tendency' ? 2.5 : 1.5; ctx.setLineDash(k === 'tendency' ? [6, 4] : []);
    ctx.beginPath(); rows.forEach((h, i) => (i ? ctx.lineTo(X(h.t), Y(h.rates[k])) : ctx.moveTo(X(h.t), Y(h.rates[k])))); ctx.stroke();
  }
  ctx.setLineDash([]);
  const r = rows.at(-1).rates, scale = Math.max(...keys.map(k => Math.abs(r[k])), 1e-300);
  $('cl-budget-residual').textContent = `최근 구간 잔차 = 실제 변화율 − Σ(항) = ${fmt(r.residual)} (가장 큰 항 대비 ${fmt(Math.abs(r.residual) / scale)}). 시간 적분 오차의 크기입니다.`;
}
function drawError() {
  if (!current.twin) return;
  const canvas = $('cl-error-chart'), ctx = setupCanvas(canvas), W = canvas.width, H = canvas.height;
  const rows = history.filter(h => h.t >= errorStart && Number.isFinite(h.diag.error) && h.diag.error > 0);
  const left = 56, right = 10, top = 10, bottom = 22, lo = -7, hi = 2;
  const t0 = errorStart, t1 = Math.max(rows.at(-1)?.t ?? t0 + 1, t0 + 1);
  const X = t => left + (t - t0) / (t1 - t0) * (W - left - right), Y = v => H - bottom - (v - lo) / (hi - lo) * (H - top - bottom);
  ctx.strokeStyle = css('--global-divider-color', '#ddd'); ctx.strokeRect(left, top, W - left - right, H - top - bottom);
  ctx.font = '11px sans-serif'; ctx.fillStyle = css('--global-text-color-light', '#777');
  for (let e = lo; e <= hi; e += 3) ctx.fillText(`10^${e}`, 4, Y(e) + 4);
  if (rows.length < 2) return;
  ctx.strokeStyle = PALETTE[1]; ctx.lineWidth = 1.8; ctx.beginPath();
  rows.forEach((h, i) => { const v = Math.max(lo, Math.log10(h.diag.error)); i ? ctx.lineTo(X(h.t), Y(v)) : ctx.moveTo(X(h.t), Y(v)); }); ctx.stroke();
  const lam = rows.at(-1).diag.lyapunov;
  if (Number.isFinite(lam) && lam > 0) {
    ctx.setLineDash([5, 4]); ctx.strokeStyle = css('--global-text-color-light', '#888'); ctx.beginPath();
    ctx.moveTo(X(t0), Y(-6)); ctx.lineTo(X(t1), Y(-6 + lam * (t1 - t0) / Math.LN10)); ctx.stroke(); ctx.setLineDash([]);
    $('cl-error-note').textContent = `주황: |δ(t)| (로그). 점선: 기울기 λ₁ ≈ ${fmt(lam, 3)}의 지수 성장. Lyapunov 시간 1/λ₁ ≈ ${fmt(1 / lam, 2)} ${current.timeUnit}, 10⁻⁶ 오차가 O(1)이 되는 데 약 ${fmt(Math.log(1e6) / lam, 1)}.`;
  }
}
function renderMetrics() {
  if (!last) return;
  const d = last.diag;
  $('cl-metrics').innerHTML = UI[current.id].metrics.map(([k, l, digits]) => `<div><small>${l}</small><b>${fmt(d[k], digits)}</b></div>`).join('');
  $('cl-time').textContent = `t = ${fmt(last.t, 2)} ${current.timeUnit}`;
}
function draw() { drawMain(); drawSeries(); drawBudget(); drawError(); renderMetrics(); }

/* ------------------------------ events ---------------------------- */
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.system) selectSystem(b.dataset.system, !b.closest('#cl-tabs'));
  if (b.dataset.task) { const on = b.getAttribute('aria-pressed') !== 'true'; renderOverview(on ? b.dataset.task : null); }
});
$('cl-params').addEventListener('input', e => {
  const key = e.target.dataset.param; if (!key) return;
  const raw = e.target.value; params[key] = Number.isNaN(Number(raw)) ? raw : Number(raw);
  const out = $(`cl-o-${key}`); if (out) out.textContent = raw;
  $('cl-pending').hidden = false;
});
$('cl-apply').addEventListener('click', () => start({ keep: UI[current.id].keepState && $('cl-keep').checked }));
$('cl-play').addEventListener('click', () => setRunning(!running));
$('cl-step').addEventListener('click', () => { setRunning(false); request(true); });
$('cl-perturb').addEventListener('click', () => { if (!worker || !last) return; errorStart = last.t; worker.postMessage({ type: 'perturb' }); });
$('cl-field').addEventListener('change', () => { if (!worker) return; fieldRange = null; worker.postMessage({ type: 'view', field: $('cl-field').value }); });
document.addEventListener('visibilitychange', () => { if (document.hidden) setRunning(false); });
new MutationObserver(() => draw()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

$('cl-overview-refs').innerHTML = overviewRefs.map(r => `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title} ↗</a></li>`).join('');
renderOverview();
selectSystem(new URLSearchParams(location.search).get('system') in DEFAULTS ? new URLSearchParams(location.search).get('system') : 'ebm');
