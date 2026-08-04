import React, { useMemo, useState } from 'react';
import {
  resolvePanelConditionSeries,
  clipTraceToPhaseWindow,
  computeTraceYRange,
} from '../../utils/traces.js';
import { phaseColor } from '../../constants/colors.js';
import { resolveWaveformYRange } from '../../constants/waveform.js';
import { formatWaveformTitle } from '../../utils/selectionSummary.js';
import PhaseAnimationControls from './PhaseAnimationControls.jsx';
import PhaseWaveformPlot from './PhaseWaveformPlot.jsx';
import PanelEmptyState from '../layout/PanelEmptyState.jsx';

// The bottom trace shows a little context beyond the (animation) bounds front and back.
const TRACE_BOUNDS_MARGIN_SEC = 0.1;

// Cap each phase column's width so that a small number of phases (e.g. GLM lexicality's
// two) don't stretch across the whole panel and read as awkwardly wide.
const MAX_PHASE_COLUMN_PX = 520;

// Selectable playback speed multipliers for the time-course animation.
const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2];

const StaticWaveformBody = React.memo(function StaticWaveformBody({
  phase,
  phaseLabel,
  index,
  trace,
  traceKey,
  yRange,
  xRange,
  hasTrace,
  isSingleElectrode,
  isActivePhase,
  currentTime,
  selectionEmpty,
}) {
  if (!hasTrace) {
    return (
      <div className="plot-empty">
        {selectionEmpty
          ? selectionEmpty.message
          : `No HGA trace for ${phaseLabel} in this selection`}
      </div>
    );
  }

  return (
    <PhaseWaveformPlot
      key={`${traceKey}-${phase}`}
      phase={phase}
      phaseLabel={phaseLabel}
      index={index}
      trace={trace}
      traceKey={traceKey}
      yRange={yRange}
      xRange={xRange}
      isSingleElectrode={isSingleElectrode}
      isActivePhase={isActivePhase}
      currentTime={currentTime}
    />
  );
}, (prev, next) => (
  prev.phase === next.phase
  && prev.index === next.index
  && prev.traceKey === next.traceKey
  && prev.hasTrace === next.hasTrace
  && prev.isSingleElectrode === next.isSingleElectrode
  && prev.yRange[0] === next.yRange[0]
  && prev.yRange[1] === next.yRange[1]
  && prev.xRange?.min === next.xRange?.min
  && prev.xRange?.max === next.xRange?.max
  && prev.isActivePhase === next.isActivePhase
  && prev.currentTime === next.currentTime
  && prev.selectionEmpty === next.selectionEmpty
));

const PhasePlotCard = React.memo(function PhasePlotCard({
  phase,
  phaseLabel,
  bounds,
  index,
  staticTrace,
  traceKey,
  playback,
  isSingleElectrode,
  canPlay,
  animationLoadingPhase,
  playingPhase,
  isPlaying,
  awaitingKdeRender,
  renderProgress,
  animationFrameIdx,
  selectionEmpty,
  onTogglePlay,
  onSeek,
}) {
  const isActivePhase = playback.isActivePhase;

  return (
    <div className={`plot-card${isActivePhase ? ' playing' : ''}`}>
      <PhaseAnimationControls
        phase={phase}
        phaseLabel={phaseLabel}
        bounds={bounds}
        bundle={playback.controlsBundle}
        canPlay={canPlay}
        isLoading={animationLoadingPhase === phase}
        isPreparing={isActivePhase && awaitingKdeRender}
        renderProgress={renderProgress}
        playingPhase={playingPhase}
        isPlaying={isPlaying}
        frameIdx={animationFrameIdx}
        onTogglePlay={onTogglePlay}
        onSeek={onSeek}
      />
      <StaticWaveformBody
        phase={phase}
        phaseLabel={phaseLabel}
        index={index}
        trace={staticTrace.trace}
        traceKey={traceKey}
        yRange={staticTrace.yRange}
        xRange={staticTrace.xRange}
        hasTrace={staticTrace.hasTrace}
        isSingleElectrode={isSingleElectrode}
        isActivePhase={isActivePhase}
        currentTime={playback.currentTime}
        selectionEmpty={selectionEmpty}
      />
    </div>
  );
}, (prev, next) => (
  prev.phase === next.phase
  && prev.phaseLabel === next.phaseLabel
  && prev.index === next.index
  && prev.traceKey === next.traceKey
  && prev.isSingleElectrode === next.isSingleElectrode
  && prev.canPlay === next.canPlay
  && prev.animationLoadingPhase === next.animationLoadingPhase
  && prev.playingPhase === next.playingPhase
  && prev.isPlaying === next.isPlaying
  && prev.awaitingKdeRender === next.awaitingKdeRender
  && prev.renderProgress === next.renderProgress
  && prev.animationFrameIdx === next.animationFrameIdx
  && prev.selectionEmpty === next.selectionEmpty
  && prev.staticTrace === next.staticTrace
  && prev.playback === next.playback
  && prev.bounds === next.bounds
));

