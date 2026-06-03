import {
  DEFAULT_UNIFORM_MARK_COLOR,
  INACTIVE_ELECTRODE_COLOR,
} from '../constants/brain.js';
import {
  regionDisplayColor,
  regionPhasesOn,
} from '../constants/colors.js';
import { electrodeExclusiveRegionId } from './vennRegions.js';

// One-way (sequential): slate -> amber -> red, 0-truncated on |value|.
const HGA_STOPS_ONE = [
  [0.0, [148, 163, 184]], // slate-400
  [0.5, [250, 204, 21]], // amber-400
  [1.0, [220, 38, 38]], // red-600
];
// Two-way (diverging): blue -> near-white -> red over a symmetric ±absMax range.
const HGA_STOPS_TWO = [
  [0.0, [37, 99, 235]], // blue-600
  [0.5, [241, 245, 249]], // slate-100
  [1.0, [220, 38, 38]], // red-600
];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function sampleStops(stops, t) {
  const clamped = Math.max(0, Math.min(1, t));
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (clamped >= stops[i][0] && clamped <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const local = (clamped - lo[0]) / span;
  return [0, 1, 2].map((k) => lerp(lo[1][k], hi[1][k], local));
}

// Normalize a (possibly signed) HGA value to [0,1] for the active color direction.
//  one: |value| / absMax  (0-truncated)
//  two: (value/absMax + 1) / 2  (diverging, ±absMax)
function normalizeHga(value, scale, direction) {
  const absMax = scale?.absMax ?? scale?.vmax ?? 1;
  if (!absMax) return 0;
  if (direction === 'two') {
    return Math.max(0, Math.min(1, (value / absMax + 1) / 2));
  }
  return Math.max(0, Math.min(1, Math.abs(value) / absMax));
}

export function hgaColor(value, scale, direction = 'one') {
  if (value == null || !(scale?.absMax ?? scale?.vmax)) return INACTIVE_ELECTRODE_COLOR;
  const stops = direction === 'two' ? HGA_STOPS_TWO : HGA_STOPS_ONE;
  const [r, g, b] = sampleStops(stops, normalizeHga(value, scale, direction));
  return `rgb(${r}, ${g}, ${b})`;
}

/** CSS gradient (low -> high, bottom -> top) matching the HGA colormap for a direction. */
export function hgaCssGradient(direction = 'one') {
  const stops = direction === 'two' ? HGA_STOPS_TWO : HGA_STOPS_ONE;
  const css = stops.map(([t, [r, g, b]]) => `rgb(${r}, ${g}, ${b}) ${Math.round(t * 100)}%`);
  return `linear-gradient(to top, ${css.join(', ')})`;
}

// Resolve an electrode's brain color.
//  - colorMode 'hga': HGA colormap (uses electrode.hga_mean_all + hgaScale + colorDirection)
//  - colorMode 'region' (default): phase/condition-overlap region color when selected, else
//    uniform mark / inactive (the legacy colorByFunctional behavior).
export function resolveBrainElectrodeColor({
  electrode,
  vennPhases,
  selected,
  colorByFunctional,
  colorMode = 'region',
  hgaScale = null,
  colorDirection = 'one',
}) {
  if (colorMode === 'hga') {
    return hgaColor(electrode.hga_mean_all, hgaScale, colorDirection);
  }
  if (!colorByFunctional) {
    return DEFAULT_UNIFORM_MARK_COLOR;
  }
  const regionId = electrodeExclusiveRegionId(electrode, vennPhases);
  if (selected && regionId) {
    return regionDisplayColor(regionPhasesOn(regionId));
  }
  return INACTIVE_ELECTRODE_COLOR;
}
