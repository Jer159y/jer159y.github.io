// MAOOAM: Modular Arbitrary-Order Ocean-Atmosphere Model (De Cruz, Demaeyer & Vannitsem 2016),
// 36-variable configuration. The tensor assembly follows compute_aotensor() of the official Python code;
// the inner products (which depend only on the mode set) are imported precomputed.
import { OdeSystem, rk4 } from './core.js';
import data from './maooam-inprod.js';
import { spinupState } from './maooam-spinup.js';

const { inprod: ip, modes } = data;
// Physical parameters of the DDV2016 setting (De Cruz et al. 2016, GMD).
export const MAOOAM_DEFAULTS = {
  start: 'spinup', d: 1.1e-7, k: 0.0145, lambdaa: 15.06, Co: 310, epsa: 0.7,
  scale: 5e6, f0: 1.032e-4, n: 1.5, rra: 6370e3, phi0_npi: 0.25, gp: 3.1e-2, r: 1e-7, h: 136.5, sig0: 0.1,
  Go: 5.46e8, To0: 301.46, Ga: 1e7, Ca: 103.3333, Ta0: 289.3, sc: 1, rr: 287, sb: 5.6e-8, seed: 1,
};

// Returns a sparse tensor {i, j, k, v, group}: dx_i/dt = Σ v · y_j · y_k with y_0 = 1.
export function maooamTensor(p) {
  const { natm, noc } = modes, pi = Math.PI, L = p.scale / pi, phi0 = p.phi0_npi * pi;
  const LR = Math.sqrt(p.gp * p.h) / p.f0, G = -(L * L) / (LR * LR), betp = L / p.rra * Math.cos(phi0) / Math.sin(phi0);
  const rp = p.r / p.f0, dp = p.d / p.f0, kd = 2 * p.k, kdp = 2 * p.k, sig0 = p.sig0;
  const Cpo = p.Co / (p.Go * p.f0) * p.rr / (p.f0 ** 2 * L ** 2), Lpo = p.lambdaa / (p.Go * p.f0);
  const Cpa = p.Ca / (p.Ga * p.f0) * p.rr / (p.f0 ** 2 * L ** 2) / 2, Lpa = p.lambdaa / (p.Ga * p.f0);
  const sbpo = 4 * p.sb * p.To0 ** 3 / (p.Go * p.f0), sbpa = 8 * p.epsa * p.sb * p.Ta0 ** 3 / (p.Go * p.f0);
  const LSBpo = 2 * p.epsa * p.sb * p.To0 ** 3 / (p.Ga * p.f0), LSBpa = 8 * p.epsa * p.sb * p.Ta0 ** 3 / (p.Ga * p.f0);
  const psi = i => i, theta = i => i + natm, A = i => i + 2 * natm, T = i => i + 2 * natm + noc, dl = (i, j) => (i === j ? 1 : 0);
  const { a, b, c, d, g, s } = ip, { K, M, N, W, O, C } = ip;
  const map = new Map();
  const put = (i, j, k, v, group = '') => {
    if (Math.abs(v) < 2.220446049250313e-16) return;
    if (j > k) [j, k] = [k, j];
    const key = `${i},${j},${k},${group}`;
    map.set(key, (map.get(key) ?? 0) + v);
  };
  put(theta(1), 0, 0, Cpa / (1 - a[0][0] * sig0));
  for (let i = 1; i <= natm; i++) {
    for (let j = 1; j <= natm; j++) {
      put(psi(i), psi(j), 0, -(c[i - 1][j - 1] * betp) / a[i - 1][i - 1] - (kd * dl(i, j)) / 2);
      put(theta(i), psi(j), 0, (a[i - 1][j - 1] * kd * sig0) / (-2 + 2 * a[i - 1][i - 1] * sig0));
      put(psi(i), theta(j), 0, (kd * dl(i, j)) / 2);
      put(theta(i), theta(j), 0, (-(sig0 * (2 * c[i - 1][j - 1] * betp + a[i - 1][j - 1] * (kd + 4 * kdp))) + 2 * (LSBpa + p.sc * Lpa) * dl(i, j)) / (-2 + 2 * a[i - 1][i - 1] * sig0));
      for (let k = 1; k <= natm; k++) {
        put(psi(i), psi(j), psi(k), -(b[i - 1][j - 1][k - 1] / a[i - 1][i - 1]));
        put(psi(i), theta(j), theta(k), -(b[i - 1][j - 1][k - 1] / a[i - 1][i - 1]));
        put(theta(i), psi(j), theta(k), (g[i - 1][j - 1][k - 1] - b[i - 1][j - 1][k - 1] * sig0) / (-1 + a[i - 1][i - 1] * sig0));
        put(theta(i), theta(j), psi(k), (b[i - 1][j - 1][k - 1] * sig0) / (1 - a[i - 1][i - 1] * sig0));
      }
    }
    for (let j = 1; j <= noc; j++) {
      put(psi(i), A(j), 0, kd * d[i - 1][j - 1] / (2 * a[i - 1][i - 1]));
      put(theta(i), A(j), 0, kd * (d[i - 1][j - 1] * sig0) / (2 - 2 * a[i - 1][i - 1] * sig0));
      put(theta(i), T(j), 0, s[i - 1][j - 1] * (2 * LSBpo + Lpa) / (2 - 2 * a[i - 1][i - 1] * sig0));
    }
  }
  // Ocean streamfunction rows are tagged so their budget can be split into physical processes.
  for (let i = 1; i <= noc; i++) {
    const den = M[i - 1][i - 1] + G;
    for (let j = 1; j <= natm; j++) {
      put(A(i), psi(j), 0, K[i - 1][j - 1] * dp / den, 'wind');
      put(A(i), theta(j), 0, -K[i - 1][j - 1] * dp / den, 'wind');
    }
    for (let j = 1; j <= noc; j++) {
      put(A(i), A(j), 0, -(N[i - 1][j - 1] * betp) / den, 'beta');
      put(A(i), A(j), 0, -(M[i - 1][i - 1] * (rp + dp) * dl(i, j)) / den, 'friction');
      for (let k = 1; k <= noc; k++) put(A(i), A(j), A(k), -C[i - 1][j - 1][k - 1] / den, 'advection');
    }
  }
  for (let i = 1; i <= noc; i++) {
    put(T(i), 0, 0, Cpo * W[i - 1][0]);
    for (let j = 1; j <= natm; j++) put(T(i), theta(j), 0, W[i - 1][j - 1] * (2 * p.sc * Lpo + sbpa));
    for (let j = 1; j <= noc; j++) {
      put(T(i), T(j), 0, -(Lpo + sbpo) * dl(i, j));
      for (let k = 1; k <= noc; k++) put(T(i), A(j), T(k), -O[i - 1][j - 1][k - 1]);
    }
  }
  return [...map].map(([key, v]) => { const [i, j, k, group] = key.split(','); return { i: +i, j: +j, k: +k, v, group }; });
}

