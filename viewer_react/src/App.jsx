import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Brain, Info, FlaskConical } from 'lucide-react';
import { PHASES, defaultPhaseBounds } from './constants/phases.js';
import { VENN_MAX_PHASES, VENN_MIN_PHASES } from './constants/venn.js';
import {
  DEFAULT_BRAIN_VIEW_MODE,
  DEFAULT_ELECTRODE_BRAIN_OPACITY,
  DEFAULT_KDE_BRAIN_OPACITY,
} from './constants/brain.js';
import usePhaseOverlapData from './hooks/usePhaseOverlapData.js';
import useSelectionPipeline from './hooks/useSelectionPipeline.js';
import useAnimationPlayback from './hooks/useAnimationPlayback.js';
import useConditionPhaseGrid from './hooks/useConditionPhaseGrid.js';
import { sliceGridForCondition } from './data/phaseOverlapStore.js';
import { computeElectrodeHga } from './utils/electrodeHga.js';
import { phaseColor } from './constants/colors.js';
import useOnboardingTour from './hooks/useOnboardingTour.js';
import PanelTitle from './components/layout/PanelTitle.jsx';
import VennPanel from './components/venn/VennPanel.jsx';
import BrainViewer from './components/brain/BrainViewer.jsx';
import DetailPanel from './components/detail/DetailPanel.jsx';
import WaveformPanel from './components/waveform/WaveformPanel.jsx';
import ViewerInitialLoadScreen from './components/layout/ViewerInitialLoadScreen.jsx';
import VariantSelector from './components/layout/VariantSelector.jsx';
import SettingsPanel from './components/layout/SettingsPanel.jsx';
import { ANIM_WINDOW_SEC } from './constants/animation.js';
import { KDE_BANDWIDTH, KDE_MAX_DISTANCE } from './brainKde.js';
import { getSelectionEmptyState } from './utils/selectionEmptyState.js';

