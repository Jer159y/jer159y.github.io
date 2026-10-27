// Marine systems: wind-driven gyre in a closed basin, rotating shallow water, and a marine-heatwave SST generator.
import { rng, dst } from './core.js';
import { OceanSolver } from './ocean-solver.js';

/* Barotropic wind-driven gyre on the unit square with free-slip walls (Stommel 1948; Munk 1950; Veronis 1966).
   ∂ζ/∂t + J(ψ, ζ) + β ∂ψ/∂x = curl τ − r ζ + A ∇²ζ,  ζ = ∇²ψ,  ψ = ζ = 0 on the walls. */
export const GYRE_DEFAULTS = { n: 64, wind: 'double', tau: 1e-3, beta: 1, r: 0.01, A: 1e-4, asym: 0, particles: 96, seed: 1 };
export class WindGyre {
  constructor(p) {
    this.p = { ...GYRE_DEFAULTS, ...p };
    const { n } = this.p;
    if (![32, 64, 128].includes(n)) throw Error('격자 수는 32·64·128 중 하나여야 합니다.');
    this.n = n; this.dx = 1 / n; this.m = n - 1; this.size = this.m * this.m; // interior points only
    this.t = 0; this.steps = 0; this.random = rng(this.p.seed);
    this.zeta = new Float64Array(this.size); this.psi = new Float64Array(this.size);
    // Eigenvalues of the 5-point Laplacian under the sine basis.
    this.eig = new Float64Array(this.size);
    for (let j = 0; j < this.m; j++) for (let i = 0; i < this.m; i++) {
      this.eig[j * this.m + i] = -4 / this.dx ** 2 * (Math.sin(Math.PI * (i + 1) / (2 * n)) ** 2 + Math.sin(Math.PI * (j + 1) / (2 * n)) ** 2);
    }
    this.curl = new Float64Array(this.size);
    for (let j = 0; j < this.m; j++) for (let i = 0; i < this.m; i++) {
      const y = (j + 1) * this.dx;
      // τx = −τ cos(2πy) (double gyre) or −τ cos(πy) (single gyre); curl τ = −∂τx/∂y.
      // `asym` adds a single-gyre component that breaks the north–south symmetry of the double gyre.
      this.curl[j * this.m + i] = this.p.wind === 'single' ? -this.p.tau * Math.PI * Math.sin(Math.PI * y) : -this.p.tau * (2 * Math.PI * Math.sin(2 * Math.PI * y) + this.p.asym * Math.PI * Math.sin(Math.PI * y));
    }
    for (let k = 0; k < this.size; k++) this.zeta[k] = 1e-6 * this.p.tau * 1e3 * this.random.normal();
    this.psi = this.invert(this.zeta);
    this.parts = Array.from({ length: this.p.particles }, () => [0.1 + 0.8 * this.random.uniform(), 0.1 + 0.8 * this.random.uniform()]);
    this.parts0 = this.parts.map(q => q.slice());
    this.initial = 0;
  }
  at(a, i, j) { return i < 0 || j < 0 || i >= this.m || j >= this.m ? 0 : a[j * this.m + i]; }
  // 2D sine transform on interior points; applying it twice multiplies by (n/2)².
  dst2(a) {
    const m = this.m, out = new Float64Array(this.size), row = new Float64Array(m);
    for (let j = 0; j < m; j++) { for (let i = 0; i < m; i++) row[i] = a[j * m + i]; const r = dst(row); for (let i = 0; i < m; i++) out[j * m + i] = r[i]; }
    for (let i = 0; i < m; i++) { for (let j = 0; j < m; j++) row[j] = out[j * m + i]; const r = dst(row); for (let j = 0; j < m; j++) out[j * m + i] = r[j]; }
    return out;
  }
  invert(zeta) {
    const s = this.dst2(zeta), scale = (2 / this.n) ** 2;
    for (let k = 0; k < this.size; k++) s[k] /= this.eig[k];
    const psi = this.dst2(s); for (let k = 0; k < this.size; k++) psi[k] *= scale;
    return psi;
  }
  lap(a, i, j) { return (this.at(a, i + 1, j) + this.at(a, i - 1, j) + this.at(a, i, j + 1) + this.at(a, i, j - 1) - 4 * this.at(a, i, j)) / this.dx ** 2; }
  // Arakawa (1966) Jacobian; boundary values are zero, which keeps its discrete conservation properties.
  jac(a, b, i, j) {
    const A = (di, dj) => this.at(a, i + di, j + dj), B = (di, dj) => this.at(b, i + di, j + dj);
    const j1 = (A(1, 0) - A(-1, 0)) * (B(0, 1) - B(0, -1)) - (A(0, 1) - A(0, -1)) * (B(1, 0) - B(-1, 0));
    const j2 = A(1, 0) * (B(1, 1) - B(1, -1)) - A(-1, 0) * (B(-1, 1) - B(-1, -1)) - A(0, 1) * (B(1, 1) - B(-1, 1)) + A(0, -1) * (B(1, -1) - B(-1, -1));
    const j3 = B(0, 1) * (A(1, 1) - A(-1, 1)) - B(0, -1) * (A(1, -1) - A(-1, -1)) - B(1, 0) * (A(1, 1) - A(1, -1)) + B(-1, 0) * (A(-1, 1) - A(-1, -1));
    return (j1 + j2 + j3) / (12 * this.dx ** 2);
  }
  rhs(zeta) {
    const psi = this.invert(zeta), out = new Float64Array(this.size), { beta, r, A } = this.p;
    let umax = 0;
    for (let j = 0; j < this.m; j++) for (let i = 0; i < this.m; i++) {
      const k = j * this.m + i, px = (this.at(psi, i + 1, j) - this.at(psi, i - 1, j)) / (2 * this.dx), py = (this.at(psi, i, j + 1) - this.at(psi, i, j - 1)) / (2 * this.dx);
      umax = Math.max(umax, Math.hypot(px, py));
      out[k] = -this.jac(psi, zeta, i, j) - beta * px + this.curl[k] - r * zeta[k] + A * this.lap(zeta, i, j);
    }
    this.umax = umax; this.psi = psi;
    return out;
  }
  step() {
    const z0 = this.zeta, k1 = this.rhs(z0);
    const dt = Math.min(0.5 / this.p.beta, 0.4 * this.dx / Math.max(this.umax, 1e-6), this.p.A > 0 ? 0.2 * this.dx ** 2 / this.p.A : 1, this.p.r > 0 ? 0.5 / this.p.r : 1);
    const z1 = z0.map((v, k) => v + dt * k1[k]), k2 = this.rhs(z1);
    const z2 = z0.map((v, k) => 0.75 * v + 0.25 * (z1[k] + dt * k2[k])), k3 = this.rhs(z2);
    this.zeta = z0.map((v, k) => v / 3 + 2 / 3 * (z2[k] + dt * k3[k]));
    this.psi = this.invert(this.zeta);
    this.advectParticles(dt);
    this.t += dt; this.steps++; this.lastDt = dt;
    if (!Number.isFinite(this.zeta[this.size >> 1])) throw Error('수치해가 발산했습니다. 바람 세기를 줄이거나 점성을 키워 보세요.');
    return dt;
  }
  // Bilinear interpolation of ψ on the full grid (walls included), velocity u = −ψ_y, v = ψ_x.
  psiAt(x, y) {
    const n = this.n, X = Math.min(Math.max(x * n, 0), n - 1e-9), Y = Math.min(Math.max(y * n, 0), n - 1e-9), i = Math.floor(X), j = Math.floor(Y), fx = X - i, fy = Y - j;
    const P = (a, b) => this.at(this.psi, a - 1, b - 1);
    return (1 - fx) * (1 - fy) * P(i, j) + fx * (1 - fy) * P(i + 1, j) + (1 - fx) * fy * P(i, j + 1) + fx * fy * P(i + 1, j + 1);
  }
  vel(x, y) { const e = 0.5 * this.dx; return [-(this.psiAt(x, y + e) - this.psiAt(x, y - e)) / (2 * e), (this.psiAt(x + e, y) - this.psiAt(x - e, y)) / (2 * e)]; }
  advectParticles(dt) {
    for (const q of this.parts) {
      const [u1, v1] = this.vel(q[0], q[1]), [u2, v2] = this.vel(q[0] + dt * u1 / 2, q[1] + dt * v1 / 2);
      q[0] = Math.min(Math.max(q[0] + dt * u2, 1e-3), 1 - 1e-3); q[1] = Math.min(Math.max(q[1] + dt * v2, 1e-3), 1 - 1e-3);
    }
  }
  resetParticles() { this.parts = this.parts0.map(q => q.slice()); this.partT0 = this.t; }
  // E = ½⟨|∇ψ|²⟩ = −½⟨ψζ⟩;  dE/dt = −⟨ψ curl τ⟩ − 2rE − A⟨ζ²⟩ (Jacobian and β terms vanish).
  budget() {
    const psi = this.psi, N = this.n * this.n; let E = 0, wind = 0, visc = 0;
    for (let j = 0; j < this.m; j++) for (let i = 0; i < this.m; i++) {
      const k = j * this.m + i; E -= psi[k] * this.zeta[k]; wind -= psi[k] * this.curl[k]; visc -= psi[k] * this.p.A * this.lap(this.zeta, i, j);
    }
    E /= 2 * N;
    return { quantity: E, terms: { wind: wind / N, drag: -2 * this.p.r * E, viscosity: visc / N } };
  }
  diagnostics() {
    let Z = 0, pmax = -Infinity, pmin = Infinity;
    for (let k = 0; k < this.size; k++) { Z += this.zeta[k] ** 2 / 2; pmax = Math.max(pmax, this.psi[k]); pmin = Math.min(pmin, this.psi[k]); }
    // Western-boundary transport at y = 1/4: max |ψ| reached inside the western boundary layer.
    return { E: this.budget().quantity, Z: Z / (this.n * this.n), psiMax: pmax, psiMin: pmin, max: this.umax ?? 0, dt: this.lastDt ?? 0, dispersion: this.dispersion() };
  }
  dispersion() {
    let s = 0; this.parts.forEach((q, i) => { s += (q[0] - this.parts0[i][0]) ** 2 + (q[1] - this.parts0[i][1]) ** 2; });
    return s / this.parts.length;
  }
  // ψ on the full (n+1)² grid with zero walls; Sverdrup ψ_S = −(1/β)∫_x^1 curl τ dx' for comparison.
  view(field = 'psi') {
    const n = this.n + 1, out = new Float64Array(n * n), src = field === 'zeta' ? this.zeta : this.psi;
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) out[j * n + i] = src[(j - 1) * this.m + (i - 1)];
    if (field === 'sverdrup') for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) out[j * n + i] = -(1 - i / (n - 1)) * this.curl[(j - 1) * this.m] / this.p.beta;
    return { kind: 'field', n, nx: n, ny: n, values: out, particles: this.parts.map(q => q.slice()) };
  }
  section(yFrac = 0.25) {
    const j = Math.round(yFrac * this.n) - 1, xs = [], psi = [], sv = [], v = [];
    for (let i = 0; i < this.m; i++) {
      xs.push((i + 1) * this.dx); psi.push(this.psi[j * this.m + i]);
      sv.push(-(1 - (i + 1) * this.dx) * this.curl[j * this.m + i] / this.p.beta);
      v.push((this.at(this.psi, i + 1, j) - this.at(this.psi, i - 1, j)) / (2 * this.dx));
    }
    return { xs, psi, sverdrup: sv, v };
  }
}

