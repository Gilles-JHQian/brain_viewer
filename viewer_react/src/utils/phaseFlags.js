// Derive per-electrode phase_flags for the ACTIVE variant.
//
// Unlike the Sternberg fork (where phase_flags is static in electrodes.json), brain_viewer
// significance depends on the selected (reference, datatype, diff/direction, condition)
// variant. Each variant's per-phase JSON carries `sig_channels` (the channel names that
// are significant in that phase); an electrode is "active in phase P" iff its id is in
// that phase's significant set. This is the same intersection brain_viewer's legacy
// "Sig Group" feature computed — here it feeds the interactive Venn directly.

/**
 * @param {Array<{id:string}>} electrodes - adapted electrodes (id === channel name)
 * @param {Object<string, Set<string>>} sigByPhase - phase -> Set of significant channel names
 * @param {string[]} phases - phase list to flag
 * @returns {Map<string, Object<string, boolean>>} electrode id -> { [phase]: boolean }
 */
export function computePhaseFlags(electrodes, sigByPhase, phases) {
  const flagsById = new Map();
  electrodes.forEach((electrode) => {
    const flags = {};
    phases.forEach((phase) => {
      flags[phase] = sigByPhase?.[phase]?.has(electrode.id) ?? false;
    });
    flagsById.set(electrode.id, flags);
  });
  return flagsById;
}

/** Return a shallow copy of electrodes with phase_flags + active_phases attached. */
export function attachPhaseFlags(electrodes, sigByPhase, phases) {
  const flagsById = computePhaseFlags(electrodes, sigByPhase, phases);
  return electrodes.map((electrode) => {
    const phase_flags = flagsById.get(electrode.id) || {};
    return {
      ...electrode,
      phase_flags,
      active_phases: phases.filter((phase) => phase_flags[phase]),
    };
  });
}
