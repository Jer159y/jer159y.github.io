// Batch ensemble experiments run inside the worker (cheap low-dimensional systems only).
import { rng, rk4 } from './core.js';
import { RechargeOscillator, Lorenz63 } from './sys-ode.js';
import { crps, rankOf, mean, std } from './stats.js';

// ENSO RO: perfect-model ensemble hindcasts from every month of a long "truth" run.
// Members start from the true state plus small initial error and receive independent noise.
export function ensoHindcast(params, { years = 120, members = 30, maxLead = 18, initErr = 0.05 } = {}) {
  const truth = new RechargeOscillator({ ...params, seed: 7 }), perMonth = 10; // dt = 0.1 month
  for (let i = 0; i < 12 * 50 * perMonth; i++) truth.step(); // spin-up
  const T = [], H = [], months = years * 12 + maxLead + 1;
  for (let m = 0; m < months; m++) { T.push(truth.y[0]); H.push(truth.y[1]); for (let i = 0; i < perMonth; i++) truth.step(); }
  const t0 = truth.t - months; // time (months) of the first stored state
  const random = rng(11), sim = new RechargeOscillator({ ...params, seed: 3 });
  const acc = Array.from({ length: 12 }, () => Array.from({ length: maxLead + 1 }, () => ({ f: [], o: [] })));
  const crpsLead = Array.from({ length: maxLead + 1 }, () => []), spreadLead = Array.from({ length: maxLead + 1 }, () => []), errLead = Array.from({ length: maxLead + 1 }, () => []);
  const ranks = new Array(members + 1).fill(0), plume = { start: null, truth: [], members: [] };
  for (let s = 0; s < years * 12; s += 1) {
    const tStart = t0 + s, cal = ((Math.round(tStart) % 12) + 12) % 12;
    // Analysis = truth + error; members are drawn around the analysis, so the truth is statistically one of them.
    const ca = [T[s] + initErr * random.normal(), H[s] + initErr * random.normal()];
    const ens = Array.from({ length: members }, () => [ca[0] + initErr * random.normal(), ca[1] + initErr * random.normal()]);
    const traj = ens.map(() => []);
    for (let lead = 0; lead <= maxLead; lead++) {
      const vals = ens.map(e => e[0]); traj.forEach((tr, k) => tr.push(vals[k]));
      const obs = T[s + lead], fm = mean(vals);
      acc[cal][lead].f.push(fm); acc[cal][lead].o.push(obs);
      crpsLead[lead].push(crps(vals, obs)); spreadLead[lead].push(std(vals) ** 2); errLead[lead].push((fm - obs) ** 2);
      if (lead === 6) ranks[rankOf(vals, obs)]++;
      if (lead < maxLead) for (const e of ens) for (let i = 0; i < perMonth; i++) {
        sim.t = tStart + lead + i * sim.dt; sim.y = e.slice(); sim.step(); e[0] = sim.y[0]; e[1] = sim.y[1];
      }
    }
    if (s === years * 6) { plume.start = cal; plume.truth = T.slice(s, s + maxLead + 1); plume.members = traj; }
  }
  const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };
  return {
    acc: acc.map(row => row.map(c => corr(c.f, c.o))),
    crps: crpsLead.map(mean), spread: spreadLead.map(v => Math.sqrt(mean(v))), rmse: errLead.map(v => Math.sqrt(mean(v))),
    ranks, plume, members, maxLead,
  };
}

// Lorenz-63: ensembles started inside an observation-error ball around the truth.
export function l63Ensemble(params, { starts = 60, members = 40, initErr = 0.5, maxLead = 3, every = 20 } = {}) {
  const truth = new Lorenz63(params); truth.twin = false;
  for (let i = 0; i < 4000; i++) truth.step();
  const random = rng(5), f = (t, y) => truth.f(t, y), dt = truth.dt, nLead = Math.round(maxLead / dt / every);
  const spread = Array.from({ length: nLead + 1 }, () => []), err = Array.from({ length: nLead + 1 }, () => []), ranks = new Array(members + 1).fill(0);
  let plume = null;
  for (let s = 0; s < starts; s++) {
    for (let i = 0; i < 400; i++) truth.step();
    let x = truth.y.slice();
    const ca = x.map(v => v + initErr * random.normal());
    let ens = Array.from({ length: members }, () => ca.map(v => v + initErr * random.normal()));
    const pt = [], pm = ens.map(() => []);
    for (let l = 0; l <= nLead; l++) {
      const xs = ens.map(e => e[0]), m = ens[0].map((_, d) => mean(ens.map(e => e[d])));
      spread[l].push(ens.reduce((a, e) => a + e.reduce((b, v, d) => b + (v - m[d]) ** 2, 0), 0) / members);
      err[l].push(m.reduce((a, v, d) => a + (v - x[d]) ** 2, 0));
      if (l === Math.round(nLead / 2)) ranks[rankOf(xs, x[0])]++;
      if (s === 0) { pt.push(x[0]); ens.forEach((e, k) => pm[k].push(e[0])); }
      for (let i = 0; i < every; i++) { x = rk4(f, 0, x, dt); ens = ens.map(e => rk4(f, 0, e, dt)); }
    }
    if (s === 0) plume = { truth: pt, members: pm };
  }
  return { lead: Array.from({ length: nLead + 1 }, (_, l) => l * every * dt), spread: spread.map(v => Math.sqrt(mean(v))), rmse: err.map(v => Math.sqrt(mean(v))), ranks, plume, members };
}
