export const PHASES = ['encoding', 'maintenance', 'probe', 'response'];

export const PHASE_LABELS = {
  encoding: 'Encoding',
  maintenance: 'Maintenance',
  probe: 'Probe',
  response: 'Response',
};

export const DEFAULT_VENN_PHASES = ['encoding', 'maintenance', 'probe'];

export const PHASE_TIME_START = {
  encoding: -1,
  maintenance: -1,
  probe: -1,
  response: -1,
};

export const phaseTimeStart = (phase) => PHASE_TIME_START[phase] ?? -1;

export const PHASE_WIDTH_RATIOS = {
  encoding: 10,
  maintenance: 5,
  probe: 4,
  response: 3,
};
