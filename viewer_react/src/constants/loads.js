import { PHASES, phaseTimeStart } from './phases.js';

export const LOAD_OPTIONS = ['3', '5', '7', '9', 'all'];

export const ENCODING_LOAD_CUTOFFS = {
  load3: 2.8,
  load5: 4.6,
  load7: 6.7,
  load9: 8.7,
};

export const PHASE_TIME_END = {
  encoding: Math.max(...Object.values(ENCODING_LOAD_CUTOFFS)),
  maintenance: 3.5,
  probe: 2.0,
  response: 2.0,
};

export const PHASE_TIME_RANGES = Object.fromEntries(
  PHASES.map((phase) => [phase, { min: phaseTimeStart(phase), max: PHASE_TIME_END[phase] }]),
);
