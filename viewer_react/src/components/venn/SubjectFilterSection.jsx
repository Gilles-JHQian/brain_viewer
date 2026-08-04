import React from 'react';
import SubjectDropdown from './SubjectDropdown.jsx';

// The subject-filter block shown under the overlap selector. Shared by the Venn panel and
// the GLM average-response view (which replaces the Venn but must keep subject selection).
export default function SubjectFilterSection({
  availableSubjects,
  selectedSubjects,
  onToggleSubject,
  onSelectAllSubjects,
  onDeselectAllSubjects,
  hint = 'Filter subjects for Venn counts, brain map, and waveforms.',
}) {
  if (!availableSubjects.length) return null;
  return (
    <div className="venn-subject-section" data-tour="subject-filter">
      <div className="venn-subject-section-title">Subject filter</div>
      <SubjectDropdown
        availableSubjects={availableSubjects}
        selectedSubjects={selectedSubjects}
        onToggleSubject={onToggleSubject}
        onSelectAllSubjects={onSelectAllSubjects}
        onDeselectAllSubjects={onDeselectAllSubjects}
      />
      <div className="venn-subject-hint">{hint}</div>
    </div>
  );
}
