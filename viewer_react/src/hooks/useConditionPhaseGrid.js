import { useEffect, useMemo, useState } from 'react';
import { gridAxesForSpec, loadConditionPhaseGrid } from '../data/phaseOverlapStore.js';

// Load the full phase x condition grid of z-score (or diff) traces for the active spec.
// The grid covers the spec's ENTIRE phase/condition axes, so toggling which phases the
// time-course panel shows (a subset) never triggers a refetch. It powers both the
// condition-overlay time courses (all conditions) and the brain-map condition slice.
export default function useConditionPhaseGrid({ manifest, metadata, spec }) {
  const [grid, setGrid] = useState(null);
  const [sigSets, setSigSets] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);

  const { phases, conditions, hasCondition } = useMemo(
    () => (metadata && spec
      ? gridAxesForSpec(metadata, spec)
      : { phases: [], conditions: [], hasCondition: false }),
    [metadata, spec],
  );
  const phasesKey = phases.join('|');
  const conditionsKey = conditions.join('|');

  useEffect(() => {
    if (!manifest || !spec || !phases.length || !conditions.length) {
      setGrid(null);
      setSigSets(null);
      return undefined;
    }
    let cancelled = false;
    setGridLoading(true);
    loadConditionPhaseGrid(manifest, spec, phases, conditions)
      .then((result) => {
        if (cancelled) return;
        setGrid(result.grid);
        setSigSets(result.sigSets);
      })
      .catch((error) => {
        console.error('Failed to load condition-phase grid', spec, error);
        if (!cancelled) {
          setGrid(null);
          setSigSets(null);
        }
      })
      .finally(() => {
        if (!cancelled) setGridLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, spec, phasesKey, conditionsKey]);

  return {
    grid,
    sigSets,
    gridConditions: conditions,
    gridPhases: phases,
    gridHasCondition: hasCondition,
    gridLoading,
  };
}
