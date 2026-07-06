import React, { useCallback, useMemo, useState } from 'react';
import { Activity, Brain, Info, FlaskConical } from 'lucide-react';
import { PHASES, defaultPhaseBounds } from './constants/phases.js';
import { VENN_MAX_PHASES, VENN_MIN_PHASES } from './constants/venn.js';
import { DEFAULT_BRAIN_VIEW_MODE } from './constants/brain.js';
import usePhaseOverlapData from './hooks/usePhaseOverlapData.js';
import useSelectionPipeline from './hooks/useSelectionPipeline.js';
import useAnimationPlayback from './hooks/useAnimationPlayback.js';
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
  // Per-phase time-course x-axis bounds (user overrides; defaults fill the rest).
  const [phaseBounds, setPhaseBounds] = useState({});
  const setPhaseBound = useCallback((phase, key, value) => {
    setPhaseBounds((prev) => ({
      ...prev,
      [phase]: { ...(prev[phase] ?? defaultPhaseBounds(phase)), [key]: Number(value) },
    }));
  }, []);
  const [brainViewMode, setBrainViewMode] = useState(DEFAULT_BRAIN_VIEW_MODE);
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

  // Time-course / animation x-axis bounds per Venn member. Phase axis -> the member's own
  // phase bounds; condition axis -> all members share the fixed phase's bounds.
  const memberBounds = useMemo(() => {
    if (!spec) return null;
    const out = {};
    (vennMembers || []).forEach((member) => {
      const phaseKey = spec.axis === 'condition' ? spec.fixedPhase : member;
      out[member] = phaseBounds[phaseKey] ?? defaultPhaseBounds(phaseKey);
    });
    return out;
  }, [spec, vennMembers, phaseBounds]);

  const kdeRenderRequired = brainViewMode === 'kde';

  const {
    playingPhase,
    isPlaying,
    animationFrameIdx,
    animationCache,
    animationLoadingPhase,
    animationLoadProgress,
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
    traces: data?.traces,
    selectedLoad,
    selectedRegionIds,
    vennPhases,
    availableSubjectsKey,
    selectedSubjects,
    kdeRenderRequired,
    kdeFrameCacheStatus,
    windowSec: Number(windowSec) || ANIM_WINDOW_SEC,
    gateByWindow: sigWindowOnly,
    memberBounds,
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
          <BrainViewer
            electrodes={subjectFilteredElectrodes}
            metadata={data.metadata}
            vennPhases={vennPhases}
            selectedLoad={selectedLoad}
            kdeBandwidth={Number(kdeBandwidth) || KDE_BANDWIDTH}
            kdeMaxDistance={Number(kdeMaxDistance) || KDE_MAX_DISTANCE}
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
          title={spec?.axis === 'condition' ? 'Per-condition HGA time courses' : 'Per-phase HGA time courses'}
        />
        <WaveformPanel
          electrode={selectedElectrode}
          summary={selectedSummary}
          electrodes={tableElectrodes}
          traces={data.traces || {}}
          variantKey={spec ? JSON.stringify(spec) : 'v'}
          electrodesKey={tableElectrodesKey}
          memberBounds={memberBounds}
          layout={data.layout}
          tracesLoading={tracesLoading}
          tracesLoadProgress={tracesLoadProgress}
          initialLoadComplete={initialLoadComplete}
          selectedLoad={selectedLoad}
          animationCache={animationCache}
          animationLoadingPhase={animationLoadingPhase}
          animationLoadProgress={animationLoadProgress}
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
