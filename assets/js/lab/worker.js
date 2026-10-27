import { SYSTEMS } from './systems.js';
import { advance } from './core.js';
import { ensoHindcast, l63Ensemble } from './experiments.js';

let sys, id, opts;

// Per-step hook: diagnostics samples at a fixed model-time interval, trail points, Hovmöller rows, scatter pairs.
function frame(steps) {
  const out = { trail: [], rows: [], twinRows: [], samples: [], pairs: [] };
  const kind = sys.view(opts.field).kind;
  const hook = s => {
    if (kind === 'point') { const v = s.view(); out.trail.push([v.x, v.y, v.tx, v.ty]); }
    // Samples are taken on a fixed model-time grid so spectra stay meaningful with adaptive time steps.
    if (opts.sampleDt && s.t >= opts.nextSample - 1e-9) { const d = s.diagnostics(); out.samples.push([s.t, ...opts.keys.map(k => d[k])]); opts.nextSample += opts.sampleDt * Math.max(1, Math.floor((s.t - opts.nextSample) / opts.sampleDt) + 1); }
    if ((kind === 'row' || opts.extras.includes('hovrow')) && opts.hovEvery && s.steps % opts.hovEvery === 0) {
      const v = s.view(opts.field); out.rows.push(v.row ?? v.values); if (v.twin) out.twinRows.push(v.twin);
      if (v.pairs && out.pairs.length < 400) for (let k = 0; k < v.pairs[0].length; k++) out.pairs.push([v.pairs[0][k], v.pairs[1][k]]);
    }
  };
  const result = steps > 0 ? advance(sys, steps, hook) : { rates: {}, quantity: sys.budget().quantity, elapsed: 0 };
  out.view = sys.view(opts.field);
  if (opts.extras?.includes('spectrum') && sys.spectrum) out.spectrum = sys.spectrum();
  if (opts.extras?.includes('section') && sys.section) out.section = sys.section(opts.sectionY ?? 0.25);
  return { t: sys.t, steps: sys.steps, diag: sys.diagnostics(), result, ...out };
}

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'experiment') {
      const fn = { enso: ensoHindcast, l63: l63Ensemble }[data.name];
      self.postMessage({ type: 'experiment', id: data.id, name: data.name, result: fn(data.params, data.options) });
      return;
    }
    if (data.type === 'init') {
      id = data.id;
      opts = { field: data.field, hovEvery: data.hovEvery || 1, sampleDt: data.sampleDt || 0, nextSample: 0, keys: data.keys || [], extras: data.extras || [], sectionY: data.sectionY };
      sys = new SYSTEMS[data.engine](data.params);
    }
    if (!sys) return;
    if (data.type === 'perturb' && sys.perturbTwin) sys.perturbTwin();
    if (data.type === 'particles' && sys.resetParticles) sys.resetParticles();
    if (data.type === 'view') { opts.field = data.field; if (data.sectionY !== undefined) opts.sectionY = data.sectionY; }
    const steps = data.type === 'advance' ? data.steps : 0;
    self.postMessage({ type: 'frame', req: data.type, id, ...frame(steps) });
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error.message });
  }
};
