// Low-dimensional ODE systems of the climate/ocean ladder.
import { TAU, rk4, OdeSystem } from './core.js';

/* 1. Zero-dimensional energy balance model with ice–albedo feedback. */
export const EBM_DEFAULTS = { mu: 1, forcing: 0, depth: 50, sigma: 3, T0: 15, seed: 1 };
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
export const STOMMEL_DEFAULTS = { eta1: 3, eta2: 1, eta3: 0.3, sigma: 0.03, start: 'thermal', ramp: 0, top: 1.4, seed: 1 };
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
  // With ramp > 0, η₂ rises linearly to `top` and comes back down (a triangular hosing experiment).
  eta2(t) {
    const { eta2, ramp, top } = this.p;
    if (!(ramp > 0) || top <= eta2) return eta2;
    const span = (top - eta2) / ramp, phase = t % (2 * span);
    return eta2 + ramp * (phase < span ? phase : 2 * span - phase);
  }
  f(t, [T, S]) {
    const q = Math.abs(T - S), { eta1, eta3 } = this.p;
    return [eta1 - T * (1 + q), this.eta2(t) - S * (eta3 + q)];
  }
  budgetQuantity([, S]) { return S; }
  budget() {
    const [T, S] = this.y, q = Math.abs(T - S);
    return { quantity: S, terms: { freshwater: this.eta2(this.t), restoring: -this.p.eta3 * S, advection: -q * S } };
  }
  diagnostics() { const [T, S] = this.y; return { T, S, q: T - S, eta2: this.eta2(this.t) }; }
  view() { return { kind: 'point', x: this.eta2(this.t), y: this.y[0] - this.y[1], tx: this.y[0], ty: this.y[1] }; }
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
export const ENSO_DEFAULTS = { R0: -0.05, R1: 0.12, peak: 8, period: 48, r: 0.02, sigma: 0.15, B: 0, T0: 1, h0: 0, seed: 1 };
export class RechargeOscillator extends OdeSystem {
  constructor(p) {
    super(p, ENSO_DEFAULTS);
    this.dt = 0.1; this.omega = TAU / this.p.period; this.y = [this.p.T0, this.p.h0];
    // State-dependent (multiplicative) noise σ(1 + B·T), as in Jin et al. (2007); B = 0 is additive.
    if (this.p.sigma > 0) this.noise = (y, dt) => [y[0] + this.p.sigma * (1 + this.p.B * y[0]) * Math.sqrt(dt) * this.random.normal(), y[1]];
    this.initial = this.budgetQuantity(this.y);
  }
  // t in months, t = 0 at the start of January; the coupled growth rate peaks in calendar month `peak` (1–12).
  growth(t) { return this.p.R0 + this.p.R1 * Math.cos(TAU * (t - (this.p.peak - 0.5)) / 12); }
  f(t, [T, h]) { return [this.growth(t) * T + this.omega * h, -this.p.r * h - this.omega * T]; }
  // With α = γ = ω the quadratic form E = (T² + h²)/2 is conserved when R = r = σ = 0.
  budgetQuantity([T, h]) { return this.omega * (T * T + h * h) / 2; }
  budget() {
    const [T, h] = this.y;
    return { quantity: this.budgetQuantity(this.y), terms: { growth: this.omega * this.growth(this.t) * T * T, damping: -this.omega * this.p.r * h * h } };
  }
  diagnostics() { const [T, h] = this.y; return { T, h, R: this.growth(this.t), month: Math.floor(((this.t % 12) + 12) % 12) + 1 }; }
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
    return { E: this.budgetQuantity(x), mean: mean / x.length, max, x0: x[0], ...this.twinDiagnostics() };
  }
  view() { return { kind: 'row', values: Float64Array.from(this.y), twin: Float64Array.from(this.twinFree) }; }
}


