import {
  DEFAULT_UNIFORM_MARK_COLOR,
  INACTIVE_ELECTRODE_COLOR,
} from '../constants/brain.js';
import {
  regionDisplayColor,
  regionPhasesOn,
} from '../constants/colors.js';
import { electrodeExclusiveRegionId } from './vennRegions.js';

// Sequential HGA colormap (low -> high): cool slate to amber to warm red.
const HGA_STOPS = [
  [0.0, [148, 163, 184]], // slate-400
  [0.5, [250, 204, 21]], // amber-400
  [1.0, [220, 38, 38]], // red-600
];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

export function hgaColor(value, scale) {
  if (value == null || !scale?.vmax) return INACTIVE_ELECTRODE_COLOR;
  const vmin = scale.vmin ?? 0;
  const vmax = scale.vmax ?? 1;
  const t = vmax > vmin ? Math.max(0, Math.min(1, (Math.abs(value) - vmin) / (vmax - vmin))) : 0;
  let lo = HGA_STOPS[0];
  let hi = HGA_STOPS[HGA_STOPS.length - 1];
  for (let i = 0; i < HGA_STOPS.length - 1; i += 1) {
    if (t >= HGA_STOPS[i][0] && t <= HGA_STOPS[i + 1][0]) {
      lo = HGA_STOPS[i];
      hi = HGA_STOPS[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const local = (t - lo[0]) / span;
  const [r, g, b] = [0, 1, 2].map((k) => lerp(lo[1][k], hi[1][k], local));
  return `rgb(${r}, ${g}, ${b})`;
}

// Resolve an electrode's brain color.
//  - colorMode 'hga': sequential HGA colormap (uses electrode.hga_mean_all + hgaScale)
//  - colorMode 'region' (default): phase-overlap region color when selected, else
//    uniform mark / inactive (the legacy colorByFunctional behavior).
export function resolveBrainElectrodeColor({
  electrode,
  vennPhases,
  selected,
  colorByFunctional,
  colorMode = 'region',
  hgaScale = null,
}) {
  if (colorMode === 'hga') {
    return hgaColor(electrode.hga_mean_all, hgaScale);
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
