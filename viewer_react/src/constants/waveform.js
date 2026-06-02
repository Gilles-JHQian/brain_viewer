export const WAVEFORM_Y_MIN = -0.1;
export const WAVEFORM_Y_MAX = 0.9;

/** Shared y-axis for all phase panels. */
export function resolveWaveformYRange() {
  return [WAVEFORM_Y_MIN, WAVEFORM_Y_MAX];
}