function WaveformPanel({
  electrode,
  summary,
  electrodes,
  grid = null,
  sigSets = null,
  conditions = [],
  gridLoading = false,
  panelPhases = [],
  availablePhases = [],
  phaseLabels = {},
  onTogglePanelPhase,
  gate = true,
  overlayIsDiff = false,
  expandable = false,
  playbackSpeed = 1,
  onPlaybackSpeed,
  variantKey = null,
  electrodesKey = '',
  memberBounds = null,
  selectedLoad,
  animationCache,
  canPlay,
  selectionEmpty = null,
  playingPhase,
  isPlaying,
  awaitingKdeRender = false,
  renderProgress = 0,
  animationFrameIdx,
  animationLoadingPhase,
  onTogglePlay,
  onSeek,
}) {
  const loadLabel = selectedLoad === 'all' ? 'all conditions' : `load ${selectedLoad}`;
  const isSingleElectrode = Boolean(electrode);
  // Single-electrode diff mode can expand one condition into active/baseline/difference.
  const [expandCondition, setExpandCondition] = useState(null);
  const canExpand = isSingleElectrode && expandable;
  const activeExpand = (canExpand && conditions.includes(expandCondition)) ? expandCondition : null;

  const { title, fullTitle } = formatWaveformTitle({
    summary,
    isSingleElectrode,
    electrode,
    loadLabel,
    electrodeCount: electrodes.length,
  });

  // Include variantKey + selection + expand mode so the memoized plots re-render on change.
  const traceKey = `${variantKey ?? 'v'}:${electrode?.id ?? `agg:${electrodesKey}`}:${activeExpand ?? 'overlay'}`;

  const staticTraces = useMemo(() => {
    const built = panelPhases.map((phase, index) => {
      const bounds = memberBounds?.[phase] ?? null;
      const display = bounds
        ? { min: bounds.min - TRACE_BOUNDS_MARGIN_SEC, max: bounds.max + TRACE_BOUNDS_MARGIN_SEC }
        : null;
      let rawTrace;
      if (!grid) {
        rawTrace = { conditions: [] };
      } else if (activeExpand) {
        const series = resolvePanelConditionSeries(
          grid, sigSets, electrodes, phase, activeExpand, electrode, { gate },
        );
        rawTrace = series
          ? {
            x: series.time,
            y: series.value,
            sem: series.sem,
            act: series.act,
            bsl: series.bsl,
            actLabel: series.actLabel,
            bslLabel: series.bslLabel,
          }
          : { x: [], y: [], sem: null };
      } else {
        rawTrace = {
          conditions: conditions.map((condition) => {
            const series = resolvePanelConditionSeries(
              grid, sigSets, electrodes, phase, condition, electrode, { gate },
            );
            return {
              condition,
              x: series?.time ?? [],
              y: series?.value ?? [],
              sem: series?.sem ?? null,
            };
          }),
        };
      }
      const trace = clipTraceToPhaseWindow(rawTrace, phase, display);
      const hasTrace = trace.conditions
        ? trace.conditions.some((c) => c.x.length > 0)
        : trace.x.length > 0;
      return { phase, index, trace, hasTrace, xRange: display };
    });

    // Shared y-axis auto-scaled across all columns / conditions.
    let ymin = Infinity;
    let ymax = -Infinity;
    built.forEach(({ trace, hasTrace }) => {
      if (!hasTrace) return;
      const [lo, hi] = computeTraceYRange(trace);
      ymin = Math.min(ymin, lo);
      ymax = Math.max(ymax, hi);
    });
    const yRange = Number.isFinite(ymin) && ymax > ymin ? [ymin, ymax] : resolveWaveformYRange();

    return Object.fromEntries(built.map((entry) => [entry.phase, { ...entry, yRange }]));
  }, [grid, sigSets, electrodes, electrode, panelPhases, conditions, memberBounds, activeExpand, gate]);

  const playbackByPhase = useMemo(() => (
    Object.fromEntries(panelPhases.map((phase) => {
      const phaseBundle = animationCache?.[phase];
      const isActivePhase = playingPhase === phase;
      return [phase, {
        isActivePhase,
        currentTime: isActivePhase
          ? phaseBundle?.frames?.[animationFrameIdx]?.time ?? null
          : null,
        controlsBundle: phaseBundle,
      }];
    }))
  ), [animationCache, playingPhase, animationFrameIdx, panelPhases]);

  const showLoading = gridLoading && !grid;

  return (
    <div className="waveform-body">
      <div className="waveform-header">
        <div className="waveform-title" title={fullTitle}>{title}</div>
        {conditions.length > 1 && !activeExpand && (
          <div className="waveform-legend">
            {conditions.map((condition) => (
              <span key={condition} className="waveform-legend-item">
                <span className="waveform-legend-dot" style={{ background: phaseColor(condition) }} />
                {condition}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="waveform-controls-row">
        {availablePhases.length > 1 && (
          <div className="load-selector waveform-phase-picker">
            <span className="load-selector-label">Phases</span>
            {availablePhases.map((phase) => (
              <button
                key={phase}
                type="button"
                className={panelPhases.includes(phase) ? 'load-chip active' : 'load-chip'}
                onClick={() => onTogglePanelPhase?.(phase)}
              >
                {phaseLabels[phase] ?? phase}
              </button>
            ))}
          </div>
        )}
        <div className="load-selector waveform-speed-picker">
          <span className="load-selector-label">Speed</span>
          {PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={playbackSpeed === speed ? 'load-chip active' : 'load-chip'}
              onClick={() => onPlaybackSpeed?.(speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
        {canExpand && (
          <div className="load-selector waveform-expand-picker">
            <span className="load-selector-label">Show</span>
            <button
              type="button"
              className={!activeExpand ? 'load-chip active' : 'load-chip'}
              onClick={() => setExpandCondition(null)}
              title="Overlay all conditions (difference)"
            >
              Conditions
            </button>
            {conditions.map((condition) => (
              <button
                key={condition}
                type="button"
                className={activeExpand === condition ? 'load-chip active' : 'load-chip'}
                onClick={() => setExpandCondition(condition)}
                title={`${condition}: active / baseline / difference`}
              >
                {condition}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="waveform-grid-wrap" data-tour="waveform-panel">
        {showLoading && (
          <div className="waveform-loading">
            <div className="waveform-loading-card">
              <p className="waveform-loading-note">Loading time courses…</p>
            </div>
          </div>
        )}
        <div
          className={`waveform-grid${selectionEmpty ? ' is-empty' : ''}`}
          style={{
            gridTemplateColumns: panelPhases.map(() => 'minmax(0, 1fr)').join(' '),
            maxWidth: `${panelPhases.length * MAX_PHASE_COLUMN_PX}px`,
          }}
        >
          {panelPhases.map((phase) => (
            <PhasePlotCard
              key={phase}
              phase={phase}
              phaseLabel={phaseLabels[phase] ?? phase}
              bounds={memberBounds?.[phase] ?? null}
              index={staticTraces[phase].index}
              staticTrace={staticTraces[phase]}
              traceKey={traceKey}
              playback={playbackByPhase[phase]}
              isSingleElectrode={isSingleElectrode}
              canPlay={canPlay}
              animationLoadingPhase={animationLoadingPhase}
              playingPhase={playingPhase}
              isPlaying={isPlaying}
              awaitingKdeRender={awaitingKdeRender}
              renderProgress={renderProgress}
              animationFrameIdx={animationFrameIdx}
              selectionEmpty={selectionEmpty}
              onTogglePlay={onTogglePlay}
              onSeek={onSeek}
            />
          ))}
        </div>
        <PanelEmptyState emptyState={selectionEmpty} className="waveform-empty-state" />
      </div>
    </div>
  );
}

export default React.memo(WaveformPanel);
