import { HGA_RADIUS_MIN, HGA_RADIUS_MAX } from '../constants/brain.js';

export function loadKey(selectedLoad) {
  return selectedLoad === 'all' ? null : `load${selectedLoad}`;
}

export function resolveHgaMean(electrode, selectedLoad) {
  if (selectedLoad === 'all') {
    return electrode.hga_mean_all;
  }
  const key = loadKey(selectedLoad);
  const loadValue = electrode.hga_by_load?.[key];
  if (loadValue == null) {
    return electrode.hga_mean_all;
  }
  return loadValue;
}

export function hgaToRadius(hga, scale, { active, selected, hovered }) {
  if (hga == null || !scale?.vmax) {
    return active ? 2.4 : selected ? 1.8 : hovered ? 1.5 : 1.0;
  }
  const vmin = scale.vmin ?? 0;
  const vmax = scale.vmax ?? 1;
  const normalized = vmax > vmin
    ? Math.max(0, Math.min(1, (Math.abs(hga) - vmin) / (vmax - vmin)))
    : 0;
  const base = HGA_RADIUS_MIN + normalized * (HGA_RADIUS_MAX - HGA_RADIUS_MIN);
  if (active) return base + 0.6;
  if (selected) return base + 0.35;
  if (hovered) return base + 0.25;
  return base;
}
