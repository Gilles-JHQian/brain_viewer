import React from 'react';
import { hgaCssGradient } from '../../utils/electrodeColors.js';

// Legend for HGA-value electrode coloring (electrodes view, HGA color mode).
export default function ElectrodeHgaColorbar({ scale, direction = 'one' }) {
  const absMax = scale?.absMax ?? scale?.vmax;
  const gradient = hgaCssGradient(direction);
  const topTick = absMax ? absMax.toFixed(2) : '—';
  const bottomTick = direction === 'two' ? (absMax ? `-${absMax.toFixed(2)}` : '—') : '0';
  return (
    <div className="kde-colorbar">
      <span className="kde-colorbar-title">HGA (electrodes)</span>
      <div className="kde-colorbar-body kde-colorbar-body-minimal">
        <span className="kde-colorbar-tick">{topTick}</span>
        <div className="kde-colorbar-track" style={{ background: gradient }} />
        <span className="kde-colorbar-tick">{bottomTick}</span>
      </div>
    </div>
  );
}
