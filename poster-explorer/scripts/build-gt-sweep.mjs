// Reproduce an illustrative single-node GT parameter sweep for the web page.
// Equations and numerical settings follow single/CODE/paper_epileptor_core.py
// and single/CODE/strict_single_node_scdt.py in the source research release.
// This sweep uses common seeded noise at every x0 to make the slider easier to
// compare. It is separate from the locked 30-member survival experiment.
import fs from 'node:fs';
import path from 'node:path';

const X0_VALUES = [-2.24, -2.20, -2.16, -2.12, -2.10, -2.08, -2.07, -2.06, -2.05, -2.04, -2.03, -2.02, -2.00, -1.98];
const BASE_X0 = -2.18;
const WARMUP_SECONDS = 20;
const ROLLOUT_SECONDS = 140;
const HZ = 256;
const OUTPUT_STRIDE = 16;
const DT = 0.04;
const NOISE_SCALE = Math.sqrt(0.0025 * DT);
const SEED = 20261030;

function random(seed) {
  let state = seed >>> 0;
  let spare = null;
  return () => {
    if (spare !== null) {
      const result = spare;
      spare = null;
      return result;
    }
    const next = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const radius = Math.sqrt(-2 * Math.log(Math.max(next(), Number.EPSILON)));
    const angle = 2 * Math.PI * next();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

function rhs(s, x0) {
  const [x1, y1, z, x2, y2, lowpass] = s;
  const f1 = x1 < 0 ? x1 ** 3 - 3 * x1 ** 2 : (x2 - 0.6 * (z - 4) ** 2) * x1;
  const f2 = x2 < -0.25 ? 0 : 6 * (x2 + 0.25);
  return [
    y1 - f1 - z + 3.1,
    1 - 5 * x1 ** 2 - y1,
    (4 * (x1 - x0) - z) / 2857,
    -y2 + x2 - x2 ** 3 + 0.45 + 0.002 * lowpass - 0.3 * (z - 3.5),
    (-y2 + f2) / 10,
    x1 - 0.01 * lowpass,
  ];
}

function step(s, x0, normal) {
  const drift = rhs(s, x0);
  const noiseX2 = NOISE_SCALE * normal();
  const noiseY2 = NOISE_SCALE * normal();
  const predictor = s.map((value, i) => value + DT * drift[i] + (i === 3 ? noiseX2 : i === 4 ? noiseY2 : 0));
  const corrected = rhs(predictor, x0);
  return s.map((value, i) => value + 0.5 * DT * (drift[i] + corrected[i]) + (i === 3 ? noiseX2 : i === 4 ? noiseY2 : 0));
}

function simulate(targetX0) {
  const normal = random(SEED);
  const base = [-1.55, -11.8, 3.05, -0.82, 0, 0];
  const scale = [0.03, 0.20, 0.04, 0.02, 0.02, 0.03];
  let state = base.map((value, i) => value + scale[i] * normal());
  for (let i = 0; i < WARMUP_SECONDS * HZ; i++) state = step(state, BASE_X0, normal);

  const samples = [[0, Number((state[3] - state[0]).toFixed(4))]];
  let onset = null;
  let lastCrossing = null;
  for (let i = 1; i <= ROLLOUT_SECONDS * HZ; i++) {
    state = step(state, targetX0, normal);
    const signal = state[3] - state[0];
    if (!Number.isFinite(signal)) throw new Error(`Non-finite GT trajectory at x0=${targetX0}`);
    const time = i / HZ;
    if (time >= 5 && signal <= -0.5) {
      if (onset === null) onset = time;
      lastCrossing = time;
    }
    if (i % OUTPUT_STRIDE === 0) samples.push([Number(time.toFixed(4)), Number(signal.toFixed(4))]);
  }
  return {
    x0: targetX0,
    onset: onset === null ? null : Number(onset.toFixed(3)),
    offset: lastCrossing === null ? null : Number(Math.min(ROLLOUT_SECONDS, lastCrossing + 1).toFixed(3)),
    samples,
  };
}

const data = {
  metadata: {
    model: 'single-node Proix-2017 Epileptor GT',
    source: 'Digital_Twin_for_Seizure_Prediction-main/single/CODE/paper_epileptor_core.py',
    purpose: 'illustrative parameter sweep; separate from the locked survival counts',
    baseX0: BASE_X0,
    warmupSeconds: WARMUP_SECONDS,
    rolloutSeconds: ROLLOUT_SECONDS,
    integrationDt: DT,
    samplingHz: HZ,
    displayHz: HZ / OUTPUT_STRIDE,
    noiseVariance: 0.0025,
    seed: SEED,
    departureRule: 'first x2-x1 <= -0.5 after 5 seconds; visual guide only',
    colorInterval: 'from first crossing through one second after the last crossing',
  },
  traces: X0_VALUES.map(simulate),
};
const output = path.join(import.meta.dirname, '..', 'data', 'gt-parameter-trajectories.json');
fs.writeFileSync(output, JSON.stringify(data));
console.log(data.traces.map(trace => `${trace.x0.toFixed(2)}: ${trace.onset ?? 'normal'}`).join('\n'));
console.log(output);
