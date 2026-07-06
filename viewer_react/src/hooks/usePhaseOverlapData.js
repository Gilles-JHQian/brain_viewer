import { useEffect, useMemo, useState } from 'react';
import {
  loadTracesForSubjects,
  loadVariant,
  loadViewerBootstrap,
  specMembers,
  defaultVariantSpec,
} from '../data/phaseOverlapStore.js';
import { applyVennAxisConfig, vennAxisConfig } from '../constants/phaseConfig.js';
import { TASKS, DEFAULT_TASK_ID, taskById } from '../constants/tasks.js';

const BOOTSTRAP_LOAD_WEIGHT = 0.15;
const TRACES_LOAD_WEIGHT = 0.85;

const STAGE_LABELS = {
  manifest: 'Loading viewer metadata…',
  electrodes: 'Loading electrode catalog…',
  traces: 'Loading HGA traces…',
};

export default function usePhaseOverlapData() {
  // Which dataset ("task") is loaded. Switching it re-points the store's data base
  // and reloads the whole bootstrap (manifest + electrodes + default variant).
  const [task, setTask] = useState(DEFAULT_TASK_ID);
  const [bootstrap, setBootstrap] = useState(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapProgress, setBootstrapProgress] = useState({
    stage: 'manifest',
    completed: 0,
    total: 2,
  });
  const [traces, setTraces] = useState({});
  const [tracesLoading, setTracesLoading] = useState(false);
  const [tracesLoadStarted, setTracesLoadStarted] = useState(false);
  const [tracesLoadProgress, setTracesLoadProgress] = useState({
    completed: 0,
    total: 0,
    progress: 0,
  });
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [selectedSubjects, setSelectedSubjects] = useState(() => new Set());

  // Variant spec ({reference,datatype,diffType,direction,axis,fixedPhase,fixedCondition})
  // selection + on-demand reload.
  const [spec, setSpec] = useState(null);
  const [variantData, setVariantData] = useState(null);
  const [variantLoading, setVariantLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Reset all per-task state so the new task loads fresh (and the initial-load
    // screen is shown again during the switch) rather than mixing datasets.
    setBootstrap(null);
    setSpec(null);
    setVariantData(null);
    setTraces({});
    setTracesLoadStarted(false);
    setInitialLoadComplete(false);
    setBootstrapLoading(true);
    setLoadError(null);
    setBootstrapProgress({ stage: 'manifest', completed: 0, total: 2 });

    loadViewerBootstrap({
      dataBase: taskById(task).dataBase,
      onProgress: (status) => {
        if (!cancelled) setBootstrapProgress(status);
      },
    })
      .then((payload) => {
        if (!cancelled) setBootstrap(payload);
      })
      .catch((error) => {
        console.error('Failed to load phase overlap data', error);
        if (!cancelled) setLoadError(error?.message || 'Failed to load viewer data');
      })
      .finally(() => {
        if (!cancelled) setBootstrapLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [task]);

  const metadata = bootstrap?.metadata ?? null;
  const regions = bootstrap?.regions ?? [];
  const manifest = bootstrap?.manifest ?? null;
  const layout = bootstrap?.layout ?? null;
  const isVariantLayout = layout === 'variant';

  const diffTypesMeta = metadata?.diff_types ?? {};

  // Initialize the spec from the bootstrap's default once available.
  useEffect(() => {
    if (!isVariantLayout || spec || !metadata) return;
    setSpec(bootstrap?.activeSpec ?? defaultVariantSpec(metadata));
  }, [isVariantLayout, spec, metadata, bootstrap]);

  // Venn/waveform members for the active axis (synchronous from spec — drives the
  // selection pipeline reset and the in-place axis config below).
  const vennMembers = useMemo(
    () => (isVariantLayout && spec && metadata ? specMembers(metadata, spec) : []),
    [isVariantLayout, spec, metadata],
  );

  const specKey = useMemo(() => (spec ? JSON.stringify(spec) : null), [spec]);
  const loadedSpecKey = useMemo(() => {
    const loaded = variantData?.spec ?? bootstrap?.activeSpec ?? null;
    return loaded ? JSON.stringify(loaded) : null;
  }, [variantData, bootstrap]);

  // Reload electrodes + traces (with member flags) when the spec changes; reconfigure the
  // axis members in place first so the Venn/waveform/animation render over the right members.
  useEffect(() => {
    if (!isVariantLayout || !manifest || !spec) return undefined;
    if (specKey === loadedSpecKey) return undefined;
    let cancelled = false;
    applyVennAxisConfig(vennAxisConfig(metadata, spec.axis, spec.fixedPhase));
    setVariantLoading(true);
    loadVariant(manifest, spec)
      .then((result) => {
        if (!cancelled) setVariantData(result);
      })
      .catch((error) => {
        console.error('Failed to load variant', spec, error);
        if (!cancelled) setLoadError(error?.message || 'Failed to load variant');
      })
      .finally(() => {
        if (!cancelled) setVariantLoading(false);
      });
    return () => { cancelled = true; };
  }, [isVariantLayout, manifest, spec, specKey, loadedSpecKey, metadata]);

  // Effective electrodes/traces: the switched variant if loaded, else the bootstrap default.
  const electrodes = useMemo(() => {
    if (isVariantLayout) return variantData?.electrodes ?? bootstrap?.electrodes ?? [];
    return bootstrap?.electrodes ?? [];
  }, [isVariantLayout, variantData, bootstrap]);

  const variantTraces = isVariantLayout
    ? (variantData?.traces ?? bootstrap?.traces ?? {})
    : null;

  const electrodeById = useMemo(() => {
    const map = new Map();
    electrodes.forEach((electrode) => map.set(electrode.id, electrode));
    return map;
  }, [electrodes]);

  const availableSubjects = useMemo(() => {
    const fromMeta = metadata?.subjects;
    if (fromMeta?.length) return [...fromMeta].sort();
    return [...new Set(electrodes.map((electrode) => electrode.subject))].sort();
  }, [metadata, electrodes]);

  const availableSubjectsKey = availableSubjects.join('|');

  useEffect(() => {
    if (!availableSubjects.length) return;
    setSelectedSubjects(new Set(availableSubjects));
  }, [availableSubjectsKey]);

  const selectedSubjectsKey = useMemo(
    () => [...selectedSubjects].sort().join('|'),
    [selectedSubjects, availableSubjectsKey],
  );

  useEffect(() => {
    if (!bootstrap) return undefined;
    let cancelled = false;

    if (bootstrap.layout !== 'split') {
      setTraces(isVariantLayout ? variantTraces : (bootstrap.traces || {}));
      setTracesLoading(false);
      setTracesLoadProgress({ completed: 0, total: 0, progress: 0 });
      return undefined;
    }

    const subjects = [...selectedSubjects];
    if (!subjects.length) {
      setTraces({});
      setTracesLoading(false);
      setTracesLoadProgress({ completed: 0, total: 0, progress: 0 });
      return undefined;
    }

    setTracesLoadStarted(true);
    setTracesLoading(true);
    setTracesLoadProgress({ completed: 0, total: subjects.length, progress: 0 });
    loadTracesForSubjects(manifest, subjects, {}, (status) => {
      if (!cancelled) setTracesLoadProgress(status);
    })
      .then((merged) => {
        if (!cancelled) setTraces(merged);
      })
      .catch((error) => {
        console.error('Failed to load subject traces', error);
        if (!cancelled) {
          setTraces({});
          setLoadError(error?.message || 'Failed to load subject traces');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTracesLoading(false);
          setTracesLoadProgress((current) => (
            current.total > 0
              ? { completed: current.total, total: current.total, progress: 1 }
              : { completed: 0, total: 0, progress: 0 }
          ));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrap, manifest, selectedSubjectsKey, isVariantLayout, variantTraces]);

  useEffect(() => {
    if (initialLoadComplete) return undefined;
    if (bootstrapLoading || !bootstrap) return undefined;
    if (bootstrap.layout !== 'split') {
      setInitialLoadComplete(true);
      return undefined;
    }
    if (tracesLoadStarted && !tracesLoading) {
      setInitialLoadComplete(true);
    }
    return undefined;
  }, [
    initialLoadComplete,
    bootstrapLoading,
    bootstrap,
    tracesLoadStarted,
    tracesLoading,
  ]);

  const isInitialLoading = !initialLoadComplete;

  const initialLoadStage = useMemo(() => {
    if (initialLoadComplete) return 'ready';
    if (bootstrapLoading || !bootstrap) return bootstrapProgress.stage;
    if (layout === 'split') return 'traces';
    return 'electrodes';
  }, [
    initialLoadComplete,
    bootstrapLoading,
    bootstrap,
    bootstrapProgress.stage,
    layout,
  ]);

  const initialLoadProgress = useMemo(() => {
    if (initialLoadComplete) return 1;
    if (bootstrapLoading || !bootstrap) {
      const bootstrapFraction = bootstrapProgress.total > 0
        ? bootstrapProgress.completed / bootstrapProgress.total
        : 0;
      return bootstrapFraction * BOOTSTRAP_LOAD_WEIGHT;
    }
    if (layout !== 'split') return 1;
    return BOOTSTRAP_LOAD_WEIGHT + tracesLoadProgress.progress * TRACES_LOAD_WEIGHT;
  }, [
    initialLoadComplete,
    bootstrapLoading,
    bootstrap,
    bootstrapProgress,
    layout,
    tracesLoadProgress.progress,
  ]);

  const initialLoadLabel = STAGE_LABELS[initialLoadStage] ?? STAGE_LABELS.traces;

  const subjectFilteredElectrodes = useMemo(
    () => electrodes.filter((electrode) => selectedSubjects.has(electrode.subject)),
    [electrodes, selectedSubjectsKey],
  );

  const toggleSubject = (subject) => {
    setSelectedSubjects((current) => {
      const next = new Set(current);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  };

  const selectAllSubjects = () => {
    setSelectedSubjects(new Set(availableSubjects));
  };

  const deselectAllSubjects = () => {
    setSelectedSubjects(new Set());
  };

  // A datatype carries a condition dimension (so condition-axis Venn is meaningful) when it
  // is zscore, or a diff type that needs a condition. condition-diff has no condition dim.
  const datatypeHasCondition = (datatype, diffType) => (
    datatype === 'zscore' || !!diffTypesMeta?.[diffType]?.needs_condition
  );

  // --- variant selector options (consumed by the top-bar VariantSelector) ---
  const variantOptions = useMemo(() => {
    if (!isVariantLayout || !metadata || !spec) return null;
    // For a diff whose config restricts phases, only offer those as the fixed phase.
    const diffPhases = spec.datatype === 'diff'
      ? diffTypesMeta?.[spec.diffType]?.phases
      : null;
    const phaseOptions = (Array.isArray(diffPhases) && diffPhases.length)
      ? (metadata.phases ?? []).filter((phase) => diffPhases.includes(phase))
      : (metadata.phases ?? []);
    return {
      references: metadata.references ?? [],
      datatypes: metadata.datatypes ?? ['zscore', 'diff'],
      conditions: metadata.conditions ?? [],
      phases: phaseOptions,
      diffTypes: Object.keys(diffTypesMeta),
      diffTypesMeta,
      // Always expose both axes; condition-overlap is disabled (not hidden) when the
      // datatype has no condition dimension (condition-diff).
      axes: ['phase', 'condition'],
      conditionAxisDisabled: !datatypeHasCondition(spec.datatype, spec.diffType),
    };
  }, [isVariantLayout, metadata, spec, diffTypesMeta]);

  // Apply a partial change to the spec, filling defaults so the result is valid:
  //  - switching to diff picks a diff type + direction (+ condition if needed)
  //  - a datatype with no condition dim forces the phase axis
  //  - switching axis ensures the fixed phase/condition are set
  const updateVariant = (patch) => {
    setSpec((current) => {
      const next = { ...current, ...patch };
      if (next.datatype === 'diff') {
        if (!next.diffType || !diffTypesMeta[next.diffType]) {
          next.diffType = Object.keys(diffTypesMeta)[0] ?? null;
        }
        const dirs = diffTypesMeta[next.diffType]?.directions ?? [];
        if (!dirs.includes(next.direction)) next.direction = dirs[0] ?? null;
        // A diff type may cover only a subset of phases (e.g. UP lexicality omits
        // Cue); keep the fixed phase valid so the view isn't empty on switch.
        const dphases = diffTypesMeta[next.diffType]?.phases;
        if (Array.isArray(dphases) && dphases.length && !dphases.includes(next.fixedPhase)) {
          next.fixedPhase = dphases[0];
        }
      }
      if (!datatypeHasCondition(next.datatype, next.diffType)) {
        next.axis = 'phase';
      }
      if (!next.fixedPhase) next.fixedPhase = metadata?.phases?.[0] ?? null;
      if (!next.fixedCondition) next.fixedCondition = metadata?.conditions?.[0] ?? null;
      return next;
    });
  };

  // Surface the active variant's HGA scale to BrainViewer (it reads metadata.hga_size_scale).
  const hgaScale = variantData?.hgaScale ?? bootstrap?.hgaScale ?? null;
  const metadataForView = useMemo(
    () => (metadata ? { ...metadata, hga_size_scale: hgaScale } : null),
    [metadata, hgaScale],
  );

  const data = useMemo(
    () => (bootstrap
      ? {
        metadata: metadataForView,
        electrodes,
        regions,
        traces,
        manifest,
        layout,
      }
      : null),
    [bootstrap, metadataForView, electrodes, regions, traces, manifest, layout],
  );

  return {
    // task switching
    task,
    setTask,
    tasks: TASKS,
    data,
    isInitialLoading,
    initialLoadComplete,
    initialLoadProgress,
    initialLoadStage,
    initialLoadLabel,
    loadError,
    bootstrapProgress,
    tracesLoading,
    tracesLoadProgress,
    electrodeById,
    availableSubjects,
    availableSubjectsKey,
    selectedSubjects,
    subjectFilteredElectrodes,
    toggleSubject,
    selectAllSubjects,
    deselectAllSubjects,
    // variant selection
    spec,
    vennMembers,
    variantOptions,
    variantLoading,
    updateVariant,
  };
}
