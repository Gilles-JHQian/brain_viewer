import React, { useEffect, useRef, useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { defaultPhaseBounds } from '../../constants/phases.js';

function NumberField({ label, hint, value, onChange, step, min }) {
  return (
    <label className="settings-field">
      <span className="settings-field-label">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <span className="settings-field-hint">{hint}</span>}
    </label>
  );
}

// Gear button + popover for analysis parameters: animation sliding-window length and the
// KDE Gaussian bandwidth + cutoff distance.
export default function SettingsPanel({
  windowSec, onWindowSec,
  kdeBandwidth, onKdeBandwidth,
  kdeMaxDistance, onKdeMaxDistance,
  sigWindowOnly, onSigWindowOnly,
  phases = [], phaseBounds = {}, onPhaseBound,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="settings-panel" ref={ref}>
      <button
        type="button"
        className="tour-replay-btn"
        onClick={() => setOpen((value) => !value)}
        title="Analysis settings"
      >
        <SettingsIcon size={14} />
        Settings
      </button>
      {open && (
        <div className="settings-popover">
          <div className="settings-section-title">Animation</div>
          <NumberField
            label="Sliding window (s)"
            hint="HGA averaged over this causal window per frame"
            value={windowSec}
            onChange={onWindowSec}
            step={0.02}
            min={0.02}
          />
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={!!sigWindowOnly}
              onChange={(event) => onSigWindowOnly?.(event.target.checked)}
            />
            <span>Show only electrodes significant in the current window</span>
          </label>
          <div className="settings-section-title">KDE projection</div>
          <NumberField
            label="Gaussian bandwidth (mm)"
            hint="σ of the surface density kernel"
            value={kdeBandwidth}
            onChange={onKdeBandwidth}
            step={1}
            min={1}
          />
          <NumberField
            label="Cutoff distance (mm)"
            hint="vertices beyond this from every electrode are 0"
            value={kdeMaxDistance}
            onChange={onKdeMaxDistance}
            step={1}
            min={1}
          />
          {phases.length > 0 && (
            <>
              <div className="settings-section-title">Time-course bounds (s)</div>
              {phases.map((phase) => {
                const bounds = phaseBounds[phase] ?? defaultPhaseBounds(phase);
                return (
                  <div className="settings-bounds-row" key={phase}>
                    <span className="settings-bounds-label">{phase}</span>
                    <input
                      type="number"
                      step="0.05"
                      value={bounds.min}
                      onChange={(event) => onPhaseBound?.(phase, 'min', event.target.value)}
                    />
                    <span className="settings-bounds-dash">–</span>
                    <input
                      type="number"
                      step="0.05"
                      value={bounds.max}
                      onChange={(event) => onPhaseBound?.(phase, 'max', event.target.value)}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
