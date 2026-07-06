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
  showReferenceSelector, onShowReferenceSelector,
  showVennOverSelector, onShowVennOverSelector,
  colorDirection, onColorDirection,
  brainOpacity, onBrainOpacity,
  electrodeSizeScale, onElectrodeSizeScale,
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
          <div className="settings-section-title">Selector panels</div>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={showReferenceSelector !== false}
              onChange={(event) => onShowReferenceSelector?.(event.target.checked)}
            />
            <span>Show the Reference selector</span>
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={showVennOverSelector !== false}
              onChange={(event) => onShowVennOverSelector?.(event.target.checked)}
            />
            <span>Show the Venn-over (phase/condition) selector</span>
          </label>
          <div className="settings-section-title">Brain map</div>
          <div className="settings-segment">
            <span className="settings-segment-label">HGA colormap</span>
            <div className="settings-segment-buttons">
              <button
                type="button"
                className={colorDirection === 'one' ? 'active' : ''}
                onClick={() => onColorDirection?.('one')}
                title="One-way: 0 to max"
              >
                1-way
              </button>
              <button
                type="button"
                className={colorDirection === 'two' ? 'active' : ''}
                onClick={() => onColorDirection?.('two')}
                title="Two-way diverging: ±max"
              >
                2-way
              </button>
            </div>
          </div>
          <label className="settings-slider">
            <span className="settings-slider-label">Brain opacity</span>
            <span className="settings-slider-value">{Math.round((brainOpacity ?? 0) * 100)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round((brainOpacity ?? 0) * 100)}
              onChange={(event) => onBrainOpacity?.(Number(event.target.value) / 100)}
            />
          </label>
          <label className="settings-slider">
            <span className="settings-slider-label">Electrode size</span>
            <span className="settings-slider-value">{(electrodeSizeScale ?? 1).toFixed(1)}x</span>
            <input
              type="range"
              min={50}
              max={250}
              step={5}
              value={Math.round((electrodeSizeScale ?? 1) * 100)}
              onChange={(event) => onElectrodeSizeScale?.(Number(event.target.value) / 100)}
            />
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
