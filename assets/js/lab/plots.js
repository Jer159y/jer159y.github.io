// Small canvas plotting helpers that follow the site's theme colours.
export const PALETTE = ['#2f6db5', '#c0532b', '#2c9a6a', '#8a5cc2', '#b08900', '#6b7280'];
export const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
export const fmt = (v, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : v.toFixed(d));

export function diverging(v) {
  const t = Math.max(-1, Math.min(1, v)), a = Math.abs(t), base = [239, 243, 227], end = t < 0 ? [26, 88, 145] : [185, 68, 52];
  return base.map((b, i) => Math.round(b + (end[i] - b) * a));
}
export function sequential(v) {
  const t = Math.max(0, Math.min(1, v));
  return [Math.round(247 - 200 * t), Math.round(244 - 140 * t), Math.round(232 - 60 * t)];
}

const niceTicks = (lo, hi, n = 5) => {
  const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag, out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
};

// A plotting area with linear or log axes. Usage: const p = new Plot(ctx, box, {x:[a,b], y:[c,d], logx, logy}).
export class Plot {
  constructor(ctx, box, { x, y, logx = false, logy = false, xlabel = '', ylabel = '', title = '' }) {
    Object.assign(this, { ctx, box, logx, logy, xlabel, ylabel, title });
    const tr = (v, log) => (log ? Math.log10(Math.max(v, 1e-300)) : v);
    this.xr = x.map(v => tr(v, logx)); this.yr = y.map(v => tr(v, logy));
    if (this.xr[1] === this.xr[0]) this.xr[1] += 1;
    if (this.yr[1] === this.yr[0]) { this.yr[0] -= 1; this.yr[1] += 1; }
    this.tr = tr;
  }
  X(v) { const { l, w } = this.box; return l + (this.tr(v, this.logx) - this.xr[0]) / (this.xr[1] - this.xr[0]) * w; }
  Y(v) { const { t, h } = this.box; return t + h - (this.tr(v, this.logy) - this.yr[0]) / (this.yr[1] - this.yr[0]) * h; }
  axes({ zero = false } = {}) {
    const { ctx, box } = this, { l, t, w, h } = box;
    ctx.save(); ctx.lineWidth = 1; ctx.font = '11px sans-serif';
    ctx.strokeStyle = css('--global-divider-color', '#ccc'); ctx.fillStyle = css('--global-text-color-light', '#777');
    ctx.strokeRect(l, t, w, h);
    // Tick labels get as many decimals as the tick spacing needs.
    const label = (v, step) => { if (v === 0) return '0'; if (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e5) return v.toExponential(1); const d = Math.min(6, Math.max(0, -Math.floor(Math.log10(step) + 1e-9))); return v.toFixed(d); };
    const stepOf = a => (a.length > 1 ? Math.abs(a[1] - a[0]) : 1);
    const ticks = (r, log) => (log ? niceTicks(Math.floor(r[0]), Math.ceil(r[1]), 6).filter(v => Number.isInteger(v) && v >= r[0] - 1e-9 && v <= r[1] + 1e-9).map(v => 10 ** v) : niceTicks(r[0], r[1]));
    const xt = ticks(this.xr, this.logx), yt = ticks(this.yr, this.logy), xs = stepOf(xt), ys = stepOf(yt);
    for (const v of xt) { const x = this.X(v); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(x, t); ctx.lineTo(x, t + h); ctx.stroke(); ctx.globalAlpha = 1; const s = this.logx ? `1e${Math.round(Math.log10(v))}` : label(v, xs); ctx.fillText(s, x - ctx.measureText(s).width / 2, t + h + 13); }
    for (const v of yt) { const y = this.Y(v); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(l + w, y); ctx.stroke(); ctx.globalAlpha = 1; const s = this.logy ? `1e${Math.round(Math.log10(v))}` : label(v, ys); ctx.fillText(s, l - ctx.measureText(s).width - 4, y + 4); }
    if (zero && !this.logy && this.yr[0] < 0 && this.yr[1] > 0) { ctx.strokeStyle = css('--global-text-color-light', '#888'); ctx.beginPath(); ctx.moveTo(l, this.Y(0)); ctx.lineTo(l + w, this.Y(0)); ctx.stroke(); }
    if (this.xlabel) ctx.fillText(this.xlabel, l + w / 2 - ctx.measureText(this.xlabel).width / 2, t + h + 27);
    if (this.ylabel) ctx.fillText(this.ylabel, l + 4, t + 12);
    if (this.title) { ctx.fillStyle = css('--global-text-color', '#333'); ctx.font = '12px sans-serif'; ctx.fillText(this.title, l, t - 6); }
    ctx.restore();
  }
  clip(fn) { const { ctx, box } = this; ctx.save(); ctx.beginPath(); ctx.rect(box.l, box.t, box.w, box.h); ctx.clip(); fn(); ctx.restore(); }
  line(xs, ys, color = PALETTE[0], { width = 1.5, dash = [], alpha = 1 } = {}) {
    this.clip(() => {
      const { ctx } = this; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.globalAlpha = alpha; ctx.beginPath();
      let pen = false;
      for (let i = 0; i < xs.length; i++) {
        if (!Number.isFinite(ys[i]) || !Number.isFinite(xs[i]) || (this.logy && ys[i] <= 0) || (this.logx && xs[i] <= 0)) { pen = false; continue; }
        const X = this.X(xs[i]), Y = this.Y(ys[i]); pen ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); pen = true;
      }
      ctx.stroke();
    });
  }
  points(xs, ys, color = PALETTE[0], { r = 2, alpha = 0.6 } = {}) {
    this.clip(() => { const { ctx } = this; ctx.fillStyle = color; ctx.globalAlpha = alpha; for (let i = 0; i < xs.length; i++) { if (!Number.isFinite(ys[i])) continue; ctx.beginPath(); ctx.arc(this.X(xs[i]), this.Y(ys[i]), r, 0, 2 * Math.PI); ctx.fill(); } });
  }
  bars(xs, ys, width, color = PALETTE[0], alpha = 0.75) {
    this.clip(() => { const { ctx } = this; ctx.fillStyle = color; ctx.globalAlpha = alpha; xs.forEach((x, i) => { const x0 = this.X(x - width / 2), x1 = this.X(x + width / 2), y0 = this.Y(Math.max(this.logy ? 1e-300 : this.yr[0], 0)), y1 = this.Y(ys[i]); ctx.fillRect(x0 + 0.5, Math.min(y0, y1), Math.max(1, x1 - x0 - 1), Math.abs(y1 - y0)); }); });
  }
  band(xs, lo, hi, color, alpha = 0.18) {
    this.clip(() => { const { ctx } = this; ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.beginPath(); xs.forEach((x, i) => (i ? ctx.lineTo(this.X(x), this.Y(hi[i])) : ctx.moveTo(this.X(x), this.Y(hi[i])))); for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(this.X(xs[i]), this.Y(lo[i])); ctx.closePath(); ctx.fill(); });
  }
  vspan(x0, x1, color, alpha = 0.15) { this.clip(() => { const { ctx, box } = this; ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.fillRect(this.X(x0), box.t, Math.max(1, this.X(x1) - this.X(x0)), box.h); }); }
}

