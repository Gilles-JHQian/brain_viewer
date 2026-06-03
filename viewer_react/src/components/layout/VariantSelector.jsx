import React from 'react';
import { Database, Layers, GitCompare, Activity, Loader2 } from 'lucide-react';

function ChipGroup({ icon, label, options, value, onSelect, formatLabel }) {
  if (!options?.length) return null;
  return (
    <div className="load-selector" data-tour={`variant-${label}`}>
      <span className="load-selector-label">{icon} {label}</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? 'load-chip active' : 'load-chip'}
          onClick={() => onSelect(option)}
        >
          {formatLabel ? formatLabel(option) : option}
        </button>
      ))}
    </div>
  );
}

// Orthogonal "which dataset variant" selectors (reference / datatype / diff-type /
// direction / condition). These re-key the data fetch; they are NOT Venn axes.
export default function VariantSelector({ selection, options, loading, onChange }) {
  if (!selection || !options) return null;

  const { references, datatypes, conditions, diffTypes, diffTypesMeta } = options;
  const isDiff = selection.datatype === 'diff';
  const directions = isDiff
    ? (diffTypesMeta?.[selection.diffType]?.directions ?? [])
    : [];
  const needsCondition = !isDiff
    || !!diffTypesMeta?.[selection.diffType]?.needs_condition;

  const datatypeLabel = (dt) => (dt === 'zscore' ? 'Z-score' : 'Difference');

  return (
    <div className="variant-selector">
      <ChipGroup
        icon={<Database size={14} />}
        label="Reference"
        options={references}
        value={selection.reference}
        onSelect={(reference) => onChange({ reference })}
      />
      <ChipGroup
        icon={<Layers size={14} />}
        label="Type"
        options={datatypes}
        value={selection.datatype}
        onSelect={(datatype) => onChange({ datatype })}
        formatLabel={datatypeLabel}
      />
      {isDiff && (
        <ChipGroup
          icon={<GitCompare size={14} />}
          label="Diff"
          options={diffTypes}
          value={selection.diffType}
          onSelect={(diffType) => onChange({ diffType })}
        />
      )}
      {isDiff && (
        <ChipGroup
          icon={<GitCompare size={14} />}
          label="Direction"
          options={directions}
          value={selection.direction}
          onSelect={(direction) => onChange({ direction })}
        />
      )}
      {needsCondition && (
        <ChipGroup
          icon={<Activity size={14} />}
          label="Condition"
          options={conditions}
          value={selection.condition}
          onSelect={(condition) => onChange({ condition })}
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
