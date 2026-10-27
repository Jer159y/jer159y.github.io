// Dependency-free integrators for the climate-systems ladder.
// Every system exposes: step() -> dt, budget() -> {quantity, terms}, diagnostics(), view().
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

const wavenumber = (i, n) => (i <= n / 2 ? i : i - n);

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

// Classic RK4 for small ODE systems y' = f(t, y).
function rk4(f, t, y, dt) {
  const k1 = f(t, y);
  const k2 = f(t + dt / 2, y.map((v, i) => v + dt / 2 * k1[i]));
  const k3 = f(t + dt / 2, y.map((v, i) => v + dt / 2 * k2[i]));
  const k4 = f(t + dt, y.map((v, i) => v + dt * k3[i]));
  return y.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/* ------------------------------------------------------------------ */
/* Base class: ODE systems with optional additive noise and twin runs. */
/* ------------------------------------------------------------------ */
class OdeSystem {
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
    const f = (t, y) => this.f(t, y);
    const yNext = this.y; // already advanced
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
    return {
      error: Math.hypot(...this.twinFree.map((v, i) => v - this.y[i])),
      lyapunov: this.lyapTime > 0 ? this.lyapSum / this.lyapTime : NaN,
    };
  }
  perturbTwin() { this.initTwins(this.delta0 ?? 1e-6); }
}

/* 1. Zero-dimensional energy balance model with ice–albedo feedback. */
export const EBM_DEFAULTS = { mu: 1, forcing: 0, depth: 50, sigma: 0, T0: 15, seed: 1 };
const EBM = { Q: 342, A: 203.3, B: 2.09, aIce: 0.62, aWarm: 0.3, Tc: -10, width: 6 };
export function ebmAlbedo(T) {
  return EBM.aWarm + (EBM.aIce - EBM.aWarm) * (1 - Math.tanh((T - EBM.Tc) / EBM.width)) / 2;
}
const ebmAlbedoSlope = T => -(EBM.aIce - EBM.aWarm) / (2 * EBM.width) / Math.cosh((T - EBM.Tc) / EBM.width) ** 2;
// Heat capacity of a mixed layer of given depth, in W·yr·m⁻²·K⁻¹.
const ebmCapacity = depth => 1025 * 3990 * depth / 3.156e7;
export class EnergyBalance extends OdeSystem {
  constructor(p) {
    super(p, EBM_DEFAULTS);
    this.dt = 0.02; this.C = ebmCapacity(this.p.depth);
    this.y = [this.p.T0];
    if (this.p.sigma > 0) this.noise = (y, dt) => [y[0] + this.p.sigma / this.C * Math.sqrt(dt) * this.random.normal()];
    this.initial = this.budgetQuantity(this.y);
  }
  asr(T) { return this.p.mu * EBM.Q * (1 - ebmAlbedo(T)); }
  olr(T) { return EBM.A - this.p.forcing + EBM.B * T; }
  f(t, [T]) { return [(this.asr(T) - this.olr(T)) / this.C]; }
  budgetQuantity([T]) { return this.C * T; }
  budget() {
    const T = this.y[0];
    return { quantity: this.budgetQuantity(this.y), terms: { asr: this.asr(T), olr: -this.olr(T) } };
  }
  diagnostics() {
    const T = this.y[0], lambda = EBM.B + this.p.mu * EBM.Q * ebmAlbedoSlope(T);
    return { T, albedo: ebmAlbedo(T), N: this.asr(T) - this.olr(T), lambda, ecs: 3.7 / lambda, heat: this.C * T };
  }
  view() { return { kind: 'point', x: this.p.mu, y: this.y[0] }; }
}
// Equilibrium branch T*(μ), parametrised by T: μ = OLR(T) / (Q(1 − α(T))).
export function ebmBranch(forcing = 0) {
  const pts = [];
  for (let T = -60; T <= 40; T += 0.25) {
    const mu = (EBM.A - forcing + EBM.B * T) / (EBM.Q * (1 - ebmAlbedo(T)));
    const slope = EBM.B + mu * EBM.Q * ebmAlbedoSlope(T); // −dN/dT
    pts.push({ x: mu, y: T, stable: slope > 0 });
  }
  return pts;
}