/* Rotating shallow water on a periodic domain (geostrophic adjustment, Poincaré waves), reusing OceanSolver. */
export const SWE_DEFAULTS = { n: 64, c: 1, f: 2, nu: 0.002, drag: 0, forcing: 0, amp: 0.18, initial: 'vortices' };
export class ShallowWater {
  constructor(p) {
    this.p = { ...SWE_DEFAULTS, ...p };
    this.s = new OceanSolver({ model: 'swe', ...this.p });
    this.t = 0; this.steps = 0; this.mass0 = this.s.metrics().mass;
    this.initial = this.budget().quantity;
  }
  step() { const dt = this.s.step(); this.t = this.s.t; this.steps = this.s.steps; return dt; }
  // Energy E = ⟨½h|u|² + ½c²(h−1)²⟩. Explicit terms: drag, viscosity, forcing; Rusanov numerical dissipation shows up as the residual.
  budget() {
    const s = this.s, n = s.n, p = this.p, [h, mx, my] = s.a; let E = 0, drag = 0, visc = 0, frc = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const k = y * n + x, u = mx[k] / h[k], v = my[k] / h[k];
      E += 0.5 * h[k] * (u * u + v * v) + 0.5 * p.c ** 2 * (h[k] - 1) ** 2;
      drag -= p.drag * (u * mx[k] + v * my[k]);
      visc += p.nu * (u * s.lap(mx, x, y) + v * s.lap(my, x, y));
      frc += u * h[k] * p.forcing * Math.sin(4 * (y + 0.5) * s.dx);
    }
    const N = n * n;
    return { quantity: E / N, terms: { drag: drag / N, viscosity: visc / N, forcing: frc / N } };
  }
  diagnostics() {
    const m = this.s.metrics(), s = this.s, n = s.n, [h] = s.a; let KE = 0, PE = 0;
    for (let k = 0; k < n * n; k++) { KE += 0.5 * h[k] * (s.u[k] ** 2 + s.v[k] ** 2); PE += 0.5 * this.p.c ** 2 * (h[k] - 1) ** 2; }
    return { E: m.energy, KE: KE / (n * n), PE: PE / (n * n), Z: m.enstrophy, mass: (m.mass - this.mass0) / this.mass0, max: m.maxSpeed, dt: m.dt, Ld: this.p.f > 0 ? this.p.c / this.p.f : Infinity };
  }
  view(field = 'height') {
    const s = this.s, n = s.n, values = s.field(field), row = new Float64Array(n), mid = n >> 1;
    for (let x = 0; x < n; x++) row[x] = s.a[0][mid * n + x] - 1;
    return { kind: 'field', n, nx: n, ny: n, values: Float64Array.from(values), u: Float64Array.from(s.u), v: Float64Array.from(s.v), row };
  }
}

