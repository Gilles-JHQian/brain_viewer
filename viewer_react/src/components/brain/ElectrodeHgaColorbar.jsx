import React from 'react';
import { hgaCssGradient } from '../../utils/electrodeColors.js';

const HGA_GRADIENT = hgaCssGradient();

// Legend for HGA-value electrode coloring (electrodes view, HGA color mode).
export default function ElectrodeHgaColorbar({ scale }) {
  const vmax = scale?.vmax;
  return (
    <div className="kde-colorbar">
      <span className="kde-colorbar-title">HGA (electrodes)</span>
      <div className="kde-colorbar-body kde-colorbar-body-minimal">
        <span className="kde-colorbar-tick">{vmax ? vmax.toFixed(2) : '—'}</span>
        <div className="kde-colorbar-track" style={{ background: HGA_GRADIENT }} />
        <span className="kde-colorbar-tick">0</span>
      </div>
    </div>
  );
}
