// Statistics used by the lab views. Pure functions on plain arrays.
import { fft } from './core.js';

export const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
export const std = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

export function histogram(a, bins = 40, range = null) {
  const lo = range ? range[0] : Math.min(...a), hi = range ? range[1] : Math.max(...a), w = (hi - lo) / bins || 1, c = new Array(bins).fill(0);
  for (const v of a) { const k = Math.floor((v - lo) / w); if (k >= 0 && k < bins) c[k]++; else if (v === hi) c[bins - 1]++; }
  const n = a.length * w;
  return { x: c.map((_, i) => lo + (i + 0.5) * w), density: c.map(v => v / n), lo, hi };
}

// Autocorrelation up to maxLag (biased estimator), and the first lag where it drops below 1/e.
export function acf(a, maxLag) {
  const m = mean(a), n = a.length, d = a.map(v => v - m), v0 = d.reduce((s, v) => s + v * v, 0) / n, out = [];
  for (let k = 0; k <= Math.min(maxLag, n - 1); k++) { let s = 0; for (let i = 0; i + k < n; i++) s += d[i] * d[i + k]; out.push(s / n / v0); }
  const efold = out.findIndex(v => v < 1 / Math.E);
  return { r: out, efold: efold < 0 ? NaN : efold };
}

export function crossCorr(a, b, maxLag) {
  const ma = mean(a), mb = mean(b), sa = std(a), sb = std(b), n = Math.min(a.length, b.length), out = [];
  for (let k = -maxLag; k <= maxLag; k++) { let s = 0, c = 0; for (let i = 0; i < n; i++) { const j = i + k; if (j < 0 || j >= n) continue; s += (a[i] - ma) * (b[j] - mb); c++; } out.push(c ? s / c / (sa * sb) : NaN); }
  return out; // index maxLag + k: corr(a_t, b_{t+k})
}

// Welch PSD with Hann windows and 50 % overlap. Returns frequencies in cycles per sample interval / dt.
export function psd(a, dt = 1, seg = 256) {
  let L = 1; while (L * 2 <= Math.min(seg, a.length)) L *= 2;
  if (L < 16) return { f: [], p: [] };
  const m = mean(a), w = Array.from({ length: L }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (L - 1))), wss = w.reduce((s, v) => s + v * v, 0);
  const acc = new Array(L / 2 + 1).fill(0); let count = 0;
  for (let start = 0; start + L <= a.length; start += L / 2) {
    const re = new Float64Array(L), im = new Float64Array(L);
    for (let i = 0; i < L; i++) re[i] = (a[start + i] - m) * w[i];
    fft(re, im);
    for (let k = 0; k <= L / 2; k++) acc[k] += (re[k] ** 2 + im[k] ** 2) * (k === 0 || k === L / 2 ? 1 : 2) * dt / wss;
    count++;
  }
  return { f: acc.map((_, k) => k / (L * dt)).slice(1), p: acc.map(v => v / count).slice(1) };
}

// Rolling variance and lag-1 autocorrelation (early-warning indicators) over a window of w samples.
export function rollingIndicators(a, w) {
  const varr = [], ac1 = [], idx = [];
  for (let i = w; i <= a.length; i += Math.max(1, Math.floor(w / 10))) {
    const s = a.slice(i - w, i), m = mean(s); let v = 0, c = 0;
    for (let k = 0; k < s.length; k++) { v += (s[k] - m) ** 2; if (k) c += (s[k] - m) * (s[k - 1] - m); }
    varr.push(v / w); ac1.push(c / v); idx.push(i - 1);
  }
  return { idx, variance: varr, ac1 };
}

// Ensemble CRPS: E|X − y| − ½ E|X − X′| (Gneiting & Raftery 2007).
export function crps(ens, y) {
  const n = ens.length; let a = 0, b = 0;
  for (let i = 0; i < n; i++) { a += Math.abs(ens[i] - y); for (let j = 0; j < n; j++) b += Math.abs(ens[i] - ens[j]); }
  return a / n - b / (2 * n * n);
}
export const rankOf = (ens, y) => ens.filter(v => v < y).length;

// Least-squares polynomial fit (normal equations; fine for degree ≤ 4 on scaled data).
export function polyfit(x, y, deg) {
  const n = deg + 1, A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < x.length; i++) {
    const pw = [1]; for (let k = 1; k < 2 * n; k++) pw.push(pw[k - 1] * x[i]);
    for (let r = 0; r < n; r++) { for (let c = 0; c < n; c++) A[r][c] += pw[r + c]; A[r][n] += pw[r] * y[i]; }
  }
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  const coef = A.map((row, i) => row[n] / row[i]);
  const pred = v => coef.reduce((s, c, k) => s + c * v ** k, 0);
  const res = y.map((v, i) => v - pred(x[i])), r2 = 1 - mean(res.map(v => v * v)) / std(y) ** 2;
  return { coef, pred, r2, residualStd: std(res) };
}