export class Maooam extends OdeSystem {
  constructor(p) {
    super(p, MAOOAM_DEFAULTS);
    this.ndim = modes.ndim; this.natm = modes.natm; this.noc = modes.noc;
    this.tensor = maooamTensor(this.p);
    this.I = Int32Array.from(this.tensor, e => e.i); this.J = Int32Array.from(this.tensor, e => e.j);
    this.K = Int32Array.from(this.tensor, e => e.k); this.V = Float64Array.from(this.tensor, e => e.v);
    this.dt = 0.1; // nondimensional; 1 day = 86400·f0 ≈ 8.92 time units
    // Default: start on the attractor (3000-year spin-up with the DDV2016 parameters); 'rest' starts near the rest state.
    let y = this.p.start === 'spinup' ? spinupState.slice() : new Array(this.ndim).fill(0);
    if (this.p.start !== 'spinup') { y[0] = 0.02; for (let i = 0; i < this.ndim; i++) y[i] += 1e-3 * this.random.normal(); }
    this.y = y; this.twin = true; this.initTwins(1e-8);
    this.initial = this.budgetQuantity(this.y);
  }
  f(t, x) {
    const n = this.ndim, y = new Float64Array(n + 1), out = new Array(n).fill(0);
    y[0] = 1; for (let i = 0; i < n; i++) y[i + 1] = x[i];
    for (let m = 0; m < this.V.length; m++) out[this.I[m] - 1] += this.V[m] * y[this.J[m]] * y[this.K[m]];
    return out;
  }
  oceanSlice(x = this.y) { const o = 2 * this.natm; return x.slice(o, o + this.noc); }
  // ½Σ ψ_o,i² over the ocean streamfunction modes (amplitude norm, not the energy norm).
  budgetQuantity(x) { return this.oceanSlice(x).reduce((s, v) => s + v * v, 0) / 2; }
  budget() {
    const n = this.ndim, y = new Float64Array(n + 1), terms = { wind: 0, friction: 0, beta: 0, advection: 0 };
    y[0] = 1; for (let i = 0; i < n; i++) y[i + 1] = this.y[i];
    for (const e of this.tensor) if (e.group) terms[e.group] += y[e.i] * e.v * y[e.j] * y[e.k];
    return { quantity: this.budgetQuantity(this.y), terms };
  }
  diagnostics() {
    const x = this.y, na = this.natm, no = this.noc;
    let Ea = 0, Ta = 0, Eo = 0, To = 0;
    for (let i = 0; i < na; i++) { Ea += x[i] ** 2; Ta += x[na + i] ** 2; }
    for (let i = 0; i < no; i++) { Eo += x[2 * na + i] ** 2; To += x[2 * na + no + i] ** 2; }
    return { psiA1: x[0], psiA2: x[1], thetaA1: x[na], psiO2: x[2 * na + 1], TO2: x[2 * na + no + 1], psiO1: x[2 * na], Ea: Ea / 2, Eo: Eo / 2, ...this.twinDiagnostics() };
  }
  // Spatial fields on the channel/basin, reconstructed from the mode amplitudes.
  fields(nx = 48, ny = 32) {
    const n = modes.n, Lx = 2 * Math.PI / n, out = { psiA: new Float64Array(nx * ny), thetaA: new Float64Array(nx * ny), psiO: new Float64Array(nx * ny), TO: new Float64Array(nx * ny) };
    const na = this.natm, no = this.noc, x = this.y;
    for (let jy = 0; jy < ny; jy++) for (let ix = 0; ix < nx; ix++) {
      const X = (ix + 0.5) / nx * Lx, Y = (jy + 0.5) / ny * Math.PI, idx = jy * nx + ix;
      modes.atm.forEach((m, i) => {
        const F = m.typ === 'A' ? Math.SQRT2 * Math.cos(m.P * Y) : m.typ === 'K' ? 2 * Math.cos(m.M * n * X) * Math.sin(m.P * Y) : 2 * Math.sin(m.H * n * X) * Math.sin(m.P * Y);
        out.psiA[idx] += x[i] * F; out.thetaA[idx] += x[na + i] * F;
      });
      modes.ocn.forEach((m, i) => {
        const phi = 2 * Math.sin(m.H * n * X / 2) * Math.sin(m.P * Y);
        out.psiO[idx] += x[2 * na + i] * phi; out.TO[idx] += x[2 * na + no + i] * phi;
      });
    }
    return { nx, ny, ...out };
  }
  view(field = 'psiO') {
    const f = this.fields();
    return { kind: 'field', nx: f.nx, ny: f.ny, n: f.nx, values: f[field] ?? f.psiO };
  }
}
export { rk4 };
