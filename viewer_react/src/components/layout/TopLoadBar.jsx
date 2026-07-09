import React from 'react';

/**
 * Slim progress indicator shown in the empty middle of the topbar while data is
 * lazily loading (after the initial full-screen load). Determinate for trace
 * loads, which report completed/total; an indeterminate animated sweep for
 * variant/grid switches that have no count. Renders an empty (invisible)
 * flex spacer when idle so the topbar layout stays put.
 */
export default function TopLoadBar({
  tracesLoading = false,
  tracesProgress = null,
  variantLoading = false,
  gridLoading = false,
}) {
  const tracesActive = tracesLoading && (tracesProgress?.total ?? 0) > 0;
  const indeterminate = !tracesActive && (variantLoading || gridLoading || tracesLoading);
  const active = tracesActive || indeterminate;

  let label = null;
  let pct = 0;
  if (tracesActive) {
    pct = Math.round(Math.max(0, Math.min(1, tracesProgress.progress ?? 0)) * 100);
    label = `Loading traces · ${tracesProgress.completed}/${tracesProgress.total} · ${pct}%`;
  } else if (indeterminate) {
    label = gridLoading ? 'Loading time courses…' : 'Loading…';
  }

  return (
    <div className="top-loadbar" aria-hidden={!active}>
      {active && (
        <div
          className="top-loadbar-inner"
          role="progressbar"
          aria-label={label || 'Loading'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={tracesActive ? pct : undefined}
          title={label || undefined}
        >
          <div className={`top-loadbar-track${indeterminate ? ' indeterminate' : ''}`}>
            {tracesActive
              ? <div className="top-loadbar-fill" style={{ width: `${pct}%` }} />
              : <div className="top-loadbar-sweep" />}
          </div>
          <span className="top-loadbar-label">{label}</span>
        </div>
      )}
    </div>
  );
}
