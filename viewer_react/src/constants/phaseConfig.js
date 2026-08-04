import {
  PHASES,
  PHASE_LABELS,
  PHASE_WIDTH_RATIOS,
  DEFAULT_VENN_PHASES,
  PHASE_TIME_START,
} from './phases.js';
import { PHASE_TIME_RANGES } from './loads.js';
import { VENN_MAX_PHASES } from './venn.js';
import { glmTypePredictors, glmPhaseLabels } from './glm.js';

function titleCase(value) {
  const s = String(value);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Mutate exported arrays/objects IN PLACE so existing live `import` bindings (and any
// captured references) see the new values without a module reload.
function replaceArray(target, next) {
  target.splice(0, target.length, ...next);
}

function replaceObject(target, next) {
  Object.keys(target).forEach((key) => { delete target[key]; });
  Object.assign(target, next);
}

// Compute the Venn-axis "member" configuration from manifest metadata.
//   axis='phase'     -> members = phases,     per-phase time windows
//   axis='condition' -> members = conditions, all sharing the fixed phase's time window
// The members become the columns of the Venn AND the bottom waveform strip.
export function vennAxisConfig(metadata, axis, fixedPhase, spec = null) {
  const ranges = metadata?.phase_time_ranges || {};
  // GLM: the Venn is over the three tasks (conditions), all sharing the fixed phase's
  // (predictor's) event-locked window. A phase-axis fallback keeps the predictor members
  // for completeness.
  if (spec?.datatype === 'rerp') {
    const rerpRanges = metadata?.rerp_time_ranges || {};
    if (spec.axis === 'condition') {
      const members = metadata?.conditions || [];
      const range = rerpRanges[spec.fixedPhase] || { min: -1, max: 2 };
      return {
        axis: 'condition',
        members,
        labels: Object.fromEntries(members.map((m) => [m, m])),
        timeRanges: Object.fromEntries(members.map((m) => [m, range])),
      };
    }
    const members = glmTypePredictors(metadata, spec.rerpType);
    const phaseLabels = glmPhaseLabels(metadata);
    return {
      axis: 'phase',
      members,
      labels: Object.fromEntries(members.map((m) => [m, phaseLabels[m] ?? m])),
      timeRanges: Object.fromEntries(members.map((m) => [m, rerpRanges[m] ?? { min: -1, max: 2 }])),
    };
  }
  if (axis === 'condition') {
    const members = metadata?.conditions || [];
    const range = ranges[fixedPhase] || { min: -1, max: 2 };
    return {
      axis,
      members,
      labels: Object.fromEntries(members.map((m) => [m, m])),
      timeRanges: Object.fromEntries(members.map((m) => [m, range])),
    };
  }
  const members = metadata?.phases || [];
  return {
    axis: 'phase',
    members,
    labels: Object.fromEntries(members.map((m) => [m, metadata?.phase_labels?.[m] ?? titleCase(m)])),
    timeRanges: Object.fromEntries(members.map((m) => [m, ranges[m] ?? { min: -1, max: 2 }])),
  };
}

// Apply a venn-axis config in place (same mechanism as applyPhaseConfig). After this the
// global PHASES/PHASE_LABELS/PHASE_TIME_RANGES/DEFAULT_VENN_PHASES describe the axis members,
// so the Venn, waveform strip and animation all render over phases or conditions uniformly.
export function applyVennAxisConfig({ members, labels, timeRanges }) {
  if (!Array.isArray(members) || !members.length) return;
  replaceArray(PHASES, members);
  replaceObject(PHASE_LABELS, Object.fromEntries(members.map((m) => [m, labels?.[m] ?? titleCase(m)])));
  replaceObject(PHASE_WIDTH_RATIOS, Object.fromEntries(members.map((m) => [m, 1])));
  replaceObject(PHASE_TIME_RANGES, Object.fromEntries(members.map((m) => [m, timeRanges?.[m] ?? { min: -1, max: 2 }])));
  replaceObject(PHASE_TIME_START, Object.fromEntries(members.map((m) => [m, timeRanges?.[m]?.min ?? -1])));
  replaceArray(DEFAULT_VENN_PHASES, members.slice(0, Math.min(members.length, VENN_MAX_PHASES)));
}

// Overwrite the module-scope phase configuration from a loaded manifest's metadata.
// Safe to call before the dashboard renders (during bootstrap). No-op if metadata is
// missing or carries no phase list — the static fallbacks in phases.js stay in effect.
export function applyPhaseConfig(metadata) {
  const phases = metadata?.phases;
  if (!Array.isArray(phases) || phases.length === 0) return;

  replaceArray(PHASES, phases);

  const labels = metadata?.phase_labels || {};
  replaceObject(
    PHASE_LABELS,
    Object.fromEntries(phases.map((p) => [p, labels[p] ?? titleCase(p)])),
  );

  const widthRatios = metadata?.phase_width_ratios || {};
  replaceObject(
    PHASE_WIDTH_RATIOS,
    Object.fromEntries(phases.map((p) => [p, widthRatios[p] ?? 1])),
  );

  const ranges = metadata?.phase_time_ranges || {};
  replaceObject(
    PHASE_TIME_RANGES,
    Object.fromEntries(phases.map((p) => [p, ranges[p] ?? { min: -1, max: 2 }])),
  );
  replaceObject(
    PHASE_TIME_START,
    Object.fromEntries(phases.map((p) => [p, ranges[p]?.min ?? -1])),
  );

  // Default Venn selection: explicit manifest list (filtered to known phases) if given,
  // else the first up-to-3 phases, capped at the Venn's max circle count.
  const explicit = Array.isArray(metadata?.default_venn_phases)
    ? metadata.default_venn_phases.filter((p) => phases.includes(p))
    : [];
  const defaultCount = Math.min(phases.length, Math.min(3, VENN_MAX_PHASES));
  const defaults = explicit.length >= 2
    ? explicit.slice(0, VENN_MAX_PHASES)
    : phases.slice(0, defaultCount);
  replaceArray(DEFAULT_VENN_PHASES, defaults);
}