// Durations of consecutive runs of each label in a regime sequence (sample interval dt).
export function residence(labels, dt = 1) {
  const out = { 0: [], 1: [] }; let cur = labels[0], len = 0;
  for (const l of labels) { if (l === cur) len++; else { out[cur]?.push(len * dt); cur = l; len = 1; } }
  return out; // the last (incomplete) run is dropped
}

export function runningMean(a, w) {
  const out = new Array(a.length).fill(NaN); let s = 0;
  for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= w) s -= a[i - w]; if (i >= w - 1) out[i] = s / w; }
  return out;
}

// Isotropic (shell-summed) spectrum of a periodic n×n field, k = 1 … n/2.
export function isotropicSpectrum(values, n) {
  const re = Float64Array.from(values), im = new Float64Array(n * n), a = new Float64Array(n), b = new Float64Array(n);
  for (let y = 0; y < n; y++) { for (let x = 0; x < n; x++) { a[x] = re[y * n + x]; b[x] = im[y * n + x]; } fft(a, b); for (let x = 0; x < n; x++) { re[y * n + x] = a[x]; im[y * n + x] = b[x]; } }
  for (let x = 0; x < n; x++) { for (let y = 0; y < n; y++) { a[y] = re[y * n + x]; b[y] = im[y * n + x]; } fft(a, b); for (let y = 0; y < n; y++) { re[y * n + x] = a[y]; im[y * n + x] = b[y]; } }
  const E = new Array(n / 2 + 1).fill(0), wn = i => (i <= n / 2 ? i : i - n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const k = Math.round(Math.hypot(wn(x), wn(y))); if (k >= 1 && k <= n / 2) E[k] += (re[y * n + x] ** 2 + im[y * n + x] ** 2) / (n ** 4) / 2; }
  return { k: E.map((_, i) => i).slice(1), E: E.slice(1) };
}

/* Marine heatwaves (Hobday et al. 2016): daily SST, a climatology and 90th-percentile threshold from an
   11-day window across baseline years (both smoothed with a 31-day moving mean); events are ≥ 5 days above
   threshold, and events separated by ≤ 2 days are merged. Categories follow Hobday et al. (2018). */
export function mhwClimatology(days, sst, baseStart, baseEnd) {
  const byDoy = Array.from({ length: 366 }, () => []);
  days.forEach((d, i) => {
    if (d.year < baseStart || d.year > baseEnd) return;
    for (let w = -5; w <= 5; w++) byDoy[((d.doy - 1 + w) % 366 + 366) % 366].push(sst[i]);
  });
  const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y), pos = (s.length - 1) * q, lo = Math.floor(pos); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo); };
  const smooth = a => a.map((_, i) => { let s = 0; for (let w = -15; w <= 15; w++) s += a[((i + w) % 366 + 366) % 366]; return s / 31; });
  return { clim: smooth(byDoy.map(v => mean(v))), thresh: smooth(byDoy.map(v => pct(v, 0.9))) };
}
export function detectMhw(days, sst, clim, thresh) {
  const above = days.map((d, i) => sst[i] > thresh[d.doy - 1]), events = [];
  let i = 0;
  while (i < above.length) {
    if (!above[i]) { i++; continue; }
    let j = i; while (j + 1 < above.length && above[j + 1]) j++;
    if (j - i + 1 >= 5) events.push([i, j]);
    i = j + 1;
  }
  const merged = [];
  for (const e of events) { const last = merged.at(-1); if (last && e[0] - last[1] - 1 <= 2) last[1] = e[1]; else merged.push(e.slice()); }
  return merged.map(([s, e]) => {
    let imax = 0, icum = 0, peak = s;
    for (let k = s; k <= e; k++) { const an = sst[k] - clim[days[k].doy - 1]; icum += an; if (an > imax) { imax = an; peak = k; } }
    const diff = thresh[days[peak].doy - 1] - clim[days[peak].doy - 1], ratio = imax / diff;
    return { start: s, end: e, duration: e - s + 1, imax, icum, peak, category: ratio >= 4 ? 4 : ratio >= 3 ? 3 : ratio >= 2 ? 2 : 1 };
  });
}
