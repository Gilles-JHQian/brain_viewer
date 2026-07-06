import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Info, RotateCcw } from 'lucide-react';
import { PHASE_LABELS } from '../../constants/phases.js';
import {
  BRAIN_MESH_URL,
  BRAIN_CAMERA,
  BRAIN_HEMISPHERE_OPTIONS,
  BRAIN_VIEW_OPTIONS,
  DEFAULT_BRAIN_VIEW_MODE,
  DEFAULT_ELECTRODE_BRAIN_OPACITY,
} from '../../constants/brain.js';
import {
  buildKdeSources,
  kdeSourceHgaValues,
  kdeSourcesForInfluenceMap,
} from '../../utils/roiKdeSources.js';
import BrainSceneLighting from './BrainSceneLighting.jsx';
import BrainSceneControls from './BrainSceneControls.jsx';
import KdeColorbar from './KdeColorbar.jsx';
import ElectrodeHgaColorbar from './ElectrodeHgaColorbar.jsx';
import FallbackBrainSphere from './FallbackBrainSphere.jsx';
import AverageBrainMesh from './AverageBrainMesh.jsx';
import BrainKdeMesh from './BrainKdeMesh.jsx';
import ElectrodePoint from './ElectrodePoint.jsx';
import ElectrodeInstances from './ElectrodeInstances.jsx';
import { resolveHgaMean } from '../../utils/hga.js';
import { electrodeMatchesHemisphere } from '../../lib/brainMesh.js';
import PanelEmptyState from '../layout/PanelEmptyState.jsx';
import BrainRenderOverlay from './BrainRenderOverlay.jsx';

