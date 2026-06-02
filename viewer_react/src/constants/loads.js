// NOTE: brain_viewer has no Sternberg-style "load" dimension. LOAD_OPTIONS is retained
// only so the legacy top-bar chip keeps compiling; it is repurposed into the orthogonal
// variant selectors (reference/datatype/condition) in a later slice. The Sternberg
// load-cutoff trace windowing (ENCODING_LOAD_CUTOFFS / PHASE_TIME_END) has been removed —
// per-phase display windows now come from the data/manifest via applyPhaseConfig.
export const LOAD_OPTIONS = ['all'];

// Per-phase display window {min, max} in seconds. These defaults are placeholders;
// applyPhaseConfig() (see ./phaseConfig.js) overwrites this object IN PLACE from
// manifest.metadata.phase_time_ranges (ultimately each phase file's own `times`).
export const PHASE_TIME_RANGES = {
  stimulus: { min: -1, max: 2 },
  delay: { min: -1, max: 3.5 },
  response: { min: -1, max: 2 },
};
