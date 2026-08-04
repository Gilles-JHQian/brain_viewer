// GLM (rERP) predictor taxonomy.
//
// The data files are keyed by raw predictor name (Stim, uplex, ...); the viewer exposes
// them through two orthogonal dimensions instead of one flat Predictor dropdown:
//   (a) type  — the predictor family (average evoked response vs. lexicality contrast)
//   (b) phase — the event-locked window within that family
// A (type, phase) pair maps to exactly one predictor / data file. Predictors that are not
// listed here (e.g. Resperr, stimdur, uplogfreq) are intentionally hidden from the UI.
export const GLM_TYPES = [
  {
    key: 'average',
    label: 'Average response',
    // Chronological: onset -> uniqueness point -> offset -> response.
    phases: [
      { predictor: 'Stim', label: 'Onset' },
      { predictor: 'UP', label: 'Uniqueness point' },
      { predictor: 'Offset', label: 'Offset' },
      { predictor: 'Resp', label: 'Response' },
    ],
  },
  {
    key: 'lexicality',
    label: 'Lexicality',
    phases: [
      { predictor: 'uplex', label: 'UP' },
      { predictor: 'offlex', label: 'Delay' },
    ],
  },
];

const TYPE_BY_KEY = Object.fromEntries(GLM_TYPES.map((type) => [type.key, type]));

const PHASE_LABEL_BY_PREDICTOR = {};
GLM_TYPES.forEach((type) => type.phases.forEach((phase) => {
  PHASE_LABEL_BY_PREDICTOR[phase.predictor] = phase.label;
}));

// Ordered predictor keys of a type that actually exist in the manifest's rerp_predictors.
export function glmTypePredictors(metadata, typeKey) {
  const available = new Set(metadata?.rerp_predictors ?? []);
  const type = TYPE_BY_KEY[typeKey] ?? GLM_TYPES[0];
  return type.phases.map((phase) => phase.predictor).filter((predictor) => available.has(predictor));
}

// Type keys that have at least one available predictor in this dataset.
export function glmAvailableTypes(metadata) {
  return GLM_TYPES.filter((type) => glmTypePredictors(metadata, type.key).length > 0).map((type) => type.key);
}

export function glmTypeLabel(typeKey) {
  return TYPE_BY_KEY[typeKey]?.label ?? typeKey;
}

export function glmDefaultType(metadata) {
  return glmAvailableTypes(metadata)[0] ?? GLM_TYPES[0].key;
}

// predictor key -> its GLM phase label (Onset, Uniqueness point, ... / UP, Delay), for the
// subset of predictors present in this dataset.
export function glmPhaseLabels(metadata) {
  const available = new Set(metadata?.rerp_predictors ?? []);
  return Object.fromEntries(
    Object.entries(PHASE_LABEL_BY_PREDICTOR).filter(([predictor]) => available.has(predictor)),
  );
}
