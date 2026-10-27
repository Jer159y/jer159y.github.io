// View renderers. Each view draws the current simulation state into one canvas and returns a caption.
import { Plot, PALETTE, css, fmt, extent, positiveExtent, drawField, heatmap } from './plots.js';
import { mean, std, histogram, acf, crossCorr, psd, rollingIndicators, polyfit, residence, runningMean, mhwClimatology, detectMhw } from './stats.js';
import { ebmBranch, stommelBranch } from './sys-ode.js';
import { spinupYearly } from './maooam-spinup.js';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const boxFull = (W, H) => ({ l: 58, t: 24, w: W - 76, h: H - 64 });
// n panels side by side (or stacked when `rows`).
function grid(W, H, cols, rows = 1, gap = 58) {
  const out = [], w = (W - 58 - (cols - 1) * gap - 18) / cols, h = (H - 30 - (rows - 1) * 46 - 40) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ l: 58 + c * (w + gap), t: 24 + r * (h + 46), w, h });
  return out;
}
const S = (st, key) => st.samples.data[key] ?? [];
const label = (st, key) => st.ui.labels?.[key] ?? key;
const legend = items => items.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('');

export const VIEWS = {
  branch: {
    label: '평형 가지', render(ctx, W, H, st) {
      const ax = st.ui.axes, p = new Plot(ctx, boxFull(W, H), { x: ax.x, y: ax.y, xlabel: ax.xl, ylabel: ax.yl }); p.axes({ zero: true });
      const br = st.sys.id === 'ebm' ? ebmBranch(st.params.forcing) : stommelBranch(st.params);
      for (const stable of [true, false]) {
        let seg = [];
        const flush = () => { if (seg.length > 1) p.line(seg.map(q => q.x), seg.map(q => q.y), css('--global-text-color', '#333'), { width: 2, dash: stable ? [] : [5, 5], alpha: stable ? 0.9 : 0.5 }); seg = []; };
        br.forEach(q => { if (q.stable === stable) seg.push(q); else flush(); }); flush();
      }
      p.line(st.trail.map(q => q[0]), st.trail.map(q => q[1]), PALETTE[0], { alpha: 0.8 });
      const last = st.trail.at(-1); if (last) p.points([last[0]], [last[1]], PALETTE[0], { r: 5, alpha: 1 });
      return { caption: '실선: 안정 평형 · 점선: 불안정 평형 · 파란 선: 현재 상태가 지나온 경로. "현재 상태에서 이어가기"를 켜고 강제를 바꾸면 hysteresis를 따라갑니다.' };
    },
  },
  phase: {
    label: '위상 공간', render(ctx, W, H, st) {
      const ax = st.ui.axes; let xr = ax?.x, yr = ax?.y;
      if (!ax || ax.auto) { xr = extent([st.trail.map(q => q[0])]); yr = extent([st.trail.map(q => q[1])]); }
      const p = new Plot(ctx, boxFull(W, H), { x: xr, y: yr, xlabel: ax?.xl, ylabel: ax?.yl }); p.axes({ zero: true });
      p.line(st.trail.map(q => q[0]), st.trail.map(q => q[1]), PALETTE[0], { width: 1.2, alpha: 0.75 });
      if (st.twinTrail.length) p.line(st.twinTrail.map(q => q[0]), st.twinTrail.map(q => q[1]), PALETTE[1], { width: 1.2, alpha: 0.6 });
      const a = st.trail.at(-1), b = st.twinTrail.at(-1);
      if (a) p.points([a[0]], [a[1]], PALETTE[0], { r: 5, alpha: 1 }); if (b) p.points([b[0]], [b[1]], PALETTE[1], { r: 5, alpha: 1 });
      return { caption: st.ui.phaseNote ?? (st.twinTrail.length ? '파랑: 기준 궤적 · 주황: 아주 작게 다르게 시작한 쌍둥이 궤적' : '상태의 궤적') };
    },
  },
  samplephase: {
    label: '위상 투영', render(ctx, W, H, st) {
      const pairs = st.ui.pairs, boxes = grid(W, H, pairs.length);
      pairs.forEach(([a, b], i) => {
        const xs = S(st, a), ys = S(st, b), p = new Plot(ctx, boxes[i], { x: extent([xs]), y: extent([ys]), xlabel: label(st, a), ylabel: label(st, b) });
        p.axes(); p.line(xs, ys, PALETTE[i], { width: 1, alpha: 0.7 }); if (xs.length) p.points([xs.at(-1)], [ys.at(-1)], PALETTE[i], { r: 4, alpha: 1 });
      });
      return { caption: '진단량 쌍의 위상 공간 투영. 고차원 상태를 두 좌표로 본 것이므로 교차는 실제 궤적의 교차가 아닙니다.' };
    },
  },
  series: {
    label: '시계열', render(ctx, W, H, st) {
      const keys = st.ui.series, t = st.samples.t, boxes = grid(W, H, 1, keys.length, 0).map((b, i) => ({ ...b, t: 24 + i * (H - 54) / keys.length, h: (H - 54) / keys.length - 22 }));
      keys.forEach((k, i) => {
        const v = S(st, k), p = new Plot(ctx, boxes[i], { x: extent([t], 0), y: extent([v]), ylabel: label(st, k), xlabel: i === keys.length - 1 ? `t (${st.sys.timeUnit})` : '' });
        p.axes({ zero: true }); p.line(t, v, PALETTE[i]);
      });
      return { caption: `표본 간격 ${fmt(st.ui.sampleDt, 3)} ${st.sys.timeUnit}. 최근 ${t.length.toLocaleString()}개 표본.` };
    },
  },
  pdf: {
    label: 'PDF', render(ctx, W, H, st) {
      const keys = st.ui.series.slice(0, 3), boxes = grid(W, H, keys.length); const notes = [];
      keys.forEach((k, i) => {
        const v = S(st, k); if (v.length < 20) return;
        const m = mean(v), s = std(v);
        if (!(s > 1e-9 * Math.max(1, Math.abs(m)))) { notes.push(`${label(st, k)}: 변동이 거의 없음(평형에 머무름) — 잡음을 주면 분포가 생깁니다`); return; }
        const h = histogram(v, 40), g = h.x.map(x => Math.exp(-((x - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI)));
        const p = new Plot(ctx, boxes[i], { x: [h.lo, h.hi], y: [0, Math.max(...h.density, ...g) * 1.1], xlabel: label(st, k) }); p.axes();
        p.bars(h.x, h.density, (h.hi - h.lo) / 40, PALETTE[i]); p.line(h.x, g, css('--global-text-color', '#333'), { dash: [4, 3] });
        const sk = mean(v.map(x => ((x - m) / s) ** 3)), ku = mean(v.map(x => ((x - m) / s) ** 4)) - 3;
        notes.push(`${label(st, k)}: 평균 ${fmt(m)}, 표준편차 ${fmt(s)}, 왜도 ${fmt(sk, 2)}, 초과 첨도 ${fmt(ku, 2)}`);
      });
      return { caption: `점선은 같은 평균·분산의 정규분포. ${notes.join(' · ')}` };
    },
  },
  psd: {
    label: '스펙트럼 (PSD)', render(ctx, W, H, st) {
      const keys = st.ui.series.slice(0, 3), dt = st.ui.sampleDt, curves = keys.map(k => psd(S(st, k), dt, 1024)), extra = [];
      if (st.sys.id === 'enso' && st.real?.nino) extra.push(psd(st.real.nino.anom, 1, 256));
      const all = [...curves, ...extra].filter(c => c.f.length);
      if (!all.length) return { caption: '표본이 더 쌓이면 스펙트럼을 계산합니다.' };
      const p = new Plot(ctx, boxFull(W, H), { x: positiveExtent(all.map(c => c.f)), y: positiveExtent(all.map(c => c.p)), logx: true, logy: true, xlabel: `진동수 (주기/${st.sys.timeUnit})` });
      p.axes(); curves.forEach((c, i) => p.line(c.f, c.p, PALETTE[i]));
      if (extra.length) p.line(extra[0].f, extra[0].p, css('--global-text-color', '#333'), { dash: [5, 3] });
      st.legend(legend([...keys.map((k, i) => [PALETTE[i], label(st, k)]), ...(extra.length ? [[css('--global-text-color', '#333'), '관측 Niño3.4 (ERSSTv5)']] : [])]));
      const peaks = curves.map((c, i) => { let j = 0; c.p.forEach((v, k) => { if (v > c.p[j]) j = k; }); return c.f.length ? `${label(st, keys[i])} 최대 봉우리 주기 ≈ ${fmt(1 / c.f[j], 2)} ${st.sys.timeUnit}` : ''; });
      return { caption: `Welch 방법(Hann 창, 50% 겹침). ${peaks.filter(Boolean).join(' · ')}. 기록이 짧으면 저주파 쪽 추정은 불확실합니다.` };
    },
  },
  acf: {
    label: '자기상관 (ACF)', render(ctx, W, H, st) {
      const keys = st.ui.series.slice(0, 3), dt = st.ui.sampleDt, n = S(st, keys[0]).length, maxLag = Math.max(5, Math.min(Math.floor(n / 3), st.ui.acfLag ?? 400));
      const p = new Plot(ctx, boxFull(W, H), { x: [0, maxLag * dt], y: [-1, 1], xlabel: `지연 (${st.sys.timeUnit})` }); p.axes({ zero: true });
      const notes = [];
      keys.forEach((k, i) => { const a = acf(S(st, k), maxLag); p.line(a.r.map((_, j) => j * dt), a.r, PALETTE[i]); notes.push(`${label(st, k)}: e-folding ≈ ${Number.isFinite(a.efold) ? fmt(a.efold * dt, 2) : '—'}`); });
      p.line([0, maxLag * dt], [1 / Math.E, 1 / Math.E], css('--global-text-color-light', '#888'), { dash: [3, 3], width: 1 });
      st.legend(legend(keys.map((k, i) => [PALETTE[i], label(st, k)])));
      return { caption: `${notes.join(' · ')} ${st.sys.timeUnit}. 점선은 1/e. 기억(memory)의 길이가 예측 가능한 시간척도를 제한합니다.` };
    },
  },
  lagcorr: {
    label: '지연 상관', render(ctx, W, H, st) {
      const [a, b] = st.ui.lagPair, dt = st.ui.sampleDt, n = S(st, a).length, maxLag = Math.max(3, Math.min(Math.floor(n / 4), st.ui.lagMax ?? 60));
      const c = crossCorr(S(st, a), S(st, b), maxLag), lags = c.map((_, i) => (i - maxLag) * dt);
      const p = new Plot(ctx, boxFull(W, H), { x: [lags[0], lags.at(-1)], y: [-1, 1], xlabel: `지연 τ (${st.sys.timeUnit}) : corr(${label(st, a)}(t), ${label(st, b)}(t+τ))` }); p.axes({ zero: true });
      p.line(lags, c, PALETTE[0], { width: 2 });
      let jp = 0, jn = 0; c.forEach((v, i) => { if (v > c[jp]) jp = i; if (v < c[jn]) jn = i; });
      const pos = c[jp] > 0 ? `양의 상관 최대: τ ≈ ${fmt(lags[jp], 2)} ${st.sys.timeUnit} (r = ${fmt(c[jp], 2)})` : '양의 상관 없음';
      return { caption: `${pos}, 음의 상관 최대: τ ≈ ${fmt(lags[jn], 2)} (r = ${fmt(c[jn], 2)}). τ > 0에서의 양의 상관은 ${label(st, a)}가 ${label(st, b)}보다 앞서 같은 부호로 나타난다는 뜻입니다.` };
    },
  },
  budget: {
    label: '수지', render(ctx, W, H, st) {
      const rows = st.history.filter(h => h.rates && Object.keys(h.rates).length);
      const keys = rows.length ? Object.keys(rows.at(-1).rates).filter(k => k !== 'residual') : [];
      if (rows.length < 2) return { caption: '재생하면 수지가 쌓입니다.' };
      const t = rows.map(h => h.t), p = new Plot(ctx, boxFull(W, H), { x: extent([t], 0), y: extent(keys.map(k => rows.map(h => h.rates[k]))), xlabel: `t (${st.sys.timeUnit})` }); p.axes({ zero: true });
      const color = k => (k === 'tendency' ? css('--global-text-color', '#333') : PALETTE[keys.filter(x => x !== 'tendency').indexOf(k) % PALETTE.length]);
      keys.forEach(k => p.line(t, rows.map(h => h.rates[k]), color(k), { width: k === 'tendency' ? 2.5 : 1.5, dash: k === 'tendency' ? [6, 4] : [] }));
      st.legend(legend(keys.map(k => [color(k), st.termLabel(k)])));
      const r = rows.at(-1).rates, scale = Math.max(...keys.map(k => Math.abs(r[k])), 1e-300);
      return { caption: `${st.ui.quantity}의 변화율을 항별로 나눈 것. 최근 구간 잔차 = 실제 변화율 − Σ항 = ${fmt(r.residual)} (가장 큰 항 대비 ${fmt(Math.abs(r.residual) / scale)}). ${st.ui.budgetNote ?? '잔차는 시간 적분 오차입니다.'}` };
    },
  },
  twin: {
    label: '쌍둥이 오차', render(ctx, W, H, st) {
      const rows = st.history.filter(h => h.t >= st.errorStart && h.diag.error > 0), lo = -9, hi = 2;
      const t0 = st.errorStart, t1 = Math.max(rows.at(-1)?.t ?? t0 + 1, t0 + 1e-6);
      const p = new Plot(ctx, boxFull(W, H), { x: [0, t1 - t0], y: [lo, hi], xlabel: `섭동 후 시간 (${st.sys.timeUnit})`, ylabel: 'log₁₀ |δ|' }); p.axes();
      if (rows.length < 2) return { caption: '재생하면 쌍둥이 궤적 사이 거리를 추적합니다.' };
      p.line(rows.map(h => h.t - t0), rows.map(h => Math.log10(h.diag.error)), PALETTE[1], { width: 2 });
      const lam = rows.at(-1).diag.lyapunov, d0 = Math.log10(rows[0].diag.error);
      if (lam > 0) p.line([0, t1 - t0], [d0, d0 + lam * (t1 - t0) / Math.LN10], css('--global-text-color-light', '#888'), { dash: [5, 4] });
      return { caption: lam > 0 ? `주황: 쌍둥이 거리. 점선: 기울기 λ₁ ≈ ${fmt(lam, 3)}의 지수 성장. Lyapunov 시간 1/λ₁ ≈ ${fmt(1 / lam, 2)} ${st.sys.timeUnit}. 오차는 끌개 크기에서 포화합니다.` : '쌍둥이 거리 (λ₁ 추정이 아직 불안정합니다).' };
    },
  },
  hovmoller: {
    label: 'Hovmöller', render(ctx, W, H, st) {
      if (!st.hov) return { caption: '재생하면 시간–공간 도표가 쌓입니다.' };
      const top = { l: 58, t: 10, w: W - 76, h: H - 130 };
      ctx.imageSmoothingEnabled = true; ctx.drawImage(st.hov.canvas, top.l, top.t, top.w, top.h);
      ctx.strokeStyle = css('--global-divider-color', '#ccc'); ctx.strokeRect(top.l, top.t, top.w, top.h);
      ctx.fillStyle = css('--global-text-color-light', '#777'); ctx.font = '11px sans-serif'; ctx.fillText('시간 ↓', 8, top.t + 12); ctx.fillText('최신', 18, top.t + top.h - 4);
      const v = st.last?.view, row = v?.row ?? v?.values; if (row) {
        const xs = Array.from(row, (_, i) => i), R = st.ui.range(st.params);
        const p = new Plot(ctx, { l: 58, t: H - 108, w: W - 76, h: 70 }, { x: [0, xs.length - 1], y: [-R, R], xlabel: st.ui.spaceLabel ?? '공간 격자' }); p.axes({ zero: true });
        if (v.twin) p.line(xs, Array.from(v.twin), PALETTE[1]); p.line(xs, Array.from(row), PALETTE[0]);
      }
      return { caption: `위: 가로 공간 × 세로 시간, 색 범위 ±${fmt(st.ui.range(st.params), 2)}. 아래: 현재 상태(파랑)${v?.twin ? '와 쌍둥이(주황)' : ''}. 기울어진 줄무늬는 전파하는 파동이고, 그 기울기가 전파 속도입니다.` };
    },
  },
  field: {
    label: '2D 장', render(ctx, W, H, st) {
      const v = st.last?.view; if (!v || v.kind !== 'field') return { caption: '' };
      const nx = v.nx ?? v.n, ny = v.ny ?? v.n, aspect = nx / ny, h = H - 40, w = Math.min(W - 120, h * aspect), box = { l: (W - w) / 2, t: 12, w, h: w / aspect };
      let m = 0; for (const x of v.values) m = Math.max(m, Math.abs(x)); st.fieldRange = st.fieldRange ? 0.85 * st.fieldRange + 0.15 * m : m;
      const R = drawField(ctx, v.values, nx, ny, box, { range: st.fieldRange || 1 });
      if (v.particles && st.opts.particles !== false) {
        ctx.fillStyle = '#111'; for (const [x, y] of v.particles) { ctx.beginPath(); ctx.arc(box.l + x * box.w, box.t + (1 - y) * box.h, 2.2, 0, 2 * Math.PI); ctx.fill(); }
      }
      return { caption: `${st.ui.fieldNote ?? ''} 색 범위 ±${fmt(R, 3)} (자동, 파랑 음수·빨강 양수).` };
    },
  },
  spectrum: {
    label: '에너지 스펙트럼', render(ctx, W, H, st) {
      const s = st.last?.spectrum; if (!s) return { caption: '' };
      const yr = positiveExtent([s.E]); yr[0] = Math.max(yr[0], yr[1] * 1e-8); // hide the filtered grid-scale tail
      const p = new Plot(ctx, boxFull(W, H), { x: positiveExtent([s.k]), y: yr, logx: true, logy: true, xlabel: '파수 k' }); p.axes();
      p.line(s.k, s.E, PALETTE[0], { width: 2 });
      const refs = st.ui.slopes ?? [];
      refs.forEach(([slope, lab], i) => { const k0 = s.k[Math.floor(s.k.length / 4)], E0 = s.E[Math.floor(s.k.length / 4)] || 1e-12; p.line(s.k, s.k.map(k => E0 * (k / k0) ** slope), PALETTE[i + 2], { dash: [5, 4], width: 1 }); });
      if (s.kd) p.line([s.kd, s.kd], yr, css('--global-text-color-light', '#888'), { dash: [2, 3], width: 1 });
      st.legend(legend([[PALETTE[0], st.ui.spectrumLabel ?? 'E(k)'], ...refs.map(([sl, lab], i) => [PALETTE[i + 2], lab])]));
      return { caption: st.ui.spectrumNote ?? '' };
    },
  },
  regime: {
    label: 'Regime 통계', render(ctx, W, H, st) {
      const x = S(st, 'x1'), dt = st.ui.sampleDt, w = Math.max(1, Math.round(10 / dt)), m = runningMean(x, w), thr = 0.8;
      const lab = m.map(v => (Number.isFinite(v) ? (v < thr ? 1 : 0) : NaN)).filter(Number.isFinite);
      const b = grid(W, H, 2, 2);
      const t = st.samples.t.slice(-m.length), p1 = new Plot(ctx, { ...b[0], w: W - 76 }, { x: extent([t], 0), y: [0.7, 1.0], ylabel: 'x₁ (10일 평균)', xlabel: '일' }); p1.axes();
      let s0 = null; m.forEach((v, i) => { const bl = v < thr; if (bl && s0 === null) s0 = t[i]; if ((!bl || i === m.length - 1) && s0 !== null) { p1.vspan(s0, t[i], PALETTE[1]); s0 = null; } });
      p1.line(t, x.slice(-m.length), PALETTE[5], { width: 0.8, alpha: 0.5 }); p1.line(t, m, PALETTE[0], { width: 1.6 }); p1.line([t[0], t.at(-1)], [thr, thr], PALETTE[1], { dash: [4, 3], width: 1 });
      const res = residence(lab, dt), occ = lab.length ? lab.filter(v => v === 1).length / lab.length : 0;
      const hb = (arr, box, color, title) => { if (arr.length < 2) return; const h = histogram(arr, 12, [0, Math.max(...arr)]); const p = new Plot(ctx, box, { x: [0, h.hi], y: [0, Math.max(...h.density) * 1.15], xlabel: '체류 시간 (일)', title }); p.axes(); p.bars(h.x, h.density, h.hi / 12, color); };
      hb(res[0], b[2], PALETTE[0], `zonal 체류 (${res[0].length}회, 평균 ${fmt(mean(res[0] ?? [0]), 0)}일)`); hb(res[1], b[3], PALETTE[1], `blocked 체류 (${res[1].length}회, 평균 ${fmt(mean(res[1] ?? [0]), 0)}일)`);
      return { caption: `10일 평균 x₁ < 0.80을 blocked(주황 음영), 그 외를 zonal로 판정. blocked 점유율 ${fmt(100 * occ, 1)}%. 판정 기준은 참 궤적의 이중봉 분포 사이 최저점에서 정했고, 예측 결과에 맞춰 바꾸지 않습니다.` };
    },
  },
  returnmap: {
    label: 'Return map', render(ctx, W, H, st) {
      const z = S(st, 'z'), peaks = []; for (let i = 1; i < z.length - 1; i++) if (z[i] > z[i - 1] && z[i] >= z[i + 1]) peaks.push(z[i]);
      const p = new Plot(ctx, boxFull(W, H), { x: extent([peaks]), y: extent([peaks]), xlabel: 'zₙ (n번째 극대)', ylabel: 'zₙ₊₁' }); p.axes();
      p.points(peaks.slice(0, -1), peaks.slice(1), PALETTE[0], { r: 2.5, alpha: 0.8 });
      return { caption: `Lorenz(1963)의 z 극댓값 return map (${peaks.length}개 극대). 거의 1차원 곡선(텐트 사상)에 놓여, 3차원 흐름이 사실상 1차원 사상으로 축약된다는 것을 보여 줍니다.` };
    },
  },
  scatter: {
    label: '파라미터화 산점도', render(ctx, W, H, st) {
      const pr = st.pairs; if (pr.length < 50) return { caption: '재생하면 (X_k, U_k) 쌍이 쌓입니다.' };
      const xs = pr.map(q => q[0]), ys = pr.map(q => q[1]), fit = polyfit(xs, ys, 3);
      const p = new Plot(ctx, boxFull(W, H), { x: extent([xs]), y: extent([ys]), xlabel: 'X_k (느린 변수)', ylabel: 'U_k = −(hc/b)Σ_j Y_{j,k}' }); p.axes({ zero: true });
      p.points(xs, ys, PALETTE[0], { r: 1.6, alpha: 0.35 });
      const gx = Array.from({ length: 80 }, (_, i) => extent([xs], 0)[0] + i / 79 * (extent([xs], 0)[1] - extent([xs], 0)[0])); p.line(gx, gx.map(fit.pred), PALETTE[1], { width: 2.5 });
      return { caption: `빠른 변수가 느린 변수에 주는 하위격자 경향 U_k. 주황: 3차 다항식 결정론 closure, R² = ${fmt(fit.r2, 2)}, 잔차 표준편차 ${fmt(fit.residualStd, 2)}. 남는 산포가 확률(stochastic) 파라미터화가 필요한 이유입니다 (${pr.length.toLocaleString()}쌍).` };
    },
  },
  seasonal: {
    label: '계절 위상고정', render(ctx, W, H, st) {
      const T = S(st, 'T'), t = st.samples.t, byMonth = Array.from({ length: 12 }, () => []);
      t.forEach((tt, i) => byMonth[((Math.floor(tt) % 12) + 12) % 12].push(T[i]));
      const sd = byMonth.map(a => (a.length > 3 ? std(a) : NaN)), b = grid(W, H, 2);
      const real = st.real?.nino ? (() => { const bm = Array.from({ length: 12 }, () => []); st.real.nino.anom.forEach((v, i) => bm[st.real.nino.month[i] - 1].push(v)); return bm.map(std); })() : null;
      const p = new Plot(ctx, b[0], { x: [0.5, 12.5], y: [0, Math.max(...sd.filter(Number.isFinite), ...(real ?? []), 0.1) * 1.15], xlabel: '달 (1–12)', title: '달별 T 표준편차' }); p.axes();
      p.bars(sd.map((_, i) => i + 1), sd, 0.7, PALETTE[0]); if (real) p.line(real.map((_, i) => i + 1), real, css('--global-text-color', '#333'), { dash: [5, 3], width: 2 });
      const Rm = Array.from({ length: 12 }, (_, i) => st.params.R0 + st.params.R1 * Math.cos(2 * Math.PI * (i + 0.5 - (st.params.peak - 0.5)) / 12));
      const p2 = new Plot(ctx, b[1], { x: [0.5, 12.5], y: extent([Rm, [0]]), xlabel: '달 (1–12)', title: '결합 성장률 R(t) (월⁻¹)' }); p2.axes({ zero: true }); p2.line(Rm.map((_, i) => i + 1), Rm, PALETTE[1], { width: 2 });
      const peak = sd.indexOf(Math.max(...sd.filter(Number.isFinite)));
      return { caption: `막대: 이 실행의 달별 표준편차 (최대 ${peak + 1}월). ${real ? '점선: 관측 Niño3.4(ERSSTv5, 1950년 이후)의 달별 표준편차 — 관측은 11–1월에 최대입니다. ' : ''}R(t)가 양수인 달 다음에 변동이 커지는 것이 위상고정의 메커니즘입니다.` };
    },
  },
  ews: {
    label: '조기 경보 신호', render(ctx, W, H, st) {
      const q = S(st, 'q'), e2 = S(st, 'eta2'), t = st.samples.t, w = Math.max(20, Math.floor(q.length / 8)), r = rollingIndicators(q, w), b = grid(W, H, 1, 3, 0).map((bx, i) => ({ ...bx, t: 22 + i * (H - 50) / 3, h: (H - 50) / 3 - 24 }));
      const p0 = new Plot(ctx, b[0], { x: extent([t], 0), y: extent([q]), ylabel: 'q' }); p0.axes({ zero: true }); p0.line(t, q, PALETTE[0]);
      const p0b = new Plot(ctx, b[0], { x: extent([t], 0), y: extent([e2]) }); p0b.line(t, e2, PALETTE[1], { dash: [4, 3] });
      const tt = r.idx.map(i => t[i]);
      const p1 = new Plot(ctx, b[1], { x: extent([t], 0), y: extent([r.variance]), ylabel: `분산 (창 ${w})` }); p1.axes(); p1.line(tt, r.variance, PALETTE[2]);
      const p2 = new Plot(ctx, b[2], { x: extent([t], 0), y: extent([r.ac1]), ylabel: 'lag-1 자기상관', xlabel: `t (${st.sys.timeUnit})` }); p2.axes(); p2.line(tt, r.ac1, PALETTE[3]);
      return { caption: '위: q(파랑)와 담수 강제 η₂(t)(주황 점선, 축 생략). 분기점에 가까워지면 복원력이 약해져(critical slowing down) 분산과 lag-1 자기상관이 커집니다. 잡음 σ > 0과 ramp > 0일 때 의미가 있으며, 짧은 기록에서는 거짓 신호도 흔합니다.' };
    },
  },
  ensemble: {
    label: '앙상블 검증', render(ctx, W, H, st) {
      const ex = st.experiment; if (!ex) return { caption: '위의 "앙상블 실험 실행"을 누르면 완전 모델(perfect-model) hindcast를 계산합니다. 몇 초 걸립니다.' };
      const r = ex.result, b = grid(W, H, 2, 2);
      if (ex.name === 'enso') {
        const leads = r.acc[0].length;
        const box = { ...b[0], l: b[0].l + 6 };
        ctx.fillStyle = css('--global-text-color', '#333'); ctx.font = '12px sans-serif'; ctx.fillText('ACC: 시작 달(행) × lead(열, 개월) · 진할수록 높음 (0.3 → 1)', box.l, box.t - 6);
        heatmap(ctx, r.acc, box, 0.3, 1, { rowLabels: MONTHS, colLabels: Array.from({ length: leads }, (_, i) => (i % 3 === 0 ? String(i) : '')), annotate: false });
        const L = r.rmse.map((_, i) => i);
        const p1 = new Plot(ctx, b[1], { x: [0, L.at(-1)], y: [0, Math.max(...r.rmse, ...r.spread) * 1.1], xlabel: 'lead (개월)', title: 'RMSE(실선) vs 앙상블 spread(점선), CRPS(초록)' }); p1.axes();
        p1.line(L, r.rmse, PALETTE[0], { width: 2 }); p1.line(L, r.spread, PALETTE[1], { dash: [5, 3], width: 2 }); p1.line(L, r.crps, PALETTE[2], { width: 1.5 });
        const p2 = new Plot(ctx, b[2], { x: [-0.5, r.members + 0.5], y: [0, Math.max(...r.ranks) * 1.15], xlabel: '관측값의 순위 (lead 6)', title: 'Rank histogram' }); p2.axes(); p2.bars(r.ranks.map((_, i) => i), r.ranks, 0.9, PALETTE[3]);
        const p3 = new Plot(ctx, b[3], { x: [0, L.at(-1)], y: extent([...r.plume.members, r.plume.truth]), xlabel: 'lead (개월)', title: `앙상블 plume (시작 ${r.plume.start + 1}월)` }); p3.axes({ zero: true });
        r.plume.members.forEach(m => p3.line(L, m, PALETTE[0], { width: 0.8, alpha: 0.3 })); p3.line(L, r.plume.truth, css('--global-text-color', '#333'), { width: 2 });
        const spring = [2, 3, 4].map(m => r.acc[m][3]), fall = [7, 8, 9].map(m => r.acc[m][3]);
        return { caption: `완전 모델 실험: 같은 RO에서 만든 참값을 같은 모델의 ${r.members}멤버 앙상블로 예측합니다. lead 3 ACC는 3–5월 시작 평균 ${fmt(mean(spring), 2)}, 8–10월 시작 평균 ${fmt(mean(fall), 2)} — 봄을 지나는 예보의 skill이 낮은 "봄철 예측 장벽". spread ≈ RMSE이고 rank histogram이 평평하면 앙상블이 잘 보정된 것입니다.` };
      }
      const p1 = new Plot(ctx, b[0], { x: [0, r.lead.at(-1)], y: [0, Math.max(...r.rmse, ...r.spread) * 1.1], xlabel: 'lead (무차원 시간)', title: 'RMSE(실선) vs spread(점선)' }); p1.axes();
      p1.line(r.lead, r.rmse, PALETTE[0], { width: 2 }); p1.line(r.lead, r.spread, PALETTE[1], { dash: [5, 3], width: 2 });
      const p2 = new Plot(ctx, b[1], { x: [-0.5, r.members + 0.5], y: [0, Math.max(...r.ranks) * 1.15], xlabel: '참값 x의 순위 (중간 lead)', title: 'Rank histogram' }); p2.axes(); p2.bars(r.ranks.map((_, i) => i), r.ranks, 0.9, PALETTE[3]);
      const p3 = new Plot(ctx, { ...b[2], w: W - 76 }, { x: [0, r.lead.at(-1)], y: extent([...r.plume.members, r.plume.truth]), xlabel: 'lead', title: '앙상블 plume (x 성분)' }); p3.axes({ zero: true });
      r.plume.members.forEach(m => p3.line(r.lead, m, PALETTE[0], { width: 0.8, alpha: 0.3 })); p3.line(r.lead, r.plume.truth, css('--global-text-color', '#333'), { width: 2 });
      return { caption: `초기 오차 공 안에서 시작한 ${r.members}멤버 앙상블. 오차는 먼저 지수적으로 자라고 끌개 크기에서 포화합니다. 날개 전환 근처에서 plume이 둘로 갈라지는 것이 비가우시안 예측 분포의 예입니다.` };
    },
  },
  section: {
    label: '단면·Sverdrup', render(ctx, W, H, st) {
      const s = st.last?.section; if (!s) return { caption: '' };
      const b = grid(W, H, 1, 2, 0).map((bx, i) => ({ ...bx, t: 22 + i * (H - 46) / 2, h: (H - 46) / 2 - 30 }));
      const p1 = new Plot(ctx, b[0], { x: [0, 1], y: extent([s.psi, s.sverdrup]), ylabel: 'ψ', title: `y = ${st.opts.sectionY ?? 0.25} 단면의 유선함수` }); p1.axes({ zero: true });
      p1.line(s.xs, s.psi, PALETTE[0], { width: 2 }); p1.line(s.xs, s.sverdrup, PALETTE[1], { dash: [5, 3], width: 2 });
      const p2 = new Plot(ctx, b[1], { x: [0, 1], y: extent([s.v]), ylabel: 'v = ∂ψ/∂x', xlabel: 'x (서 → 동)' }); p2.axes({ zero: true }); p2.line(s.xs, s.v, PALETTE[2], { width: 2 });
      st.legend(legend([[PALETTE[0], '모델 ψ'], [PALETTE[1], 'Sverdrup ψ_S'], [PALETTE[2], '남북 속도 v']]));
      return { caption: '내부에서는 βv = curl τ (Sverdrup 균형)로 ψ가 점선을 따르고, 서쪽 경계의 얇은 층에서 강한 북향/남향 류(서안 경계류)가 수송을 되돌립니다. 비선형이 강하면 내부도 Sverdrup에서 벗어납니다.' };
    },
  },
  mhw: {
    label: '해양열파 탐지', render(ctx, W, H, st) {
      const sst = S(st, 'sst'), t = st.samples.t; if (sst.length < 365 * 30) return { caption: `기준기간 30년이 쌓이면 Hobday et al. (2016) 방식으로 탐지합니다 (현재 ${fmt(sst.length / 365.25, 1)}년).` };
      const days = t.map(tt => ({ year: Math.floor(tt / 365.25), doy: Math.min(366, Math.floor(tt % 365.25) + 1) }));
      // Fixed baseline: the first 30 years of the run, computed once and kept even after old samples are dropped.
      if (!st.mhwBase) { const y0 = days[0].year; st.mhwBase = { ...mhwClimatology(days, sst, y0, y0 + 29), y0 }; }
      const { clim, thresh, y0 } = st.mhwBase, ev = detectMhw(days, sst, clim, thresh);
      const n = sst.length, w0 = Math.max(0, n - 730), b = grid(W, H, 1, 2, 0).map((bx, i) => ({ ...bx, t: 22 + i * (H - 46) / 2, h: (H - 46) / 2 - 30 }));
      const tw = t.slice(w0).map(v => v / 365.25), sw = sst.slice(w0), cw = days.slice(w0).map(d => clim[d.doy - 1]), thw = days.slice(w0).map(d => thresh[d.doy - 1]);
      const p = new Plot(ctx, b[0], { x: extent([tw], 0), y: extent([sw, cw, thw]), ylabel: 'SST (°C)', title: '최근 2년: SST(파랑), 기후값(회색), 90% 임계값(주황 점선)' }); p.axes();
      ev.filter(e => e.end >= w0).forEach(e => p.vspan(t[e.start] / 365.25, t[e.end] / 365.25, ['#e8a33d', '#d9663b', '#b8322a', '#6e1a1a'][e.category - 1], 0.3));
      p.line(tw, cw, PALETTE[5]); p.line(tw, thw, PALETTE[1], { dash: [4, 3] }); p.line(tw, sw, PALETTE[0], { width: 1.5 });
      const ya = days[0].year, yb = days.at(-1).year, mhwDays = new Array(yb - ya + 1).fill(0); ev.forEach(e => { for (let k = e.start; k <= e.end; k++) mhwDays[days[k].year - ya]++; });
      const p2 = new Plot(ctx, b[1], { x: [ya - 0.5, yb + 0.5], y: [0, Math.max(...mhwDays, 10) * 1.1], xlabel: '연도', ylabel: '열파 일수', title: `연간 해양열파 일수 (기준기간 ${y0}–${y0 + 29}년)` }); p2.axes();
      p2.bars(mhwDays.map((_, i) => ya + i), mhwDays, 0.8, PALETTE[1]);
      const recent = ev.filter(e => days[e.start].year >= yb - 10), cat = [1, 2, 3, 4].map(c => recent.filter(e => e.category === c).length);
      const endless = ev.some(e => e.duration > 365) ? ' 1년 넘게 이어지는 사건이 있습니다: 고정 기준기간에 추세가 쌓이면 임계값을 계속 넘는 "영구 열파" 상태가 됩니다.' : '';
      return { caption: `총 ${ev.length}건.${endless} 최근 10년 ${recent.length}건 (Moderate ${cat[0]}, Strong ${cat[1]}, Severe ${cat[2]}, Extreme ${cat[3]}), 평균 지속 ${fmt(mean(recent.map(e => e.duration).concat(recent.length ? [] : [0])), 1)}일. 생성기는 100년에서 멈춥니다. 고정 기준기간에 추세가 더해지면 열파 일수가 늘어납니다 — 추세 제거 여부는 연구 질문에 따라 정해야 합니다.` };
    },
  },
  precomputed: {
    label: '수천 년 미리보기', render(ctx, W, H, st) {
      const y = spinupYearly, yrs = y.psiO2.map((_, i) => 1000 + i), b = grid(W, H, 1, 2, 0).map((bx, i) => ({ ...bx, t: 22 + i * (H - 46) / 2, h: (H - 46) / 2 - 30 }));
      const p1 = new Plot(ctx, b[0], { x: [yrs[0], yrs.at(-1)], y: extent([y.psiO2]), ylabel: 'ψ_o,2', title: '오프라인 3000년 적분 중 1000–2999년 (연 표본)' }); p1.axes({ zero: true }); p1.line(yrs, y.psiO2, PALETTE[0], { width: 1 });
      const s1 = psd(y.psiO2, 1, 512), s2 = psd(y.TO2, 1, 512);
      const p2 = new Plot(ctx, b[1], { x: positiveExtent([s1.f]), y: positiveExtent([s1.p, s2.p]), logx: true, logy: true, xlabel: '진동수 (주기/년)' }); p2.axes();
      p2.line(s1.f, s1.p, PALETTE[0]); p2.line(s2.f, s2.p, PALETTE[1]);
      st.legend(legend([[PALETTE[0], 'ψ_o,2 (해양 유선함수 모드)'], [PALETTE[1], 'T_o,2 (해양 온도 모드)']]));
      let j = 0; s1.p.forEach((v, k) => { if (v > s1.p[j]) j = k; });
      return { caption: `브라우저에서 돌리기 어려운 길이의 적분을 미리 계산했습니다(이 페이지와 같은 적분기). ψ_o,2 스펙트럼의 최대 봉우리 주기 ≈ ${fmt(1 / s1.f[j], 0)}년. 연 표본이라 1년보다 짧은 대기 변동은 보이지 않습니다.` };
    },
  },
};
