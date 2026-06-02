import React from 'react';
import { PHASES, PHASE_LABELS } from '../../constants/phases.js';
import Metric from './Metric.jsx';
import RoiBarChart from './RoiBarChart.jsx';
import PanelEmptyState from '../layout/PanelEmptyState.jsx';
import TraceLoadProgress from '../ui/TraceLoadProgress.jsx';

export default function DetailPanel({
  summary,
  selectedRegions,
  selectedElectrode,
  tableElectrodes,
  roiBarItems,
  availableRois,
  enabledRois,
  selectionEmpty = null,
  onToggleRoi,
  onEnableAllRois,
  onDeselectAllRois,
  tracesLoading = false,
  tracesLoadProgress = { completed: 0, total: 0, progress: 0 },
}) {
  const subjectCount = new Set(tableElectrodes.map((electrode) => electrode.subject)).size;
  const enabledRoiCount = availableRois.filter((roi) => enabledRois.has(roi)).length;

  return (
    <div className="detail-content">
      <div className="detail-summary-stack">
        <div className="selected-card">
          <div className="card-kicker">Selected region</div>
          <h2 title={summary.fullLabel}>{summary.shortLabel}</h2>
          <div className="metric-grid">
            <Metric label="Electrodes" value={summary.count || 0} />
            <Metric label="Subjects" value={subjectCount} />
            <Metric label="ROIs" value={enabledRoiCount} />
          </div>
        </div>

        {tracesLoading && (
          <TraceLoadProgress
            compact
            progress={tracesLoadProgress.progress}
            completed={tracesLoadProgress.completed}
            total={tracesLoadProgress.total}
          />
        )}

        <PanelEmptyState emptyState={selectionEmpty} className="detail-empty-state" />

        {selectedRegions.length > 0 && (
          <div className="selected-region-list">
            {selectedRegions.map((region) => (
              <span key={region.id} title={region.label}>{region.label} · {region.count}</span>
            ))}
          </div>
        )}

        {selectedElectrode && (
          <div className="selected-card electrode-card">
            <div className="card-kicker">Selected electrode</div>
            <h3>{selectedElectrode.channel}</h3>
            <p>{selectedElectrode.subject} · {selectedElectrode.roi} · {selectedElectrode.label}</p>
            <div className="phase-tags">
              {PHASES.map((phase) => (
                <span key={phase} className={selectedElectrode.phase_flags[phase] ? 'phase-tag on' : 'phase-tag'}>
                  {PHASE_LABELS[phase]}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {availableRois.length > 0 && (
        <div className="roi-filter" data-tour="roi-filter">
          <div className="roi-filter-header">
            <div className="roi-filter-heading">
              <span className="roi-filter-title">ROI filter</span>
              <span className="roi-filter-meta">
                {enabledRoiCount} of {availableRois.length} shown
              </span>
            </div>
            <div className="roi-filter-actions">
              <button
                type="button"
                className="roi-filter-action"
                onClick={onDeselectAllRois}
                disabled={enabledRoiCount === 0}
              >
                Deselect all
              </button>
              <button
                type="button"
                className="roi-filter-action"
                onClick={onEnableAllRois}
                disabled={enabledRoiCount === availableRois.length}
              >
                Show all
              </button>
            </div>
          </div>
          <RoiBarChart
            items={roiBarItems}
            enabledRois={enabledRois}
            onToggleRoi={onToggleRoi}
          />
          <div className="roi-filter-hint">Click a bar to show or hide that ROI in the brain view.</div>
        </div>
      )}
    </div>
  );
}
