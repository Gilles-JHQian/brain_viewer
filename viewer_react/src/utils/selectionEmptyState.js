export function getSelectionEmptyState({
  selectedSubjectCount = 0,
  selectedRegionCount = 0,
  availableRoiCount = 0,
  enabledRoiCount = 0,
  visibleElectrodeCount = 0,
  bypassVenn = false,
}) {
  if (selectedSubjectCount === 0) {
    return {
      code: 'no_subjects',
      title: 'No subjects selected',
      message: 'Select at least one subject in the left panel to load electrodes and traces.',
    };
  }

  // When the Venn is bypassed (e.g. GLM average response, which has no significance
  // grouping) every electrode is shown, so there is no region to select — skip the check.
  if (!bypassVenn && selectedRegionCount === 0) {
    return {
      code: 'no_venn_region',
      title: 'No Venn region selected',
      message: 'Click a Venn component to choose which phase-overlap group to visualize.',
    };
  }

  // Deselecting all ROIs is an intentional, silent state — no overlay/prompt.
  if (availableRoiCount > 0 && enabledRoiCount === 0) {
    return null;
  }

  if (visibleElectrodeCount === 0) {
    return {
      code: 'no_electrodes',
      title: 'No electrodes in selection',
      message: 'Try a different Venn region, subject set, or ROI filter.',
    };
  }

  return null;
}

export function isSelectionEmpty(emptyState) {
  return emptyState != null;
}
