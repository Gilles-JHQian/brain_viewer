import React from 'react';
import {
  Database, Layers, GitCompare, Activity, Shuffle, Loader2,
} from 'lucide-react';

function ChipGroup({
  icon, label, options, value, onSelect, formatLabel, disabled = [], disabledTitle,
}) {
  if (!options?.length) return null;
  return (
    <div className="load-selector" data-tour={`variant-${label}`}>
      <span className="load-selector-label">{icon} {label}</span>
      {options.map((option) => {
        const isDisabled = disabled.includes(option);
        return (
          <button
            key={option}
            type="button"
            className={value === option ? 'load-chip active' : 'load-chip'}
            disabled={isDisabled}
            title={isDisabled ? disabledTitle : undefined}
            onClick={() => onSelect(option)}
          >
            {formatLabel ? formatLabel(option) : option}
          </button>
        );
      })}
    </div>
  );
}

// Orthogonal "which dataset variant" selectors plus the Venn axis (phase vs condition).
// These re-key the data fetch; the axis decides whether the Venn/waveform members are
// phases (fixed condition) or conditions (fixed phase).
export default function VariantSelector({
  spec, options, loading, onChange, showReference = true, showVennOver = true,
}) {
  if (!spec || !options) return null;

  const {
    references, datatypes, conditions, phases, diffTypes, diffTypesMeta, axes,
    conditionAxisDisabled, rerpPredictors = [], rerpLabels = {},
  } = options;
  const isDiff = spec.datatype === 'diff';
  const isRerp = spec.datatype === 'rerp';
  const directions = isDiff ? (diffTypesMeta?.[spec.diffType]?.directions ?? []) : [];
  const hasCondition = !isDiff || !!diffTypesMeta?.[spec.diffType]?.needs_condition;

  const datatypeLabel = (dt) => ({ zscore: 'Z-score', diff: 'Difference', rerp: 'RERP' }[dt] ?? dt);
  const rerpPredictorLabel = (p) => (rerpLabels?.[p] ?? p);
  const axisLabel = (a) => (a === 'condition' ? 'Condition' : 'Phase');
  // Human-readable diff-type chip labels; unknown types fall back to the raw key.
  const diffTypeLabel = (dt) => ({
    condition: 'Condition',
    lexicality: 'Lexicality',
    lexicalityEarly: 'Lexicality (early)',
    lexicalityLate: 'Lexicality (late)',
    neighborhood: 'Neighborhood',
  }[dt] ?? dt);

  return (
    <div className="variant-selector">
      {showReference && (
        <ChipGroup
          icon={<Database size={14} />}
          label="Reference"
          options={references}
          value={spec.reference}
          onSelect={(reference) => onChange({ reference })}
        />
      )}
      <ChipGroup
        icon={<Layers size={14} />}
        label="Type"
        options={datatypes}
        value={spec.datatype}
        onSelect={(datatype) => onChange({ datatype })}
        formatLabel={datatypeLabel}
      />
      {isDiff && (
        <ChipGroup
          icon={<GitCompare size={14} />}
          label="Diff"
          options={diffTypes}
          value={spec.diffType}
          onSelect={(diffType) => onChange({ diffType })}
          formatLabel={diffTypeLabel}
        />
      )}
      {isDiff && (
        <ChipGroup
          icon={<GitCompare size={14} />}
          label="Direction"
          options={directions}
          value={spec.direction}
          onSelect={(direction) => onChange({ direction })}
        />
      )}
      {isRerp && (
        <ChipGroup
          icon={<GitCompare size={14} />}
          label="Predictor"
          options={rerpPredictors}
          value={spec.rerpPredictor}
          onSelect={(rerpPredictor) => onChange({ rerpPredictor })}
          formatLabel={rerpPredictorLabel}
        />
      )}
      {showVennOver && !isRerp && axes?.length > 1 && (
        <ChipGroup
          icon={<Shuffle size={14} />}
          label="Venn over"
          options={axes}
          value={spec.axis}
          onSelect={(axis) => onChange({ axis })}
          formatLabel={axisLabel}
          disabled={isRerp ? ['phase'] : (conditionAxisDisabled ? ['condition'] : [])}
          disabledTitle={isRerp
            ? 'RERP has no phase axis'
            : 'This difference is already over conditions'}
        />
      )}
      {/* The fixed dimension is the one the Venn is NOT iterating over. RERP replaces
          the phase axis with the Predictor dropdown above, so no Phase chip here. */}
      {spec.axis === 'condition' && !isRerp && (
        <ChipGroup
          icon={<Activity size={14} />}
          label="Phase"
          options={phases}
          value={spec.fixedPhase}
          onSelect={(fixedPhase) => onChange({ fixedPhase })}
        />
      )}
      {spec.axis === 'phase' && hasCondition && (
        <ChipGroup
          icon={<Activity size={14} />}
          label="Condition"
          options={conditions}
          value={spec.fixedCondition}
          onSelect={(fixedCondition) => onChange({ fixedCondition })}
        />
      )}
      {loading && (
        <span className="variant-loading" title="Loading variant…">
          <Loader2 size={14} className="spin" />
        </span>
      )}
    </div>
  );
}