/* 2. Stommel two-box thermohaline model (nondimensional). */
export const STOMMEL_DEFAULTS = { eta1: 3, eta2: 1, eta3: 0.3, sigma: 0, start: 'thermal', seed: 1 };
export class Stommel extends OdeSystem {
  constructor(p) {
    super(p, STOMMEL_DEFAULTS);
    this.dt = 0.005;
    // Start next to an equilibrium of the requested branch (if that branch exists for these η).
    const { eta1, eta2, eta3 } = this.p, roots = [];
    const g = q => eta1 / (1 + Math.abs(q)) - eta2 / (eta3 + Math.abs(q)) - q;
    for (let q = -2; q < 4; q += 0.001) if (g(q) * g(q + 0.001) <= 0) roots.push(q + 0.0005);
    const q0 = this.p.start === 'haline' ? (roots[0] < 0 ? roots[0] : -0.3) : (roots.at(-1) > 0.3 ? roots.at(-1) : 0.3);
    const fromQ = q => [eta1 / (1 + Math.abs(q)), eta2 / (eta3 + Math.abs(q))];
    this.y = this.p.T0 !== undefined ? [this.p.T0, this.p.S0] : fromQ(q0).map(v => v * 1.01);
    if (this.p.sigma > 0) this.noise = (y, dt) => [y[0], y[1] + this.p.sigma * Math.sqrt(dt) * this.random.normal()];
    this.initial = this.budgetQuantity(this.y);
  }
  f(t, [T, S]) {
    const q = Math.abs(T - S), { eta1, eta2, eta3 } = this.p;
    return [eta1 - T * (1 + q), eta2 - S * (eta3 + q)];
  }
  budgetQuantity([, S]) { return S; }
  budget() {
    const [T, S] = this.y, q = Math.abs(T - S);
    return { quantity: S, terms: { freshwater: this.p.eta2, restoring: -this.p.eta3 * S, advection: -q * S } };
  }
  diagnostics() { const [T, S] = this.y; return { T, S, q: T - S }; }
  view() { return { kind: 'point', x: this.p.eta2, y: this.y[0] - this.y[1] }; }
}
// Equilibria: for each q, T = η1/(1+|q|), S = η2/(η3+|q|) ⇒ η2(q) = (η1/(1+|q|) − q)(η3+|q|).
export function stommelBranch({ eta1 = 3, eta3 = 0.3 } = {}) {
  const pts = [];
  for (let q = -1.5; q <= 3; q += 0.005) {
    const eta2 = (eta1 / (1 + Math.abs(q)) - q) * (eta3 + Math.abs(q));
    if (eta2 < -0.2 || eta2 > 3) continue;
    const T = eta1 / (1 + Math.abs(q)), S = eta2 / (eta3 + Math.abs(q)), s = Math.sign(q) || 1;
    // Jacobian of (T', S') at the equilibrium; stable iff trace < 0 and det > 0.
    const a = -(1 + Math.abs(q)) - T * s, b = T * s, c = -S * s, d = -(eta3 + Math.abs(q)) + S * s;
    pts.push({ x: eta2, y: q, stable: a + d < 0 && a * d - b * c > 0 });
  }
  return pts;
}

/* 3. ENSO recharge oscillator (Jin 1997; Burgers et al. 2005), time in months. */
export const ENSO_DEFAULTS = { R0: -0.03, R1: 0.03, period: 48, r: 0.02, sigma: 0.15, T0: 1, h0: 0, seed: 1 };
export class RechargeOscillator extends OdeSystem {
  constructor(p) {
    super(p, ENSO_DEFAULTS);
    this.dt = 0.1; this.omega = TAU / this.p.period; this.y = [this.p.T0, this.p.h0];
    if (this.p.sigma > 0) this.noise = (y, dt) => [y[0] + this.p.sigma * Math.sqrt(dt) * this.random.normal(), y[1]];
    this.initial = this.budgetQuantity(this.y);
  }
  growth(t) { return this.p.R0 + this.p.R1 * Math.cos(TAU * t / 12); }
  f(t, [T, h]) { return [this.growth(t) * T + this.omega * h, -this.p.r * h - this.omega * T]; }
  // With α = γ = ω the quadratic form E = (T² + h²)/2 is conserved when R = r = σ = 0.
  budgetQuantity([T, h]) { return this.omega * (T * T + h * h) / 2; }
  budget() {
    const [T, h] = this.y;
    return { quantity: this.budgetQuantity(this.y), terms: { growth: this.omega * this.growth(this.t) * T * T, damping: -this.omega * this.p.r * h * h } };
  }
  diagnostics() { const [T, h] = this.y; return { T, h, R: this.growth(this.t), month: ((this.t % 12) + 12) % 12 }; }
  view() { return { kind: 'point', x: this.y[1], y: this.y[0] }; }
}

