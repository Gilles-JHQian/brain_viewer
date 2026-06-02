import React from 'react';
import { vlagPositiveCssGradient } from '../../brainKde.js';

const KDE_COLORBAR_GRADIENT = vlagPositiveCssGradient();

export default function KdeColorbar({ range }) {
  if (!range?.hasData) {
    return (
      <div className="kde-colorbar kde-colorbar-empty">
        <span className="kde-colorbar-title">HGA density</span>
        <span className="kde-colorbar-empty-text">No KDE data</span>
      </div>
    );
  }
  return (
    <div className="kde-colorbar">
      <span className="kde-colorbar-title">HGA density</span>
      <div className="kde-colorbar-body kde-colorbar-body-minimal">
        <span className="kde-colorbar-tick">{range.vmax.toFixed(2)}</span>
        <div className="kde-colorbar-track" style={{ background: KDE_COLORBAR_GRADIENT }} />
      </div>
    </div>
  );
}
