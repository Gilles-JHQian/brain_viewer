export const ROI_COLORS = {
  STG: '#20b2aa',
  STS: '#2f80ed',
  SFG: '#9b51e0',
  MFG: '#bb6bd9',
  OFC: '#f2994a',
  AIC: '#eb5757',
  PIC: '#2d9cdb',
  Hipp: '#27ae60',
  SMC: '#f2c94c',
};

export const INTERSECTION_COLOR = '#1e293b';

// Colors for Venn/waveform "members" — covers both phases and conditions so the
// distinction holds whichever axis the Venn is on.
const MEMBER_COLORS = {
  // phases (brain_viewer)
  Cue: '#a855f7',
  Stimulus: '#ef4444',
  Delay: '#3b82f6',
  Response: '#10b981',
  // conditions (task modalities)
  Decision: '#ef4444',
  Passive: '#3b82f6',
  Repeat: '#f59e0b',
  // legacy Sternberg phases (lowercase)
  encoding: '#ef4444',
  maintenance: '#3b82f6',
  probe: '#f59e0b',
  response: '#10b981',
};

export function phaseColor(member) {
  return MEMBER_COLORS[member] || '#94a3b8';
}

export function electrodeColor(electrode) {
  return ROI_COLORS[electrode.roi] || '#8b9bb4';
}

export function regionPhasesOn(regionId) {
  return regionId.split('_');
}

export function regionDisplayColor(phasesOn) {
  return phasesOn.length === 1 ? phaseColor(phasesOn[0]) : INTERSECTION_COLOR;
}

export function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function regionHitStyle(phasesOn, selected, dimUnselected = false) {
  const base = regionDisplayColor(phasesOn);
  if (dimUnselected && !selected) {
    return {
      fill: 'rgba(148, 163, 184, 0.05)',
      stroke: 'rgba(148, 163, 184, 0.2)',
      strokeWidth: 1,
    };
  }
  return {
    fill: hexToRgba(base, selected ? 0.68 : 0.24),
    stroke: selected ? '#0f172a' : base,
    strokeWidth: selected ? 4 : 2.5,
  };
}