/* 4. Lorenz (1963). */
export const L63_DEFAULTS = { sigma: 10, rho: 28, beta: 8 / 3, seed: 1 };
export class Lorenz63 extends OdeSystem {
  constructor(p) {
    super(p, L63_DEFAULTS);
    this.dt = 0.005; this.y = [1, 1, 20]; this.twin = true; this.initTwins();
    this.initial = this.budgetQuantity(this.y);
  }
  f(t, [x, y, z]) { const { sigma, rho, beta } = this.p; return [sigma * (y - x), x * (rho - z) - y, x * y - beta * z]; }
  // V = (x² + y² + (z − σ − ρ)²)/2 decays outside an ellipsoid → bounded attractor.
  budgetQuantity([x, y, z]) { const { sigma, rho } = this.p; return (x * x + y * y + (z - sigma - rho) ** 2) / 2; }
  budget() {
    const [x, y, z] = this.y, { sigma, rho, beta } = this.p;
    return { quantity: this.budgetQuantity(this.y), terms: { dissipation: -sigma * x * x - y * y - beta * z * z, forcing: beta * (sigma + rho) * z } };
  }
  diagnostics() {
    const [x, y, z] = this.y, d = this.f(this.t, this.y);
    return { x, y, z, E: (x * x + y * y + z * z) / 2, speed: Math.hypot(...d), contraction: -(this.p.sigma + 1 + this.p.beta), ...this.twinDiagnostics() };
  }
  view() { return { kind: 'point', x: this.y[0], y: this.y[2], tx: this.twinFree[0], ty: this.twinFree[2] }; }
}

/* 5. Lorenz (1996) single-scale model. */
export const L96_DEFAULTS = { n: 40, F: 8, seed: 1 };
export class Lorenz96 extends OdeSystem {
  constructor(p) {
    super(p, L96_DEFAULTS);
    this.dt = 0.01; const n = this.p.n;
    this.y = Array.from({ length: n }, (_, i) => this.p.F + (i === 0 ? 0.01 : 0) + 1e-3 * this.random.normal());
    this.twin = true; this.initTwins(); this.initial = this.budgetQuantity(this.y);
  }
  f(t, x) {
    const n = x.length, F = this.p.F, out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = (x[(i + 1) % n] - x[(i - 2 + n) % n]) * x[(i - 1 + n) % n] - x[i] + F;
    return out;
  }
  budgetQuantity(x) { let s = 0; for (const v of x) s += v * v; return s / (2 * x.length); }
  budget() {
    const x = this.y, n = x.length; let adv = 0, dis = 0, frc = 0;
    for (let i = 0; i < n; i++) {
      adv += x[i] * (x[(i + 1) % n] - x[(i - 2 + n) % n]) * x[(i - 1 + n) % n];
      dis -= x[i] * x[i]; frc += this.p.F * x[i];
    }
    return { quantity: this.budgetQuantity(x), terms: { forcing: frc / n, dissipation: dis / n, advection: adv / n } };
  }
  diagnostics() {
    const x = this.y; let mean = 0, max = 0; for (const v of x) { mean += v; max = Math.max(max, Math.abs(v)); }
    return { E: this.budgetQuantity(x), mean: mean / x.length, max, ...this.twinDiagnostics() };
  }
  view() { return { kind: 'row', values: Float64Array.from(this.y), twin: Float64Array.from(this.twinFree) }; }
}

