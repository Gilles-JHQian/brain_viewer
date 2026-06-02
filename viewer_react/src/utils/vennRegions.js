import { PHASE_LABELS } from '../constants/phases.js';

export function regionLabel(regionId) {
  return regionId.split('_').map((phase) => PHASE_LABELS[phase] || phase).join(' ∩ ');
}

export function allExclusiveRegionIds(vennPhases) {
  const ids = [];
  for (let mask = 1; mask < (1 << vennPhases.length); mask += 1) {
    const active = vennPhases.filter((_, index) => mask & (1 << index));
    ids.push(active.join('_'));
  }
  return ids;
}

export function computeVennRegions(electrodes, vennPhases) {
  const members = Object.fromEntries(allExclusiveRegionIds(vennPhases).map((id) => [id, []]));
  (electrodes || []).forEach((electrode) => {
    const active = vennPhases.filter((phase) => electrode.phase_flags?.[phase]);
    if (active.length === 0) return;
    const regionId = active.join('_');
    if (members[regionId]) members[regionId].push(electrode.id);
  });
  return allExclusiveRegionIds(vennPhases).map((id) => ({
    id,
    label: regionLabel(id),
    phases_on: id.split('_'),
    phases_off: vennPhases.filter((phase) => !id.split('_').includes(phase)),
    electrode_ids: members[id],
    count: members[id].length,
  }));
}

export function electrodeExclusiveRegionId(electrode, vennPhases) {
  const active = vennPhases.filter((phase) => electrode.phase_flags?.[phase]);
  return active.length ? active.join('_') : null;
}