export default function BrainViewer({
  electrodes,
  metadata,
  vennPhases,
  selectedLoad,
  kdeBandwidth,
  kdeMaxDistance,
  colorDirection = 'one',
  brainOpacity = DEFAULT_ELECTRODE_BRAIN_OPACITY,
  electrodeSizeScale = 1,
  selectedIds,
  selectedElectrodeId,
  hoveredId,
  playingPhase,
  isPlaying,
  animationFrameIdx,
  animationTime,
  animationScale,
  animationFrames,
  liveHgaByElectrodeId,
  selectionEmpty = null,
  awaitingKdeRender = false,
  kdeFrameCacheStatus = { ready: true, progress: 1 },
  kdePreRenderToken = 0,
  onFrameCacheStatus,
  onBrainViewModeChange,
  onHover,
  onSelect,
}) {
  const hgaScale = metadata?.hga_size_scale;
  const [brainAssetOk, setBrainAssetOk] = useState(null);
  const [showAllElectrodes, setShowAllElectrodes] = useState(false);
  const [brainHemisphere, setBrainHemisphere] = useState('both');
  const [colorByFunctional, setColorByFunctional] = useState(true);
  const [colorMode, setColorMode] = useState('region'); // 'region' | 'hga'
  const [kdeManualMax, setKdeManualMax] = useState(''); // '' = auto
  const [brainViewMode, setBrainViewMode] = useState(DEFAULT_BRAIN_VIEW_MODE);
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const [kdeDensityRange, setKdeDensityRange] = useState({ vmin: 0, vmax: 1, hasData: false });

  const handleDensityRange = useCallback((range) => {
    setKdeDensityRange(range);
  }, []);

  const handleFrameCacheStatus = useCallback((status) => {
    onFrameCacheStatus?.(status);
  }, [onFrameCacheStatus]);

  useEffect(() => {
    onBrainViewModeChange?.(brainViewMode);
  }, [brainViewMode, onBrainViewModeChange]);

  const visibleElectrodes = useMemo(() => {
    const base = showAllElectrodes
      ? electrodes
      : electrodes.filter((electrode) => selectedIds.has(electrode.id));
    return base.filter((electrode) => electrodeMatchesHemisphere(electrode, brainHemisphere));
  }, [electrodes, selectedIds, showAllElectrodes, brainHemisphere]);

  const visibleElectrodesKey = useMemo(
    () => visibleElectrodes.map((electrode) => electrode.id).join('|'),
    [visibleElectrodes],
  );

  const kdeHgaValues = useMemo(
    () => visibleElectrodes.map((electrode) => {
      if (playingPhase && liveHgaByElectrodeId?.[electrode.id] != null) {
        return liveHgaByElectrodeId[electrode.id];
      }
      return resolveHgaMean(electrode, selectedLoad);
    }),
    [visibleElectrodesKey, playingPhase, liveHgaByElectrodeId, selectedLoad, animationTime],
  );

  const kdeSources = useMemo(
    () => buildKdeSources(visibleElectrodes, kdeHgaValues),
    [visibleElectrodesKey, kdeHgaValues],
  );

  const kdeLayout = useMemo(() => {
    const placeholderHga = visibleElectrodes.map(() => 0);
    const sources = buildKdeSources(visibleElectrodes, placeholderHga);
    return {
      mode: sources.mode,
      sourceIds: sources.sources.map((source) => source.id),
      influencePoints: kdeSourcesForInfluenceMap(sources.sources),
    };
  }, [visibleElectrodesKey, visibleElectrodes]);

  const kdeSourceHga = useMemo(
    () => kdeSourceHgaValues(kdeSources.sources),
    [kdeSources],
  );

  const kdeFrameHgaValues = useMemo(() => {
    if (!playingPhase || !animationFrames?.length) return null;
    if (kdeLayout.mode === 'electrode') {
      return animationFrames.map((frame) => kdeLayout.sourceIds.map(
        (sourceId) => frame.hgaByElectrodeId?.[sourceId] ?? 0,
      ));
    }
    return animationFrames.map((frame) => kdeLayout.sourceIds.map((sourceId) => {
      const roi = sourceId.startsWith('roi:') ? sourceId.slice(4) : null;
      if (!roi) return 0;
      const members = visibleElectrodes.filter((electrode) => electrode.roi === roi);
      const values = members
        .map((electrode) => frame.hgaByElectrodeId?.[electrode.id])
        .filter((value) => value != null && Number.isFinite(value));
      if (!values.length) return 0;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    }));
  }, [playingPhase, animationFrames, kdeLayout, visibleElectrodesKey, visibleElectrodes]);

  const useInstancedElectrodes = visibleElectrodes.length > 80;
  const highlightedElectrodes = useMemo(
    () => (useInstancedElectrodes
      ? visibleElectrodes.filter(
        (electrode) => electrode.id === selectedElectrodeId || electrode.id === hoveredId,
      )
      : []),
    [useInstancedElectrodes, visibleElectrodes, selectedElectrodeId, hoveredId, visibleElectrodesKey],
  );
  const instancedElectrodes = useMemo(
    () => (useInstancedElectrodes
      ? visibleElectrodes.filter(
        (electrode) => electrode.id !== selectedElectrodeId && electrode.id !== hoveredId,
      )
      : []),
    [useInstancedElectrodes, visibleElectrodes, selectedElectrodeId, hoveredId, visibleElectrodesKey],
  );

  useEffect(() => {
    if (brainViewMode === 'kde' && brainAssetOk === false) {
      setBrainViewMode('electrodes');
    }
  }, [brainViewMode, brainAssetOk]);

  useEffect(() => {
    let cancelled = false;
    fetch(BRAIN_MESH_URL, { method: 'HEAD' })
      .then((response) => {
        if (!cancelled) {
          setBrainAssetOk(response.ok);
          if (!response.ok) {
            console.warn(`Average brain mesh not found at ${BRAIN_MESH_URL}; using fallback sphere.`);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBrainAssetOk(false);
          console.warn(`Average brain mesh failed to load from ${BRAIN_MESH_URL}; using fallback sphere.`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="brain-canvas">
      <Canvas
        camera={BRAIN_CAMERA}
        gl={{ localClippingEnabled: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NoToneMapping;
        }}
      >
        <BrainSceneLighting mneStyle />
        {brainAssetOk === true && brainViewMode === 'electrodes' && (
          <AverageBrainMesh opacity={brainOpacity} hemisphereView={brainHemisphere} useLitCortex />
        )}
        {brainAssetOk === true && brainViewMode === 'kde' && (
          <BrainKdeMesh
            opacity={brainOpacity}
            hemisphereView={brainHemisphere}
            influencePoints={kdeLayout.influencePoints}
            hgaValues={kdeSourceHga}
            fixedHgaMax={playingPhase ? animationScale?.vmax : null}
            frameHgaValues={kdeFrameHgaValues}
            frameIndex={animationFrameIdx}
            kdePreRenderToken={kdePreRenderToken}
            manualMax={kdeManualMax === '' ? null : Number(kdeManualMax)}
            bandwidth={kdeBandwidth}
            maxDistance={kdeMaxDistance}
            onDensityRange={handleDensityRange}
            onFrameCacheStatus={handleFrameCacheStatus}
          />
        )}
        {brainAssetOk === false && (
          <FallbackBrainSphere opacity={brainOpacity} hemisphereView={brainHemisphere} />
        )}
        {brainViewMode === 'electrodes' && useInstancedElectrodes && (
          <ElectrodeInstances
            electrodes={instancedElectrodes}
            vennPhases={vennPhases}
            selectedLoad={selectedLoad}
            hgaScale={hgaScale}
            animationScale={animationScale}
            liveHgaByElectrodeId={liveHgaByElectrodeId}
            isAnimating={Boolean(playingPhase)}
            selectedIds={selectedIds}
            selectedElectrodeId={selectedElectrodeId}
            hoveredId={hoveredId}
            colorByFunctional={colorByFunctional}
            colorMode={colorMode}
            colorDirection={colorDirection}
            sizeScale={electrodeSizeScale}
            onHover={onHover}
            onSelect={onSelect}
          />
        )}
        {brainViewMode === 'electrodes' && (useInstancedElectrodes ? highlightedElectrodes : visibleElectrodes).map((electrode) => (
          <ElectrodePoint
            key={electrode.id}
            electrode={electrode}
            vennPhases={vennPhases}
            selectedLoad={selectedLoad}
            hgaScale={hgaScale}
            animationScale={animationScale}
            liveHga={liveHgaByElectrodeId?.[electrode.id]}
            isAnimating={Boolean(playingPhase)}
            selected={selectedIds.has(electrode.id)}
            dimmed={showAllElectrodes && !selectedIds.has(electrode.id)}
            active={selectedElectrodeId === electrode.id}
            hovered={hoveredId === electrode.id}
            onHover={onHover}
            onSelect={onSelect}
            colorByFunctional={colorByFunctional}
            colorMode={colorMode}
            colorDirection={colorDirection}
            sizeScale={electrodeSizeScale}
          />
        ))}
        <BrainSceneControls resetToken={cameraResetToken} />
      </Canvas>
      <div className="brain-toolbar">
        <div className="brain-controls-row" data-tour="brain-controls">
          <div className="brain-control-pill">
            <span className="brain-control-label">Hemisphere</span>
            {BRAIN_HEMISPHERE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={brainHemisphere === option.id ? 'brain-chip active' : 'brain-chip'}
                onClick={() => setBrainHemisphere(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="brain-control-pill">
            <span className="brain-control-label">View</span>
            {BRAIN_VIEW_OPTIONS.map((option) => {
              const disabled = option.id === 'kde' && brainAssetOk !== true;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`brain-chip${brainViewMode === option.id ? ' active' : ''}`}
                  disabled={disabled}
                  title={disabled ? 'KDE projection requires the average pial mesh (cvs_avg35_pial.glb)' : undefined}
                  onClick={() => setBrainViewMode(option.id)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {brainViewMode === 'electrodes' && (
            <div className="brain-control-pill">
              <span className="brain-control-label">Color</span>
              <button
                type="button"
                className={colorMode === 'region' ? 'brain-chip active' : 'brain-chip'}
                onClick={() => setColorMode('region')}
                title="Color electrodes by phase-overlap region"
              >
                Region
              </button>
              <button
                type="button"
                className={colorMode === 'hga' ? 'brain-chip active' : 'brain-chip'}
                onClick={() => setColorMode('hga')}
                title="Color electrodes by HGA value"
              >
                HGA
              </button>
            </div>
          )}
          <button
            type="button"
            className="brain-chip brain-reset-btn"
            onClick={() => setCameraResetToken((token) => token + 1)}
            title="Reset camera to default view"
          >
            <RotateCcw size={13} />
            Reset view
          </button>
          <button
            type="button"
            className={`brain-chip${showAllElectrodes ? ' active' : ''}`}
            onClick={() => setShowAllElectrodes((current) => !current)}
            title={showAllElectrodes ? 'Show selected electrodes only' : 'Show all electrodes for context'}
          >
            {showAllElectrodes ? 'Selected only' : 'Show all'}
          </button>
        </div>
      </div>
      {brainViewMode === 'kde' && (
        <div className="kde-colorbar-stack">
          <KdeColorbar range={kdeDensityRange} />
          <label className="kde-manual-max" title="Manual colorbar max (blank = auto p98)">
            <span>max</span>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="auto"
              value={kdeManualMax}
              onChange={(event) => setKdeManualMax(event.target.value)}
            />
          </label>
        </div>
      )}
      {brainViewMode === 'electrodes' && colorMode === 'hga' && (
        <ElectrodeHgaColorbar scale={hgaScale} direction={colorDirection} />
      )}
      <button
        type="button"
        className="brain-help-btn"
        title="Drag to rotate · scroll to zoom · click an electrode for details. Animation updates KDE or sphere size for the active phase."
        aria-label="Brain view help"
      >
        <Info size={14} />
      </button>
      {brainViewMode === 'kde' && kdeSources.mode === 'roi' && (
        <div className="brain-status-pill brain-kde-mode-pill">{kdeSources.label}</div>
      )}
      {playingPhase && (animationTime != null || awaitingKdeRender) && (
        <div className="brain-status-pill">
          {PHASE_LABELS[playingPhase]}
          {animationTime != null && ` · t = ${animationTime.toFixed(2)}s`}
          {awaitingKdeRender && brainViewMode === 'kde' && ' · preparing map'}
          {!awaitingKdeRender && isPlaying && ' · playing'}
          {!awaitingKdeRender && !isPlaying && animationTime != null && ' · paused'}
        </div>
      )}
      {awaitingKdeRender && brainViewMode === 'kde' && (
        <BrainRenderOverlay
          active
          progress={kdeFrameCacheStatus.progress}
          phaseLabel={playingPhase ? PHASE_LABELS[playingPhase] : null}
        />
      )}
      <PanelEmptyState emptyState={selectionEmpty} className="brain-empty-state" />
    </div>
  );
}