export const extent = (arrays, pad = 0.05) => {
  let lo = Infinity, hi = -Infinity;
  for (const a of arrays) for (const v of a) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!Number.isFinite(lo)) return [0, 1];
  const d = hi > lo ? (hi - lo) * pad : Math.abs(hi) * 0.1 || 1; return [lo - d, hi + d];
};
export const positiveExtent = arrays => {
  let lo = Infinity, hi = -Infinity;
  for (const a of arrays) for (const v of a) if (v > 0 && Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return Number.isFinite(lo) ? [lo / 1.5, hi * 1.5] : [1e-6, 1];
};

// Draws an nx × ny field (row 0 at the bottom) into a box, with an optional symmetric range.
export function drawField(ctx, values, nx, ny, box, { range = null, seq = false } = {}) {
  let m = 1e-300; for (const v of values) m = Math.max(m, Math.abs(v));
  const R = range ?? m, off = document.createElement('canvas'); off.width = nx; off.height = ny;
  const octx = off.getContext('2d'), img = octx.createImageData(nx, ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const c = seq ? sequential(values[y * nx + x] / R) : diverging(values[y * nx + x] / R), j = ((ny - 1 - y) * nx + x) * 4;
    img.data[j] = c[0]; img.data[j + 1] = c[1]; img.data[j + 2] = c[2]; img.data[j + 3] = 255;
  }
  octx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(off, box.l, box.t, box.w, box.h);
  ctx.strokeStyle = css('--global-divider-color', '#ccc'); ctx.strokeRect(box.l, box.t, box.w, box.h);
  return R;
}

// Heatmap of a matrix rows × cols (row 0 at top), values mapped with a sequential scale on [lo, hi].
export function heatmap(ctx, M, box, lo, hi, { rowLabels = [], colLabels = [], annotate = false } = {}) {
  const rows = M.length, cols = M[0].length, cw = box.w / cols, ch = box.h / rows;
  ctx.font = '10px sans-serif';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = M[r][c], col = sequential((v - lo) / (hi - lo));
    ctx.fillStyle = `rgb(${col.join(',')})`; ctx.fillRect(box.l + c * cw, box.t + r * ch, cw + 0.5, ch + 0.5);
    if (annotate && cw > 22) { ctx.fillStyle = (v - lo) / (hi - lo) > 0.6 ? '#fff' : '#333'; const s = v.toFixed(2).replace(/^0/, ''); ctx.fillText(s, box.l + c * cw + cw / 2 - ctx.measureText(s).width / 2, box.t + r * ch + ch / 2 + 3); }
  }
  ctx.fillStyle = css('--global-text-color-light', '#777');
  rowLabels.forEach((s, r) => ctx.fillText(s, box.l - ctx.measureText(s).width - 4, box.t + r * ch + ch / 2 + 3));
  colLabels.forEach((s, c) => { if (s !== '') ctx.fillText(s, box.l + c * cw + cw / 2 - ctx.measureText(s).width / 2, box.t + box.h + 12); });
}

export function clearCanvas(canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); return ctx; }