/* 6. Kuramoto–Sivashinsky, u_t = −u u_x − u_xx − u_xxxx, ETDRK4 (Kassam & Trefethen 2005). */
export const KS_DEFAULTS = { L: 22, n: 64, dt: 0.25, seed: 1 };
class KsField {
  constructor(n, L, dt) {
    this.n = n; this.k = new Float64Array(n); this.Lin = new Float64Array(n);
    for (let i = 0; i < n; i++) { const k = TAU / L * wavenumber(i, n); this.k[i] = i === n / 2 ? 0 : k; this.Lin[i] = k * k - k ** 4; }
    // ETDRK4 coefficients by contour integral (M points on a unit circle around each L·dt).
    const M = 32; this.E = new Float64Array(n); this.E2 = new Float64Array(n);
    this.Q = new Float64Array(n); this.f1 = new Float64Array(n); this.f2 = new Float64Array(n); this.f3 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const Ldt = this.Lin[i] * dt; this.E[i] = Math.exp(Ldt); this.E2[i] = Math.exp(Ldt / 2);
      let Q = 0, f1 = 0, f2 = 0, f3 = 0;
      for (let m = 1; m <= M; m++) {
        const th = Math.PI * (m - 0.5) / M, re = Ldt + Math.cos(th), im = Math.sin(th);
        // Upper half of the contour suffices for real L: average the real parts.
        const c = fr => fr;
        const ex = Math.exp(re), er = ex * Math.cos(im), ei = ex * Math.sin(im);
        const eh = Math.exp(re / 2), ehr = eh * Math.cos(im / 2), ehi = eh * Math.sin(im / 2);
        const div = (ar, ai, br, bi) => { const d = br * br + bi * bi; return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d]; };
        const mul = (ar, ai, br, bi) => [ar * br - ai * bi, ar * bi + ai * br];
        Q += c(...div(ehr - 1, ehi, re, im));
        const r2 = mul(re, im, re, im), r3 = mul(r2[0], r2[1], re, im);
        // f1 = (−4 − r + e^r(4 − 3r + r²))/r³
        let a = mul(er, ei, 4 - 3 * re + r2[0], -3 * im + r2[1]);
        f1 += c(...div(-4 - re + a[0], -im + a[1], r3[0], r3[1]));
        // f2 = (2 + r + e^r(−2 + r))/r³
        a = mul(er, ei, -2 + re, im);
        f2 += c(...div(2 + re + a[0], im + a[1], r3[0], r3[1]));
        // f3 = (−4 − 3r − r² + e^r(4 − r))/r³
        a = mul(er, ei, 4 - re, -im);
        f3 += c(...div(-4 - 3 * re - r2[0] + a[0], -3 * im - r2[1] + a[1], r3[0], r3[1]));
      }
      this.Q[i] = dt * Q / M; this.f1[i] = dt * f1 / M; this.f2[i] = dt * f2 / M; this.f3[i] = dt * f3 / M;
    }
  }
  // N(û) = −½ ik (u²)^, dealiased by the 2/3 rule.
  nonlinear(vr, vi, outR, outI) {
    const n = this.n, ur = Float64Array.from(vr), ui = Float64Array.from(vi);
    fft(ur, ui, true);
    for (let j = 0; j < n; j++) { ur[j] = ur[j] * ur[j]; ui[j] = 0; }
    fft(ur, ui);
    for (let i = 0; i < n; i++) {
      const keep = Math.abs(wavenumber(i, n)) < n / 3;
      const g = -0.5 * this.k[i];
      outR[i] = keep ? -g * ui[i] : 0; outI[i] = keep ? g * ur[i] : 0;
    }
  }
  step(vr, vi) {
    const n = this.n, { E, E2, Q, f1, f2, f3 } = this;
    const Nv = [new Float64Array(n), new Float64Array(n)], Na = [new Float64Array(n), new Float64Array(n)];
    const Nb = [new Float64Array(n), new Float64Array(n)], Nc = [new Float64Array(n), new Float64Array(n)];
    const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n), cr = new Float64Array(n), ci = new Float64Array(n);
    this.nonlinear(vr, vi, ...Nv);
    for (let i = 0; i < n; i++) { ar[i] = E2[i] * vr[i] + Q[i] * Nv[0][i]; ai[i] = E2[i] * vi[i] + Q[i] * Nv[1][i]; }
    this.nonlinear(ar, ai, ...Na);
    for (let i = 0; i < n; i++) { br[i] = E2[i] * vr[i] + Q[i] * Na[0][i]; bi[i] = E2[i] * vi[i] + Q[i] * Na[1][i]; }
    this.nonlinear(br, bi, ...Nb);
    for (let i = 0; i < n; i++) { cr[i] = E2[i] * ar[i] + Q[i] * (2 * Nb[0][i] - Nv[0][i]); ci[i] = E2[i] * ai[i] + Q[i] * (2 * Nb[1][i] - Nv[1][i]); }
    this.nonlinear(cr, ci, ...Nc);
    for (let i = 0; i < n; i++) {
      vr[i] = E[i] * vr[i] + Nv[0][i] * f1[i] + 2 * (Na[0][i] + Nb[0][i]) * f2[i] + Nc[0][i] * f3[i];
      vi[i] = E[i] * vi[i] + Nv[1][i] * f1[i] + 2 * (Na[1][i] + Nb[1][i]) * f2[i] + Nc[1][i] * f3[i];
    }
  }
}
export class KuramotoSivashinsky {
  constructor(p) {
    this.p = { ...KS_DEFAULTS, ...p }; const { n, L, dt } = this.p;
    if (![32, 64, 128, 256].includes(n)) throw Error('격자 수는 32·64·128·256 중 하나여야 합니다.');
    this.dt = dt; this.t = 0; this.steps = 0; this.random = rng(this.p.seed);
    this.field = new KsField(n, L, dt);
    const u = new Float64Array(n);
    for (let j = 0; j < n; j++) { const x = L * j / n; u[j] = Math.cos(TAU * x / L) * (1 + Math.sin(TAU * x / L)) + 0.1 * this.random.normal(); }
    let mean = 0; for (const v of u) mean += v / n; for (let j = 0; j < n; j++) u[j] -= mean;
    this.vr = u; this.vi = new Float64Array(n); fft(this.vr, this.vi);
    this.initTwins(); this.initial = this.budget().quantity;
  }
  physical(vr = this.vr, vi = this.vi) { const a = Float64Array.from(vr), b = Float64Array.from(vi); fft(a, b, true); return a; }
  initTwins(delta = 1e-6) {
    const n = this.p.n, pr = new Float64Array(n), pi = new Float64Array(n);
    for (let j = 0; j < n; j++) pr[j] = this.random.normal();
    let mean = 0; for (const v of pr) mean += v / n; for (let j = 0; j < n; j++) pr[j] -= mean;
    const norm = Math.sqrt(pr.reduce((s, v) => s + v * v, 0) / n); fft(pr, pi);
    this.delta0 = delta; const scale = delta / norm;
    this.twinR = this.vr.map((v, i) => v + scale * pr[i]); this.twinI = this.vi.map((v, i) => v + scale * pi[i]);
    this.lyR = Float64Array.from(this.twinR); this.lyI = Float64Array.from(this.twinI);
    this.lyapSum = 0; this.lyapTime = 0;
  }
  perturbTwin() { this.initTwins(this.delta0); }
  distance(ar, ai) { const n = this.p.n; let s = 0; for (let i = 0; i < n; i++) s += (ar[i] - this.vr[i]) ** 2 + (ai[i] - this.vi[i]) ** 2; return Math.sqrt(s) / n; }
  step() {
    const n = this.p.n;
    for (const [a, b] of [[this.vr, this.vi], [this.twinR, this.twinI], [this.lyR, this.lyI]]) { this.field.step(a, b); hermitian(a, b, n); }
    const d = this.distance(this.lyR, this.lyI);
    if (d > 0) {
      this.lyapSum += Math.log(d / this.delta0); this.lyapTime += this.dt; const s = this.delta0 / d;
      for (let i = 0; i < this.p.n; i++) { this.lyR[i] = this.vr[i] + (this.lyR[i] - this.vr[i]) * s; this.lyI[i] = this.vi[i] + (this.lyI[i] - this.vi[i]) * s; }
    }
    this.t += this.dt; this.steps++;
    if (!Number.isFinite(this.vr[1])) throw Error('수치해가 발산했습니다.');
    return this.dt;
  }
  // Spatial averages via Parseval: ⟨g²⟩ = Σ|ĝ|²/n².
  budget() {
    const n = this.p.n, k = this.field.k; let E = 0, ux2 = 0, uxx2 = 0;
    for (let i = 0; i < n; i++) { const a = this.vr[i] ** 2 + this.vi[i] ** 2; E += a; ux2 += k[i] ** 2 * a; uxx2 += k[i] ** 4 * a; }
    const s = 1 / (n * n);
    return { quantity: E * s / 2, terms: { production: ux2 * s, hyperdiffusion: -uxx2 * s } };
  }
  diagnostics() {
    const u = this.physical(), n = this.p.n, k = this.field.k; let max = 0, mean = 0, Z = 0;
    for (const v of u) { max = Math.max(max, Math.abs(v)); mean += v / n; }
    for (let i = 0; i < n; i++) Z += k[i] ** 2 * (this.vr[i] ** 2 + this.vi[i] ** 2);
    return { E: this.budget().quantity, Z: Z / (2 * n * n), max, mean, error: this.distance(this.twinR, this.twinI), lyapunov: this.lyapTime > 0 ? this.lyapSum / this.lyapTime : NaN };
  }
  view() { return { kind: 'row', values: this.physical(), twin: this.physical(this.twinR, this.twinI) }; }
}