export default function App() {
  // brain_viewer has no Sternberg "load" axis; downstream components still take a
  // selectedLoad prop, so it is pinned to 'all'.
  const [selectedLoad] = useState('all');
  // Analysis settings (adjustable in the settings panel).
  const [windowSec, setWindowSec] = useState(ANIM_WINDOW_SEC);
  const [kdeBandwidth, setKdeBandwidth] = useState(KDE_BANDWIDTH);
  const [kdeMaxDistance, setKdeMaxDistance] = useState(KDE_MAX_DISTANCE);
  // Animation: show only electrodes significant in the current window, or all significant.
  const [sigWindowOnly, setSigWindowOnly] = useState(true);
  // Time-course playback speed multiplier (1x = ANIM_STEP_SEC per frame).
  const [playbackSpeed, setPlaybackSpeed] = useState(0.5);
  // Per-phase time-course x-axis bounds (user overrides; defaults fill the rest).
  const [phaseBounds, setPhaseBounds] = useState({});
  const setPhaseBound = useCallback((phase, key, value) => {
    setPhaseBounds((prev) => ({
      ...prev,
      [phase]: { ...(prev[phase] ?? defaultPhaseBounds(phase)), [key]: Number(value) },
    }));
  }, []);
  const [brainViewMode, setBrainViewMode] = useState(DEFAULT_BRAIN_VIEW_MODE);
  // Left "Condition overlap selector" panel visibility (toggled in Settings to declutter).
  const [showReferenceSelector, setShowReferenceSelector] = useState(true);
  const [showVennOverSelector, setShowVennOverSelector] = useState(true);
  // Brain-map display controls (moved out of the brain toolbar into Settings).
  const [colorDirection, setColorDirection] = useState('one'); // 'one' | 'two'
  const [brainOpacity, setBrainOpacity] = useState(DEFAULT_ELECTRODE_BRAIN_OPACITY);
  const [electrodeSizeScale, setElectrodeSizeScale] = useState(1);
  // Opacity default differs by view mode; reset it on mode change (matches prior in-viewer behavior).
  useEffect(() => {
    setBrainOpacity(
      brainViewMode === 'kde' ? DEFAULT_KDE_BRAIN_OPACITY : DEFAULT_ELECTRODE_BRAIN_OPACITY,
    );
  }, [brainViewMode]);
  const [kdeFrameCacheStatus, setKdeFrameCacheStatus] = useState({ ready: true, progress: 1 });
  const [kdePreRenderToken, setKdePreRenderToken] = useState(0);

  const handleKdeRenderStart = useCallback(() => {
    setKdeFrameCacheStatus({ ready: false, progress: 0 });
    setKdePreRenderToken((token) => token + 1);
  }, []);

  const handleFrameCacheStatus = useCallback((status) => {
    setKdeFrameCacheStatus(status);
  }, []);

  const {
    task,
    setTask,
    tasks,
    data,
    isInitialLoading,
    initialLoadProgress,
    initialLoadStage,
    initialLoadLabel,
    loadError,
    bootstrapProgress,
    tracesLoading,
    tracesLoadProgress,
    initialLoadComplete,
    electrodeById,
    availableSubjects,
    availableSubjectsKey,
    selectedSubjects,
    subjectFilteredElectrodes,
    toggleSubject,
    selectAllSubjects,
    deselectAllSubjects,
    spec,
    vennMembers,
    variantOptions,
    variantLoading,
    updateVariant,
  } = usePhaseOverlapData();

  const {
    vennPhases,
    setVennPhases,
    vennRegions,
    selectedRegionIds,
    selectRegion,
    selectedElectrodeId,
    selectElectrode,
    clearSelectedElectrode,
    hoveredId,
    setHoveredId,
    enabledRois,
    toggleRoi,
    enableAllRois,
    deselectAllRois,
    availableRois,
    roiFilteredIds,
    selectedRegions,
    selectedSummary,
    selectedElectrode,
    tableElectrodes,
    tableElectrodesKey,
    roiBarItems,
  } = useSelectionPipeline({ subjectFilteredElectrodes, electrodeById, vennMembers });

  // Full phase x condition grid for the active spec — powers the fixed time-course panel
  // (all conditions overlaid per phase) and the brain-map condition slice.
  const {
    grid,
    sigSets,
    gridConditions,
    gridPhases,
    gridHasCondition,
    gridLoading,
  } = useConditionPhaseGrid({ manifest: data?.manifest, metadata: data?.metadata, spec });

  const gridPhasesKey = gridPhases.join('|');
  const gridConditionsKey = gridConditions.join('|');

  // Which phases the time-course panel shows (user subset of the spec's phases) and which
  // condition the brain map colors by. Reconcile to valid values whenever the axes change.
  const [panelPhases, setPanelPhases] = useState(null);
  const [selectedMapCondition, setSelectedMapCondition] = useState(null);
  useEffect(() => {
    setPanelPhases((prev) => {
      if (!gridPhases.length) return prev;
      const kept = (prev || []).filter((phase) => gridPhases.includes(phase));
      return kept.length ? kept : gridPhases;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridPhasesKey]);
  useEffect(() => {
    setSelectedMapCondition((prev) => (
      prev && gridConditions.includes(prev) ? prev : (gridConditions[0] ?? null)
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridConditionsKey]);

  const activePanelPhases = useMemo(
    () => ((panelPhases && panelPhases.length) ? panelPhases : gridPhases),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelPhases, gridPhasesKey],
  );
  const activeMapCondition = selectedMapCondition ?? gridConditions[0] ?? null;

  const togglePanelPhase = useCallback((phase) => {
    setPanelPhases((prev) => {
      const current = (prev && prev.length) ? prev : gridPhases;
      if (current.includes(phase)) {
        if (current.length <= 1) return current; // keep at least one column
        return current.filter((item) => item !== phase);
      }
      return gridPhases.filter((item) => current.includes(item) || item === phase);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridPhasesKey]);

  // Per-panel-phase time-course bounds (real-phase-keyed; user overrides, else defaults).
  const panelPhaseBounds = useMemo(() => Object.fromEntries(
    activePanelPhases.map((phase) => [phase, phaseBounds[phase] ?? defaultPhaseBounds(phase)]),
  ), [activePanelPhases, phaseBounds]);

  // Re-slice the grid at the map's condition into the traces[id][phase].all shape the
  // animation + electrode-HGA code consume.
  const conditionTraces = useMemo(
    () => sliceGridForCondition(grid, activeMapCondition),
    [grid, activeMapCondition],
  );

  // Brain map colors/sizes electrodes by the selected condition's HGA (largest-magnitude
  // post-onset mean across the panel phases). Override hga_mean_all + hga_size_scale on the
  // electrodes/metadata passed to BrainViewer only; the Venn/selection keep the originals.
  const { mapHgaById, mapHgaScale } = useMemo(() => {
    const { hgaById, scale } = computeElectrodeHga(
      subjectFilteredElectrodes, conditionTraces, activePanelPhases,
    );
    return { mapHgaById: hgaById, mapHgaScale: scale };
  }, [subjectFilteredElectrodes, conditionTraces, activePanelPhases]);

  const mapElectrodes = useMemo(
    () => subjectFilteredElectrodes.map(
      (e) => ({ ...e, hga_mean_all: mapHgaById.get(e.id) ?? null }),
    ),
    [subjectFilteredElectrodes, mapHgaById],
  );
  const metadataForMap = useMemo(
    () => (data?.metadata ? { ...data.metadata, hga_size_scale: mapHgaScale } : data?.metadata),
    [data?.metadata, mapHgaScale],
  );

  const kdeRenderRequired = brainViewMode === 'kde';

  const {
    playingPhase,
    isPlaying,
    animationFrameIdx,
    animationCache,
    animationLoadingPhase,
    awaitingKdeRender,
    renderProgress,
    liveHgaByElectrodeId,
    animationScale,
    animationTime,
    handleTogglePlay,
    handleSeek,
  } = useAnimationPlayback({
    manifest: data?.manifest,
    layout: data?.layout,
    tableElectrodes,
    tableElectrodesKey,
    traces: conditionTraces,
    selectedLoad,
    selectedRegionIds,
    vennPhases,
    availableSubjectsKey,
    selectedSubjects,
    kdeRenderRequired,
    kdeFrameCacheStatus,
    windowSec: Number(windowSec) || ANIM_WINDOW_SEC,
    gateByWindow: sigWindowOnly,
    memberBounds: panelPhaseBounds,
    panelPhases: activePanelPhases,
    selectedMapCondition: activeMapCondition,
    playbackSpeed,
    onKdeRenderStart: handleKdeRenderStart,
  });

  const enabledRoiCount = availableRois.filter((roi) => enabledRois.has(roi)).length;
  const selectionEmpty = useMemo(
    () => getSelectionEmptyState({
      selectedSubjectCount: selectedSubjects.size,
      selectedRegionCount: selectedRegions.length,
      availableRoiCount: availableRois.length,
      enabledRoiCount,
      visibleElectrodeCount: tableElectrodes.length,
    }),
    [
      selectedSubjects.size,
      selectedRegions.length,
      availableRois.length,
      enabledRoiCount,
      tableElectrodes.length,
    ],
  );

  const canPlay = tableElectrodes.length > 0
    && !selectionEmpty
    && (data?.layout === 'split' || !tracesLoading);

  if (isInitialLoading) {
    return (
      <ViewerInitialLoadScreen
        progress={initialLoadProgress}
        stage={initialLoadStage}
        stageLabel={initialLoadLabel}
        completed={
          initialLoadStage === 'traces'
            ? tracesLoadProgress.completed
            : bootstrapProgress.completed
        }
        total={
          initialLoadStage === 'traces'
            ? tracesLoadProgress.total
            : bootstrapProgress.total
        }
        error={loadError}
      />
    );
  }

  if (!data) {
    return (
      <ViewerInitialLoadScreen
        progress={0}
        stage="manifest"
        stageLabel="Loading viewer metadata…"
        error={loadError}
      />
    );
  }

  return (
    <TourHost enabled>
      {({ startTour, isTourActive }) => (
    <div className="app-shell">
      <div className="tour-welcome-anchor" data-tour="tour-welcome" aria-hidden="true" />
      <header className="topbar">
        <h1 className="topbar-title"><Brain size={20} /> HGA viewer</h1>
        <div className="topbar-controls">
          <div className="load-selector task-selector" data-tour="task-selector">
            <span className="load-selector-label"><FlaskConical size={14} /> Task</span>
            {tasks.map((taskOption) => (
              <button
                key={taskOption.id}
                type="button"
                className={task === taskOption.id ? 'load-chip active' : 'load-chip'}
                onClick={() => setTask(taskOption.id)}
              >
                {taskOption.label}
              </button>
            ))}
          </div>
          <SettingsPanel
            windowSec={windowSec}
            onWindowSec={setWindowSec}
            kdeBandwidth={kdeBandwidth}
            onKdeBandwidth={setKdeBandwidth}
            kdeMaxDistance={kdeMaxDistance}
            onKdeMaxDistance={setKdeMaxDistance}
            sigWindowOnly={sigWindowOnly}
            onSigWindowOnly={setSigWindowOnly}
            showReferenceSelector={showReferenceSelector}
            onShowReferenceSelector={setShowReferenceSelector}
            showVennOverSelector={showVennOverSelector}
            onShowVennOverSelector={setShowVennOverSelector}
            colorDirection={colorDirection}
            onColorDirection={setColorDirection}
            brainOpacity={brainOpacity}
            onBrainOpacity={setBrainOpacity}
            electrodeSizeScale={electrodeSizeScale}
            onElectrodeSizeScale={setElectrodeSizeScale}
            phases={data.metadata?.phases ?? []}
            phaseBounds={phaseBounds}
            onPhaseBound={setPhaseBound}
          />
        </div>
      </header>

      <main className="dashboard">
        <aside className="panel venn-panel">
          <PanelTitle
            icon={<Activity size={18} />}
            title={`${spec?.axis === 'condition' ? 'Condition' : 'Phase'} overlap selector`}
          />
          <VariantSelector
            spec={spec}
            options={variantOptions}
            loading={variantLoading}
            onChange={updateVariant}
            showReference={showReferenceSelector}
            showVennOver={showVennOverSelector}
          />
          <VennPanel
            vennPhases={vennPhases}
            regions={vennRegions}
            availableSubjects={availableSubjects}
            selectedSubjects={selectedSubjects}
            onToggleSubject={(subject) => {
              toggleSubject(subject);
              clearSelectedElectrode();
            }}
            onSelectAllSubjects={() => {
              selectAllSubjects();
              clearSelectedElectrode();
            }}
            onDeselectAllSubjects={() => {
              deselectAllSubjects();
              clearSelectedElectrode();
            }}
            selectedRegionIds={selectedRegionIds}
            onTogglePhase={(phase) => {
              setVennPhases((current) => {
                if (current.includes(phase)) {
                  if (current.length <= VENN_MIN_PHASES) return current;
                  return current.filter((item) => item !== phase);
                }
                if (current.length >= VENN_MAX_PHASES) return current;
                return PHASES.filter((item) => current.includes(item) || item === phase);
              });
            }}
            onSelect={(id) => {
              selectRegion(id);
            }}
          />
        </aside>

        <section className="panel brain-panel">
          <PanelTitle icon={<Brain size={18} />} title="Cortical HGA map" />
          {gridConditions.length > 1 && (
            <div className="load-selector brain-condition-picker">
              <span className="load-selector-label">Map condition</span>
              {gridConditions.map((condition) => (
                <button
                  key={condition}
                  type="button"
                  className={activeMapCondition === condition ? 'load-chip active' : 'load-chip'}
                  onClick={() => setSelectedMapCondition(condition)}
                >
                  <span className="waveform-legend-dot" style={{ background: phaseColor(condition) }} />
                  {condition}
                </button>
              ))}
            </div>
          )}
          <BrainViewer
            electrodes={mapElectrodes}
            metadata={metadataForMap}
            vennPhases={vennPhases}
            selectedLoad={selectedLoad}
            kdeBandwidth={Number(kdeBandwidth) || KDE_BANDWIDTH}
            kdeMaxDistance={Number(kdeMaxDistance) || KDE_MAX_DISTANCE}
            colorDirection={colorDirection}
            brainOpacity={brainOpacity}
            electrodeSizeScale={electrodeSizeScale}
            selectedIds={roiFilteredIds}
            selectedElectrodeId={selectedElectrodeId}
            hoveredId={hoveredId}
            playingPhase={playingPhase}
            isPlaying={isPlaying}
            animationFrameIdx={animationFrameIdx}
            animationTime={animationTime}
            animationScale={animationScale}
            animationFrames={playingPhase ? animationCache[playingPhase]?.frames : null}
            liveHgaByElectrodeId={liveHgaByElectrodeId}
            selectionEmpty={selectionEmpty}
            awaitingKdeRender={awaitingKdeRender}
            kdeFrameCacheStatus={kdeFrameCacheStatus}
            kdePreRenderToken={kdePreRenderToken}
            onFrameCacheStatus={handleFrameCacheStatus}
            onBrainViewModeChange={setBrainViewMode}
            onHover={setHoveredId}
            onSelect={selectElectrode}
          />
        </section>

        <aside className="panel detail-panel">
          <PanelTitle icon={<Info size={18} />} title="Selection details" />
          <DetailPanel
            summary={selectedSummary}
            selectedRegions={selectedRegions}
            selectedElectrode={selectedElectrode}
            tableElectrodes={tableElectrodes}
            roiBarItems={roiBarItems}
            availableRois={availableRois}
            enabledRois={enabledRois}
            selectionEmpty={selectionEmpty}
            onToggleRoi={toggleRoi}
            onEnableAllRois={enableAllRois}
            onDeselectAllRois={deselectAllRois}
            tracesLoading={tracesLoading}
            tracesLoadProgress={tracesLoadProgress}
          />
        </aside>
      </main>

      <section className="panel waveform-panel">
        <PanelTitle
          icon={<Activity size={18} />}
          title="HGA time courses"
        />
        <WaveformPanel
          electrode={selectedElectrode}
          summary={selectedSummary}
          electrodes={tableElectrodes}
          grid={grid}
          sigSets={sigSets}
          conditions={gridConditions}
          gridLoading={gridLoading}
          panelPhases={activePanelPhases}
          availablePhases={gridPhases}
          phaseLabels={data.metadata?.phase_labels ?? {}}
          onTogglePanelPhase={togglePanelPhase}
          overlayIsDiff={spec?.datatype === 'diff'}
          expandable={spec?.datatype === 'diff' && gridHasCondition}
          playbackSpeed={playbackSpeed}
          onPlaybackSpeed={setPlaybackSpeed}
          variantKey={spec ? JSON.stringify(spec) : 'v'}
          electrodesKey={tableElectrodesKey}
          memberBounds={panelPhaseBounds}
          selectedLoad={selectedLoad}
          animationCache={animationCache}
          animationLoadingPhase={animationLoadingPhase}
          canPlay={canPlay}
          selectionEmpty={selectionEmpty}
          playingPhase={playingPhase}
          isPlaying={isPlaying}
          awaitingKdeRender={awaitingKdeRender}
          renderProgress={renderProgress}
          animationFrameIdx={animationFrameIdx}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
        />
      </section>
    </div>
      )}
    </TourHost>
  );
}

function TourHost({ children, enabled = true }) {
  const tour = useOnboardingTour({ enabled });
  return children(tour);
}
