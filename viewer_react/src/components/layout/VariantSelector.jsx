import React from 'react';
import {
  Database, Layers, GitCompare, Activity, Shuffle, Loader2,
} from 'lucide-react';
import { glmTypeLabel } from '../../constants/glm.js';

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
  showRerpPhase = true,
}) {
  if (!spec || !options) return null;

  const {
    references, datatypes, conditions, phases, diffTypes, diffTypesMeta, axes,
    conditionAxisDisabled, rerpTypes = [], rerpPhases = [], rerpPhaseLabels = {},
  } = options;
  const isDiff = spec.datatype === 'diff';
  const isRerp = spec.datatype === 'rerp';
  const directions = isDiff ? (diffTypesMeta?.[spec.diffType]?.directions ?? []) : [];
  const hasCondition = !isDiff || !!diffTypesMeta?.[spec.diffType]?.needs_condition;

  const datatypeLabel = (dt) => ({ zscore: 'Z-score', diff: 'Difference', rerp: 'GLM' }[dt] ?? dt);
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
          options={rerpTypes}
          value={spec.rerpType}
          onSelect={(rerpType) => onChange({ rerpType })}
          formatLabel={glmTypeLabel}
        />
      )}
      {/* GLM phase picks which phase's significance defines the per-task Venn. Only shown
          when the type is significance-driven (lexicality); average has no Venn. */}
      {isRerp && showRerpPhase && rerpPhases.length > 1 && (
        <ChipGroup
          icon={<Activity size={14} />}
          label="Phase"
          options={rerpPhases}
          value={spec.fixedPhase}
          onSelect={(fixedPhase) => onChange({ fixedPhase })}
          formatLabel={(p) => (rerpPhaseLabels?.[p] ?? p)}
        />
      )}
      {/* GLM's phase axis = the type's predictors (shown as time-course columns / Venn
          circles), so the "Venn over" toggle is hidden — only the fixed Condition applies. */}
      {showVennOver && !isRerp && axes?.length > 1 && (
        <ChipGroup
          icon={<Shuffle size={14} />}
          label="Venn over"
          options={axes}
          value={spec.axis}
          onSelect={(axis) => onChange({ axis })}
          formatLabel={axisLabel}
          disabled={conditionAxisDisabled ? ['condition'] : []}
          disabledTitle="This difference is already over conditions"
        />
      )}
      {/* The fixed dimension is the one the Venn is NOT iterating over. */}
      {spec.axis === 'condition' && !isRerp && (
        <ChipGroup
          icon={<Activity size={14} />}
          label="Phase"
          options={phases}
          value={spec.fixedPhase}
          onSelect={(fixedPhase) => onChange({ fixedPhase })}
        />
      )}
      {/* GLM fixes the condition to the brain panel's Map-condition picker, so no Condition
          chip here; other phase-axis datatypes still choose their fixed condition. */}
      {spec.axis === 'phase' && hasCondition && !isRerp && (
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
