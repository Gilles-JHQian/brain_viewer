import { useEffect, useMemo, useState } from 'react';
import {
  loadTracesForSubjects,
  loadVariant,
  loadViewerBootstrap,
} from '../data/phaseOverlapStore.js';

const BOOTSTRAP_LOAD_WEIGHT = 0.15;
const TRACES_LOAD_WEIGHT = 0.85;

const STAGE_LABELS = {
  manifest: 'Loading viewer metadata…',
  electrodes: 'Loading electrode catalog…',
  traces: 'Loading HGA traces…',
};

// --- variant key <-> selection helpers (mirror build_viewer_assets.py::_variant_key) ---
// zscore:  ref|zscore|<condition>
// diff:    ref|diff|<diffType>|<direction>[|<condition>]   (condition only if needs_condition)
export function buildVariantKey(sel, diffTypesMeta) {
  if (!sel) return null;
  if (sel.datatype === 'zscore') {
    return [sel.reference, 'zscore', sel.condition].join('|');
  }
  const parts = [sel.reference, 'diff', sel.diffType, sel.direction];
  if (diffTypesMeta?.[sel.diffType]?.needs_condition) parts.push(sel.condition);
  return parts.join('|');
}

export function parseVariantKey(key, diffTypesMeta) {
  const p = String(key).split('|');
  const [reference, datatype] = p;
  if (datatype === 'zscore') {
    return { reference, datatype, condition: p[2], diffType: null, direction: null };
  }
  const diffType = p[2];
  const direction = p[3];
  const needsCond = diffTypesMeta?.[diffType]?.needs_condition;
  return { reference, datatype, diffType, direction, condition: needsCond ? p[4] : null };
}

export default function usePhaseOverlapData() {
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

  // Variant (reference/datatype/diff/condition) selection + on-demand reload.
  const [variantSel, setVariantSel] = useState(null);
  const [variantData, setVariantData] = useState(null);
  const [variantLoading, setVariantLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBootstrapLoading(true);
    setLoadError(null);
    setBootstrapProgress({ stage: 'manifest', completed: 0, total: 2 });

    loadViewerBootstrap({
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
  }, []);

  const metadata = bootstrap?.metadata ?? null;
  const regions = bootstrap?.regions ?? [];
  const manifest = bootstrap?.manifest ?? null;
  const layout = bootstrap?.layout ?? null;
  const isVariantLayout = layout === 'variant';

  const diffTypesMeta = metadata?.diff_types ?? {};

  // Initialize variant selection from the manifest's default variant once available.
  useEffect(() => {
    if (!isVariantLayout || variantSel || !metadata?.default_variant) return;
    setVariantSel(parseVariantKey(metadata.default_variant, diffTypesMeta));
  }, [isVariantLayout, variantSel, metadata, diffTypesMeta]);

  // The current selection as a key, validated against the manifest's variant table.
  const variantKey = useMemo(() => {
    if (!isVariantLayout) return null;
    const key = buildVariantKey(variantSel, diffTypesMeta);
    if (key && manifest?.variants?.[key]) return key;
    return metadata?.default_variant ?? null;
  }, [isVariantLayout, variantSel, diffTypesMeta, manifest, metadata]);

  const loadedVariantKey = variantData?.variantKey ?? bootstrap?.activeVariant ?? null;

  // Reload electrodes + traces (with this variant's phase_flags) when the key changes.
  useEffect(() => {
    if (!isVariantLayout || !manifest || !variantKey) return undefined;
    if (variantKey === loadedVariantKey) return undefined;
    let cancelled = false;
    setVariantLoading(true);
    loadVariant(manifest, variantKey, metadata.phases)
      .then((result) => {
        if (!cancelled) setVariantData(result);
      })
      .catch((error) => {
        console.error('Failed to load variant', variantKey, error);
        if (!cancelled) setLoadError(error?.message || 'Failed to load variant');
      })
      .finally(() => {
        if (!cancelled) setVariantLoading(false);
      });
    return () => { cancelled = true; };
  }, [isVariantLayout, manifest, variantKey, loadedVariantKey, metadata]);

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

  // --- variant selector options + setters (consumed by the top-bar VariantSelector) ---
  const variantOptions = useMemo(() => {
    if (!isVariantLayout || !metadata) return null;
    return {
      references: metadata.references ?? [],
      datatypes: metadata.datatypes ?? ['zscore', 'diff'],
      conditions: metadata.conditions ?? [],
      diffTypes: Object.keys(diffTypesMeta),
      diffTypesMeta,
    };
  }, [isVariantLayout, metadata, diffTypesMeta]);

  // Apply a partial change to the selection, filling sensible defaults so the resulting
  // combination is valid (e.g. switching to diff picks a diff type + direction).
  const updateVariant = (patch) => {
    setVariantSel((current) => {
      const next = { ...current, ...patch };
      if (next.datatype === 'diff') {
        if (!next.diffType || !diffTypesMeta[next.diffType]) {
          next.diffType = Object.keys(diffTypesMeta)[0] ?? null;
        }
        const dirs = diffTypesMeta[next.diffType]?.directions ?? [];
        if (!dirs.includes(next.direction)) next.direction = dirs[0] ?? null;
        if (diffTypesMeta[next.diffType]?.needs_condition && !next.condition) {
          next.condition = metadata?.conditions?.[0] ?? null;
        }
      }
      if (next.datatype === 'zscore' && !next.condition) {
        next.condition = metadata?.conditions?.[0] ?? null;
      }
      return next;
    });
  };

  const data = useMemo(
    () => (bootstrap
      ? {
        metadata,
        electrodes,
        regions,
        traces,
        manifest,
        layout,
      }
      : null),
    [bootstrap, metadata, electrodes, regions, traces, manifest, layout],
  );

  return {
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
    variantSel,
    variantKey,
    variantOptions,
    variantLoading,
    updateVariant,
  };
}