/* 7. Two-layer (Phillips) QG with imposed vertical shear, pseudo-spectral, doubly periodic [0, 2π]². */
export const QG2_DEFAULTS = { n: 64, U: 0.1, kd: 6, beta: 1, drag: 0.3, amp: 1e-2, seed: 1 };
export class TwoLayerQG {
  constructor(p) {
    this.p = { ...QG2_DEFAULTS, ...p }; const { n, kd, U, beta } = this.p;
    if (![32, 64, 128].includes(n)) throw Error('격자 수는 32·64·128 중 하나여야 합니다.');
    this.n = n; this.size = n * n; this.t = 0; this.steps = 0; this.dtMax = 0.1; this.random = rng(this.p.seed);
    this.F = kd * kd / 2; this.U1 = U; this.U2 = -U;
    this.Qy = [beta + this.F * (this.U1 - this.U2), beta - this.F * (this.U1 - this.U2)];
    const kx = new Float64Array(this.size), ky = new Float64Array(this.size), K2 = new Float64Array(this.size), keep = new Uint8Array(this.size), filter = new Float64Array(this.size);
    // Exponential spectral filter (as in pyqg) removes enstrophy at the grid scale.
    const kcut = 0.65 * n / 2, kmax = n / 2, alpha = -Math.log(1e-15) / (kmax - kcut) ** 4;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x, a = wavenumber(x, n), b = wavenumber(y, n), mag = Math.hypot(a, b);
      kx[i] = x === n / 2 ? 0 : a; ky[i] = y === n / 2 ? 0 : b; K2[i] = a * a + b * b;
      keep[i] = Math.abs(a) < n / 3 && Math.abs(b) < n / 3 ? 1 : 0;
      filter[i] = mag <= kcut ? 1 : Math.exp(-alpha * (mag - kcut) ** 4);
    }
    Object.assign(this, { kx, ky, K2, keep, filter });
    // Random large-scale perturbation in ψ1, ψ2.
    this.q = [0, 1].map(() => [new Float64Array(this.size), new Float64Array(this.size)]);
    const psi = [0, 1].map(() => [new Float64Array(this.size), new Float64Array(this.size)]);
    for (let j = 0; j < 2; j++) {
      const re = psi[j][0];
      for (let i = 0; i < this.size; i++) re[i] = this.random.normal();
      fft2(re, psi[j][1], n);
      for (let i = 0; i < this.size; i++) { const K = Math.sqrt(K2[i]); const w = K > 0 && K < kd * 1.5 ? 1 : 0; psi[j][0][i] *= w; psi[j][1][i] *= w; }
      fft2(re, psi[j][1], n, true); psi[j][1].fill(0);
      let rms = 0; for (const v of re) rms += v * v / this.size; rms = Math.sqrt(rms) || 1;
      for (let i = 0; i < this.size; i++) re[i] *= this.p.amp / rms;
      fft2(re, psi[j][1], n);
    }
    this.q = this.psiToQ(psi);
    this.filterWork = 0; this.initial = this.budget().quantity;
  }
  psiToQ([[a1, b1], [a2, b2]]) {
    const q = [[new Float64Array(this.size), new Float64Array(this.size)], [new Float64Array(this.size), new Float64Array(this.size)]];
    for (let i = 0; i < this.size; i++) {
      const K = this.K2[i], F = this.F;
      q[0][0][i] = -K * a1[i] + F * (a2[i] - a1[i]); q[0][1][i] = -K * b1[i] + F * (b2[i] - b1[i]);
      q[1][0][i] = -K * a2[i] + F * (a1[i] - a2[i]); q[1][1][i] = -K * b2[i] + F * (b1[i] - b2[i]);
    }
    return q;
  }
  // Barotropic/baroclinic inversion: q_bt = −K²ψ_bt, q_bc = −(K² + 2F)ψ_bc.
  invert(q) {
    const psi = [[new Float64Array(this.size), new Float64Array(this.size)], [new Float64Array(this.size), new Float64Array(this.size)]];
    for (let i = 0; i < this.size; i++) {
      const K = this.K2[i];
      for (let c = 0; c < 2; c++) {
        const bt = (q[0][c][i] + q[1][c][i]) / 2, bc = (q[0][c][i] - q[1][c][i]) / 2;
        const pbt = K > 0 ? -bt / K : 0, pbc = -bc / (K + 2 * this.F);
        psi[0][c][i] = pbt + pbc; psi[1][c][i] = pbt - pbc;
      }
    }
    return psi;
  }
  physical(re, im) {
    const a = Float64Array.from(re), b = Float64Array.from(im);
    fft2(a, b, this.n, true); return a;
  }
  rhs(q) {
    const n = this.n, size = this.size, psi = this.invert(q), out = [];
    let umax = 0;
    for (let j = 0; j < 2; j++) {
      const [pr, pi] = psi[j], [qr, qi] = q[j];
      const ur = new Float64Array(size), ui = new Float64Array(size), vr = new Float64Array(size), vi = new Float64Array(size);
      const qxr = new Float64Array(size), qxi = new Float64Array(size), qyr = new Float64Array(size), qyi = new Float64Array(size);
      for (let i = 0; i < size; i++) {
        // u = −ψ_y, v = ψ_x, (ik)·f̂ = (−k fi, k fr)
        ur[i] = this.ky[i] * pi[i]; ui[i] = -this.ky[i] * pr[i];
        vr[i] = -this.kx[i] * pi[i]; vi[i] = this.kx[i] * pr[i];
        qxr[i] = -this.kx[i] * qi[i]; qxi[i] = this.kx[i] * qr[i];
        qyr[i] = -this.ky[i] * qi[i]; qyi[i] = this.ky[i] * qr[i];
      }
      fft2(ur, ui, n, true); fft2(vr, vi, n, true); fft2(qxr, qxi, n, true); fft2(qyr, qyi, n, true);
      const nr = new Float64Array(size), ni = new Float64Array(size);
      const Uj = j === 0 ? this.U1 : this.U2;
      for (let i = 0; i < size; i++) { nr[i] = -(ur[i] * qxr[i] + vr[i] * qyr[i]); umax = Math.max(umax, Math.hypot(ur[i] + Uj, vr[i])); }
      fft2(nr, ni, n);
      const or = new Float64Array(size), oi = new Float64Array(size), Qy = this.Qy[j];
      for (let i = 0; i < size; i++) {
        const kx = this.kx[i];
        // −U_j ∂x q − Q_y ∂x ψ  (+ bottom drag −r∇²ψ₂ in the lower layer)
        let lr = Uj * kx * qi[i] + Qy * kx * pi[i], li = -Uj * kx * qr[i] - Qy * kx * pr[i];
        if (j === 1) { lr += this.p.drag * this.K2[i] * pr[i]; li += this.p.drag * this.K2[i] * pi[i]; }
        or[i] = (this.keep[i] ? nr[i] : 0) + lr; oi[i] = (this.keep[i] ? ni[i] : 0) + li;
      }
      out.push([or, oi]);
    }
    this.umax = umax;
    return out;
  }
  // SSP-RK3 with CFL-limited dt, followed by the spectral filter.
  step() {
    const q0 = this.q, k1 = this.rhs(q0);
    const dt = Math.min(this.dtMax, 0.4 * (TAU / this.n) / Math.max(this.umax, 1e-6));
    const comb = (a, b, wa, wb, k) => a.map((layer, j) => layer.map((arr, c) => arr.map((v, i) => wa * v + wb * (b[j][c][i] + dt * k[j][c][i]))));
    const q1 = q0.map((layer, j) => layer.map((arr, c) => arr.map((v, i) => v + dt * k1[j][c][i])));
    const q2 = comb(q0, q1, 3 / 4, 1 / 4, this.rhs(q1));
    let q3 = comb(q0, q2, 1 / 3, 2 / 3, this.rhs(q2));
    const before = this.energyOf(q3);
    for (const layer of q3) { for (const arr of layer) for (let i = 0; i < this.size; i++) arr[i] *= this.filter[i]; hermitian2(layer[0], layer[1], this.n); }
    this.filterWork += this.energyOf(q3) - before;
    this.q = q3; this.t += dt; this.steps++; this.lastDt = dt;
    if (!Number.isFinite(this.q[0][0][1])) throw Error('수치해가 발산했습니다. 전단 U나 격자를 바꿔 보세요.');
    return dt;
  }
  energyOf(q) {
    const psi = this.invert(q), s = 1 / (this.size * this.size); let E = 0;
    for (let i = 0; i < this.size; i++) {
      E += this.K2[i] * (psi[0][0][i] ** 2 + psi[0][1][i] ** 2 + psi[1][0][i] ** 2 + psi[1][1][i] ** 2);
      E += this.F * ((psi[0][0][i] - psi[1][0][i]) ** 2 + (psi[0][1][i] - psi[1][1][i]) ** 2);
    }
    return E * s / 2;
  }
  // E = ½⟨|∇ψ₁|² + |∇ψ₂|²⟩ + (F/2)⟨(ψ₁ − ψ₂)²⟩;  dE/dt = −Σ_j ⟨ψ_j ∂_t q_j⟩.
  budget() {
    const psi = this.invert(this.q), s = 1 / (this.size * this.size); let prod = 0, drag = 0;
    for (let i = 0; i < this.size; i++) {
      const kx = this.kx[i];
      for (let j = 0; j < 2; j++) {
        const Uj = j === 0 ? this.U1 : this.U2, [pr, pi] = psi[j], [qr, qi] = this.q[j];
        // −Re⟨ψ̂* (−U ik q̂)⟩ : mean-flow conversion (β term integrates to zero)
        prod += -(pr[i] * (Uj * kx * qi[i]) + pi[i] * (-Uj * kx * qr[i]));
      }
      drag += -this.p.drag * this.K2[i] * (psi[1][0][i] ** 2 + psi[1][1][i] ** 2);
    }
    return { quantity: this.energyOf(this.q), terms: { production: prod * s, drag: drag * s } };
  }
  diagnostics() {
    const psi = this.invert(this.q), s = 1 / (this.size * this.size); let KE = 0, APE = 0, Z = 0;
    for (let i = 0; i < this.size; i++) {
      KE += this.K2[i] * (psi[0][0][i] ** 2 + psi[0][1][i] ** 2 + psi[1][0][i] ** 2 + psi[1][1][i] ** 2) / 2;
      APE += this.F * ((psi[0][0][i] - psi[1][0][i]) ** 2 + (psi[0][1][i] - psi[1][1][i]) ** 2) / 2;
      Z += (this.q[0][0][i] ** 2 + this.q[0][1][i] ** 2 + this.q[1][0][i] ** 2 + this.q[1][1][i] ** 2) / 2;
    }
    if (this.umax === undefined) this.rhs(this.q);
    return { KE: KE * s, APE: APE * s, E: (KE + APE) * s, Z: Z * s, max: this.umax, dt: this.lastDt ?? 0 };
  }
  view(field = 'q1') {
    const psi = this.invert(this.q);
    let re, im;
    if (field === 'q1') [re, im] = this.q[0];
    else if (field === 'psi1') [re, im] = psi[0];
    else if (field === 'bc') { re = psi[0][0].map((v, i) => (v - psi[1][0][i]) / 2); im = psi[0][1].map((v, i) => (v - psi[1][1][i]) / 2); }
    else { re = psi[0][0].map((v, i) => -this.K2[i] * v); im = psi[0][1].map((v, i) => -this.K2[i] * v); } // ζ₁
    return { kind: 'field', n: this.n, values: this.physical(re, im) };
  }
}

export const SYSTEMS = { ebm: EnergyBalance, stommel: Stommel, enso: RechargeOscillator, l63: Lorenz63, l96: Lorenz96, ks: KuramotoSivashinsky, qg2: TwoLayerQG };

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
