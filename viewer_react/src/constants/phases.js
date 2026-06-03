// Default / fallback phase configuration.
//
// The live phase list is CONFIG-DRIVEN: applyPhaseConfig() (see ./phaseConfig.js)
// rewrites these exports IN PLACE from manifest.metadata.phases at bootstrap, so every
// live `import { PHASES }` binding reflects the dataset's actual phases. The values
// below are only the fallback used before a manifest loads (or if it omits phases).
//
// brain_viewer default = stimulus / delay / response. Adding a phase (e.g. Cue) is a
// pipeline/manifest change — no code edit needed here.
export const PHASES = ['stimulus', 'delay', 'response'];

export const PHASE_LABELS = {
  stimulus: 'Stimulus',
  delay: 'Delay',
  response: 'Response',
};

export const DEFAULT_VENN_PHASES = ['stimulus', 'delay', 'response'];

// Per-phase start time (seconds). Overridden from data/manifest by applyPhaseConfig.
export const PHASE_TIME_START = {};

export const phaseTimeStart = (phase) => PHASE_TIME_START[phase] ?? -1;

// Relative column widths for the bottom waveform strip. Defaults to even; a manifest
// may supply metadata.phase_width_ratios to weight phases by duration.
export const PHASE_WIDTH_RATIOS = {
  stimulus: 1,
  delay: 1,
  response: 1,
};

// Default x-axis (time) bounds for the bottom time-course panel, per phase. Editable in the
// settings panel. Phases not listed fall back to FALLBACK_PHASE_BOUNDS.
export const DEFAULT_PHASE_BOUNDS = {
  Stimulus: { min: -0.2, max: 0.75 },
  Delay: { min: -0.5, max: 0.5 },
  Response: { min: -0.5, max: 0.5 },
};

export const FALLBACK_PHASE_BOUNDS = { min: -0.5, max: 0.5 };

export function defaultPhaseBounds(phase) {
  return DEFAULT_PHASE_BOUNDS[phase] ?? FALLBACK_PHASE_BOUNDS;
}