/* Charney–DeVore six-mode barotropic channel model with zonal forcing (De Swart 1988; Crommelin et al. 2004). */
export const CDV_DEFAULTS = { x1s: 0.95, x4s: -0.76095, C: 0.1, beta: 1.25, gamma: 0.2, b: 0.5, seed: 1 };
export class CharneyDeVore extends OdeSystem {
  constructor(p) {
    super(p, CDV_DEFAULTS);
    const { b, beta, gamma } = this.p, s2 = Math.SQRT2, pi = Math.PI;
    const alpha = m => 8 * s2 / pi * m * m / (4 * m * m - 1) * (b * b + m * m - 1) / (b * b + m * m);
    const betaM = m => beta * b * b / (b * b + m * m);
    const delta = m => 64 * s2 / (15 * pi) * (b * b - m * m + 1) / (b * b + m * m);
    const gammaS = m => gamma * 4 * m / (4 * m * m - 1) * s2 * b / pi;
    const gammaM = m => gamma * 4 * m ** 3 / (4 * m * m - 1) * s2 * b / (pi * (b * b + m * m));
    this.c = { a1: alpha(1), a2: alpha(2), b1: betaM(1), b2: betaM(2), d1: delta(1), d2: delta(2), g1s: gammaS(1), g2s: gammaS(2), g1: gammaM(1), g2: gammaM(2), eps: 16 * s2 / (5 * pi) };
    this.dt = 0.1; // 1 time unit = 1 day
    this.y = Array.from({ length: 6 }, () => 2 * this.random.uniform() - 1);
    this.twin = true; this.initTwins(); this.initial = this.budgetQuantity(this.y);
  }
  f(t, [x1, x2, x3, x4, x5, x6]) {
    const { a1, a2, b1, b2, d1, d2, g1s, g2s, g1, g2, eps } = this.c, { C, x1s, x4s } = this.p;
    return [
      g1s * x3 - C * (x1 - x1s),
      -(a1 * x1 - b1) * x3 - C * x2 - d1 * x4 * x6,
      (a1 * x1 - b1) * x2 - g1 * x1 - C * x3 + d1 * x4 * x5,
      g2s * x6 - C * (x4 - x4s) + eps * (x2 * x6 - x3 * x5),
      -(a2 * x1 - b2) * x6 - C * x5 - d2 * x4 * x3,
      (a2 * x1 - b2) * x5 - g2 * x4 - C * x6 + d2 * x4 * x2,
    ];
  }
  // ½|x|² is the Euclidean norm of the mode amplitudes, not the kinetic-energy norm of the flow.
  budgetQuantity(x) { return x.reduce((s, v) => s + v * v, 0) / 2; }
  budget() {
    const [x1, x2, x3, x4, x5, x6] = this.y, { g1s, g2s, g1, g2, d1, d2, eps } = this.c, { C, x1s, x4s } = this.p;
    return {
      quantity: this.budgetQuantity(this.y),
      terms: {
        forcing: C * (x1s * x1 + x4s * x4),
        damping: -C * this.y.reduce((s, v) => s + v * v, 0),
        topography: (g1s - g1) * x1 * x3 + (g2s - g2) * x4 * x6,
        nonlinear: x4 * (x2 * x6 - x3 * x5) * (d2 - d1 + eps),
      },
    };
  }
  diagnostics() {
    const [x1, x2, x3, x4, x5, x6] = this.y;
    return { x1, x2, x3, x4, x5, x6, ...this.twinDiagnostics() };
  }
  view() { return { kind: 'point', x: this.y[0], y: this.y[3], tx: this.twinFree[0], ty: this.twinFree[3] }; }
}

/* Two-scale Lorenz (1996): K slow X variables, each coupled to J fast Y variables. */
export const L96TWO_DEFAULTS = { K: 8, J: 32, F: 20, h: 1, b: 10, c: 10, seed: 1 };
export class Lorenz96TwoScale extends OdeSystem {
  constructor(p) {
    super(p, L96TWO_DEFAULTS);
    const { K, J, F } = this.p;
    this.dt = 0.001;
    this.y = [...Array.from({ length: K }, () => F * (0.5 + 0.5 * this.random.uniform())), ...Array.from({ length: K * J }, () => 0.1 * this.random.normal())];
    this.twin = true; this.initTwins(); this.initial = this.budgetQuantity(this.y);
  }
  f(t, y) {
    const { K, J, F, h, b, c } = this.p, N = K * J, out = new Array(K + N), hcb = h * c / b;
    for (let k = 0; k < K; k++) {
      let sumY = 0; for (let j = 0; j < J; j++) sumY += y[K + k * J + j];
      out[k] = y[(k - 1 + K) % K] * (y[(k + 1) % K] - y[(k - 2 + K) % K]) - y[k] + F - hcb * sumY;
    }
    for (let i = 0; i < N; i++) {
      const Y = j => y[K + ((j % N) + N) % N];
      out[K + i] = -c * b * Y(i + 1) * (Y(i + 2) - Y(i - 1)) - c * y[K + i] + hcb * y[Math.floor(i / J)];
    }
    return out;
  }
  // Subgrid tendency felt by X_k: U_k = −(hc/b) Σ_j Y_{j,k}. This is what a parameterization must model.
  coupling(y = this.y) {
    const { K, J, h, b, c } = this.p, U = new Array(K);
    for (let k = 0; k < K; k++) { let s = 0; for (let j = 0; j < J; j++) s += y[K + k * J + j]; U[k] = -h * c / b * s; }
    return U;
  }
  budgetQuantity(y) { const K = this.p.K; let s = 0; for (let k = 0; k < K; k++) s += y[k] * y[k]; return s / (2 * K); }
  budget() {
    const { K, F } = this.p, X = this.y.slice(0, K), U = this.coupling();
    let adv = 0, dis = 0, frc = 0, cpl = 0;
    for (let k = 0; k < K; k++) {
      adv += X[k] * X[(k - 1 + K) % K] * (X[(k + 1) % K] - X[(k - 2 + K) % K]);
      dis -= X[k] * X[k]; frc += F * X[k]; cpl += X[k] * U[k];
    }
    return { quantity: this.budgetQuantity(this.y), terms: { forcing: frc / K, dissipation: dis / K, coupling: cpl / K, advection: adv / K } };
  }
  diagnostics() {
    const { K } = this.p, X = this.y.slice(0, K), Y = this.y.slice(K);
    let EY = 0, max = 0; for (const v of Y) EY += v * v / (2 * Y.length); for (const v of X) max = Math.max(max, Math.abs(v));
    return { E: this.budgetQuantity(this.y), EY, max, X0: X[0], U0: this.coupling()[0], ...this.twinDiagnostics() };
  }
  view() {
    const K = this.p.K;
    return { kind: 'row', values: Float64Array.from(this.y.slice(0, K)), twin: Float64Array.from(this.twinFree.slice(0, K)), fast: Float64Array.from(this.y.slice(K)), pairs: [this.y.slice(0, K), this.coupling()] };
  }
}
