import { SYSTEMS, advance } from './systems.js';

let sys, id, opts;

// Collects per-step samples so the page can draw smooth trails and Hovmöller rows.
function frame(steps) {
  const trail = [], rows = [], twinRows = [];
  const view = sys.view(opts.field);
  const sample = (s, i) => {
    if (view.kind === 'point') { const v = s.view(); trail.push([v.x, v.y, v.tx, v.ty]); }
    else if (view.kind === 'row' && (s.steps % opts.hovEvery === 0)) { const v = s.view(); rows.push(v.values); twinRows.push(v.twin); }
  };
  const result = steps > 0 ? advance(sys, steps, sample) : { rates: {}, quantity: sys.budget().quantity, elapsed: 0 };
  return { t: sys.t, steps: sys.steps, diag: sys.diagnostics(), result, view: sys.view(opts.field), trail, rows, twinRows };
}

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      id = data.id; opts = { field: data.field, hovEvery: data.hovEvery || 1 };
      sys = new SYSTEMS[data.system](data.params);
    }
    if (!sys) return;
    if (data.type === 'perturb' && sys.perturbTwin) sys.perturbTwin();
    if (data.type === 'view') opts.field = data.field;
    const steps = data.type === 'advance' ? data.steps : 0;
    const out = frame(steps);
    self.postMessage({ type: 'frame', req: data.type, id, ...out });
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error.message });
  }
};
