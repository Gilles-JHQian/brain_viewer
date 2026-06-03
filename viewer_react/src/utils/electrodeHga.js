// Derive a per-electrode HGA magnitude for the active variant from its loaded traces,
// so electrodes can be sized/colored by activation (Sternberg sizes by hga_mean_all) and
// the KDE projection has source weights. brain_viewer's adapted electrodes carry no HGA
// scalar of their own, so we summarize each electrode's post-onset response.

// Mean of |value| over the post-onset window (t >= 0) of a single {time,value} trace.
function postOnsetMagnitude(trace) {
  const t = trace?.time;
  const v = trace?.value;
  if (!t?.length || !v?.length) return null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < t.length; i += 1) {
    if (t[i] >= 0 && Number.isFinite(v[i])) {
      sum += Math.abs(v[i]);
      n += 1;
    }
  }
  return n ? sum / n : null;
}

function percentile(sorted, p) {
  if (!sorted.length) return 1;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

// Returns { hgaById: Map<id, number|null>, scale: {vmin, vmax, method} }.
// Per electrode we take the peak post-onset magnitude across phases.
export function computeElectrodeHga(electrodes, traces, phases) {
  const hgaById = new Map();
  const values = [];
  electrodes.forEach((electrode) => {
    const byPhase = traces[electrode.id];
    let best = null;
    if (byPhase) {
      phases.forEach((phase) => {
        const mag = postOnsetMagnitude(byPhase[phase]?.all);
        if (mag != null && (best == null || mag > best)) best = mag;
      });
    }
    hgaById.set(electrode.id, best);
    if (best != null) values.push(best);
  });
  values.sort((a, b) => a - b);
  const vmax = percentile(values, 0.95) || 1;
  return { hgaById, scale: { vmin: 0, vmax, method: 'p95_postonset_abs' } };
}

export function attachElectrodeHga(electrodes, traces, phases) {
  const { hgaById, scale } = computeElectrodeHga(electrodes, traces, phases);
  const withHga = electrodes.map((electrode) => ({
    ...electrode,
    hga_mean_all: hgaById.get(electrode.id) ?? null,
  }));
  return { electrodes: withHga, hgaScale: scale };
}
