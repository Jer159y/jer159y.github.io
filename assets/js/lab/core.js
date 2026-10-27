// Shared numerical utilities for the lab integrators.
export const TAU = 2 * Math.PI;

// Seeded PRNG (mulberry32) + Box–Muller, so runs are reproducible.
export function rng(seed = 1) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0; while (u === 0) u = uniform();
    const v = uniform(), r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(TAU * v);
    return r * Math.cos(TAU * v);
  };
  return { uniform, normal };
}

// In-place radix-2 complex FFT.
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let ur = 1, ui = 0;
      for (let j = 0; j < len / 2; j++) {
        const k = i + j, l = k + len / 2;
        const vr = re[l] * ur - im[l] * ui, vi = re[l] * ui + im[l] * ur;
        re[l] = re[k] - vr; im[l] = im[k] - vi; re[k] += vr; im[k] += vi;
        const t = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

export function fft2(re, im, n, inverse = false) {
  const a = new Float64Array(n), b = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    const o = y * n;
    for (let x = 0; x < n; x++) { a[x] = re[o + x]; b[x] = im[o + x]; }
    fft(a, b, inverse);
    for (let x = 0; x < n; x++) { re[o + x] = a[x]; im[o + x] = b[x]; }
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) { a[y] = re[y * n + x]; b[y] = im[y * n + x]; }
    fft(a, b, inverse);
    for (let y = 0; y < n; y++) { re[y * n + x] = a[y]; im[y * n + x] = b[y]; }
  }
}

export const wavenumber = (i, n) => (i <= n / 2 ? i : i - n);

// Spectra of real fields must satisfy v(−k) = conj v(k). Round-off breaks this slightly, and the
// anti-Hermitian part is invisible to the (real) nonlinear term, so linear instabilities would
// amplify it without bound. Projecting back after every step keeps the field real.
export function hermitian(re, im, n) {
  for (let i = 0; i <= n / 2; i++) {
    const j = (n - i) % n, r = (re[i] + re[j]) / 2, m = (im[i] - im[j]) / 2;
    re[i] = re[j] = r; im[i] = m; im[j] = -m;
  }
}
export function hermitian2(re, im, n) {
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, j = ((n - y) % n) * n + (n - x) % n;
    if (j < i) continue;
    const r = (re[i] + re[j]) / 2, m = (im[i] - im[j]) / 2;
    re[i] = re[j] = r; im[i] = m; im[j] = -m;
  }
}

// Type-I discrete sine transform of length n−1 interior points (x_j = jπ/n), via a 2n complex FFT.
// Used for free-slip closed basins where ψ = ζ = 0 on the walls. dst(dst(v)) = (n/2) v.
export function dst(v) {
  const m = v.length, n = m + 1, N = 2 * n, re = new Float64Array(N), im = new Float64Array(N);
  for (let j = 1; j < n; j++) { re[j] = v[j - 1]; re[N - j] = -v[j - 1]; }
  fft(re, im);
  const out = new Float64Array(m);
  for (let k = 1; k < n; k++) out[k - 1] = -im[k] / 2;
  return out;
}

// Classic RK4 for small ODE systems y' = f(t, y).
export function rk4(f, t, y, dt) {
  const k1 = f(t, y);
  const k2 = f(t + dt / 2, y.map((v, i) => v + dt / 2 * k1[i]));
  const k3 = f(t + dt / 2, y.map((v, i) => v + dt / 2 * k2[i]));
  const k4 = f(t + dt, y.map((v, i) => v + dt * k3[i]));
  return y.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/* Base class: ODE systems with optional additive noise and twin runs. */
export class OdeSystem {
  constructor(p, defaults) {
    this.p = { ...defaults, ...p };
    this.t = 0; this.steps = 0;
    this.random = rng(this.p.seed ?? 1);
    this.noiseWork = 0; // accumulated change of the budget quantity due to noise
  }
  // Stochastic split: RK4 for the drift, then Euler–Maruyama additive noise.
  step() {
    const dt = this.dt;
    this.y = rk4((t, y) => this.f(t, y), this.t, this.y, dt);
    if (this.noise) {
      const before = this.budgetQuantity(this.y);
      this.y = this.noise(this.y, dt);
      this.noiseWork += this.budgetQuantity(this.y) - before;
    }
    if (this.twin) this.stepTwins(dt);
    this.t += dt; this.steps++;
    if (!this.y.every(Number.isFinite)) throw Error('수치해가 발산했습니다. 파라미터나 시간 간격을 줄여 보세요.');
    return dt;
  }
  // Two perturbed copies: one free (error growth), one renormalised (Benettin estimate of λ₁).
  initTwins(delta = 1e-6) {
    const dir = this.y.map(() => this.random.normal()), norm = Math.hypot(...dir);
    this.delta0 = delta;
    this.twinFree = this.y.map((v, i) => v + delta * dir[i] / norm);
    this.twinLyap = this.y.map((v, i) => v + delta * dir[i] / norm);
    this.lyapSum = 0; this.lyapTime = 0;
  }
  stepTwins(dt) {
    const f = (t, y) => this.f(t, y), yNext = this.y;
    this.twinFree = rk4(f, this.t, this.twinFree, dt);
    this.twinLyap = rk4(f, this.t, this.twinLyap, dt);
    const d = Math.hypot(...this.twinLyap.map((v, i) => v - yNext[i]));
    if (d > 0) {
      this.lyapSum += Math.log(d / this.delta0); this.lyapTime += dt;
      this.twinLyap = yNext.map((v, i) => v + (this.twinLyap[i] - v) * this.delta0 / d);
    }
  }
  twinDiagnostics() {
    if (!this.twin) return {};
    return { error: Math.hypot(...this.twinFree.map((v, i) => v - this.y[i])), lyapunov: this.lyapTime > 0 ? this.lyapSum / this.lyapTime : NaN };
  }
  perturbTwin() { this.initTwins(this.delta0 ?? 1e-6); }
}

// Advance n steps; return block-averaged budget rates (trapezoidal in time) and the residual.
export function advance(sys, steps, onStep = null) {
  let b0 = sys.budget(), total = 0; const E0 = b0.quantity, acc = {};
  const noise0 = sys.noiseWork ?? 0, filter0 = sys.filterWork ?? 0;
  for (let s = 0; s < steps; s++) {
    const dt = sys.step(), b1 = sys.budget();
    for (const key in b1.terms) acc[key] = (acc[key] ?? 0) + dt * (b0.terms[key] + b1.terms[key]) / 2;
    total += dt; b0 = b1;
    if (onStep) onStep(sys, s);
  }
  const rates = {};
  if (total > 0) {
    for (const key in acc) rates[key] = acc[key] / total;
    if (sys.noiseWork !== undefined && sys.noise) rates.noise = (sys.noiseWork - noise0) / total;
    if (sys.filterWork !== undefined) rates.filter = (sys.filterWork - filter0) / total;
    const sum = Object.values(rates).reduce((a, b) => a + b, 0);
    rates.residual = (b0.quantity - E0) / total - sum;
    rates.tendency = (b0.quantity - E0) / total;
  }
  return { rates, quantity: b0.quantity, elapsed: total };
}