/* Synthetic daily SST: seasonal climatology + linear trend + Ornstein–Uhlenbeck anomaly (Hasselmann-type). */
export const MHW_DEFAULTS = { mean: 18, amp: 7, tau: 15, sd: 0.9, trend: 0.3, seed: 1 };
export class SstGenerator {
  constructor(p) {
    this.p = { ...MHW_DEFAULTS, ...p };
    this.random = rng(this.p.seed); this.t = 0; this.steps = 0; this.dt = 1; this.a = 0; this.noiseWork = 0;
    this.noise = true; this.initial = 0;
  }
  clim(day) { return this.p.mean - this.p.amp * Math.cos(2 * Math.PI * (day - 30) / 365.25); }
  sst() { return this.clim(this.t) + this.p.trend * this.t / 3652.5 + this.a; }
  // Exact OU update over one day; anomaly variance budget ½a²: damping −a²/τ plus noise input.
  step() {
    const { tau, sd } = this.p, phi = Math.exp(-1 / tau), before = this.a * this.a / 2;
    const det = this.a * phi;
    this.a = det + sd * Math.sqrt(1 - phi * phi) * this.random.normal();
    this.noiseWork += this.a * this.a / 2 - det * det / 2;
    this.dampWork = (this.dampWork ?? 0) + det * det / 2 - before;
    this.t += 1; this.steps++;
    return 1;
  }
  budget() { return { quantity: this.a * this.a / 2, terms: { damping: -this.a * this.a / this.p.tau } }; }
  diagnostics() { return { sst: this.sst(), anomaly: this.a, clim: this.clim(this.t) + this.p.trend * this.t / 3652.5, year: this.t / 365.25 }; }
  view() { return { kind: 'point', x: this.t, y: this.sst() }; }
}
