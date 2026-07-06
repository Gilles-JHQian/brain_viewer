import { applyPhaseConfig, applyVennAxisConfig, vennAxisConfig } from '../constants/phaseConfig.js';
import { attachPhaseFlags } from '../utils/phaseFlags.js';
import { attachElectrodeHga } from '../utils/electrodeHga.js';

const TRACE_CACHE_MAX = 48;

class LruCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  has(key) {
    return this.map.has(key);
  }
}

const traceCache = new LruCache(TRACE_CACHE_MAX);
const animationCache = new LruCache(TRACE_CACHE_MAX * 4);
// Per-file cache for the phase x condition grid (keyed by full fetch URL), so toggling
// which phases the time-course panel shows never refetches already-loaded cells.
const gridFileCache = new LruCache(64);

// Base URL under which the active task's data files live (manifest + per-reference
// zscore/electrode JSON). Switched per task via setDataBase(); every fetch below is
// resolved against it, so a task switch just re-points the whole data tree.
let DATA_BASE = '/data';

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }
  return response.json();
}

// --------------------------------------------------------------- variant layout
// Map a brain_viewer electrode record to the shape the fork's components expect.
// Coordinates use fsaverage surface RAS (x_fs/y_fs/z_fs), which is the space the brain
// GLB lives in — so no translation is needed.
function adaptElectrode(raw) {
  return {
    id: raw.name,
    name: raw.name,
    subject: raw.subject,
    channel: raw.channel,
    roi: raw.roi,
    hemi: raw.hemi,
    atlas_label: raw.atlas_label,
    x: raw.x_fs,
    y: raw.y_fs,
    z: raw.z_fs,
    x_mni: raw.x_mni,
    y_mni: raw.y_mni,
    z_mni: raw.z_mni,
    hga_by_load: {},
    hga_mean_all: null,
  };
}

const variantElectrodeCache = new LruCache(4); // per reference

// Point the store at a task's data bundle. The caches above key by reference/subject,
// which collide across tasks, so clear them whenever the base actually changes.
export function setDataBase(base) {
  const next = base || '/data';
  if (next === DATA_BASE) return;
  DATA_BASE = next;
  variantElectrodeCache.map.clear();
  traceCache.map.clear();
  animationCache.map.clear();
  gridFileCache.map.clear();
}

async function loadReferenceElectrodes(manifest, reference) {
  if (variantElectrodeCache.has(reference)) return variantElectrodeCache.get(reference);
  const path = manifest?.files?.electrodes?.[reference];
  if (!path) return [];
  const payload = await fetchJson(`${DATA_BASE}/${path}`);
  const electrodes = (payload.electrodes || []).map(adaptElectrode);
  variantElectrodeCache.set(reference, electrodes);
  return electrodes;
}

// Fetch each phase file once and return both the significance sets (for phase_flags) and
// the raw payloads (for trace building).
// Construct the data file path for one (phase, condition) of a variant spec, mirroring
// build_viewer_assets.py's layout. `member` is a phase (axis='phase') or a condition
// (axis='condition'); the other dimension is taken from the spec's fixed value.
export function resolveVariantFile(spec, member, diffMeta) {
  const { reference, datatype, diffType, direction, axis, fixedPhase, fixedCondition } = spec;
  const phase = axis === 'condition' ? fixedPhase : member;
  const condition = axis === 'condition' ? member : fixedCondition;
  if (datatype === 'zscore') {
    return `${reference}/zscore/${phase}_${condition}.json`;
  }
  const needsCond = diffMeta?.[diffType]?.needs_condition;
  const suffix = needsCond && condition ? `_${condition}` : '';
  return `${reference}/diff/${diffType}/${direction}_${phase}${suffix}.json`;
}

async function loadMemberPayloads(spec, members, diffMeta) {
  const sigByMember = {};
  const payloads = {};
  await Promise.all(members.map(async (member) => {
    const path = resolveVariantFile(spec, member, diffMeta);
    try {
      const payload = await fetchJson(`${DATA_BASE}/${path}`);
      payloads[member] = payload;
      sigByMember[member] = new Set(payload.sig_channels || []);
    } catch {
      sigByMember[member] = new Set(); // combo may not exist; treat as no significance
    }
  }));
  return { sigByMember, payloads };
}

// Resolve the [activeLabel, baselineLabel] pair for a diff direction from whichever map
// the manifest carries (condition_map / stim_type_map / neighborhood_map).
function diffDirectionLabels(diffMeta, direction) {
  const map = diffMeta?.condition_map || diffMeta?.stim_type_map || diffMeta?.neighborhood_map;
  const pair = map?.[direction];
  return Array.isArray(pair) ? pair : ['A', 'B'];
}

// Build traces[electrodeId][phase] = { all: { time, value, sem, [act], [bsl], labels } } from
// the per-phase payloads (rows aligned with channel_names). brain_viewer has no "load" axis,
// so a single 'all' bucket carries the trace; resolvePhaseTrace's selectedLoad='all' path
// consumes it. For diff variants the primary line is data_diff, with act/bsl carried for the
// single-electrode overlay.
function buildVariantTraces(phasePayloads, phases, labels = null) {
  const traces = {};
  phases.forEach((phase) => {
    const payload = phasePayloads[phase];
    if (!payload) return;
    const { times, channel_names: names } = payload;
    const isDiff = Array.isArray(payload.data_diff);
    (names || []).forEach((name, i) => {
      if (!traces[name]) traces[name] = {};
      // Time-resolved significance mask (n_times booleans) for per-frame gating in animation.
      const mask = payload.mask ? payload.mask[i] : null;
      if (isDiff) {
        traces[name][phase] = {
          all: {
            time: times,
            value: payload.data_diff?.[i] ?? [],
            sem: payload.trial_sem_diff ? payload.trial_sem_diff[i] : null,
            mask,
            act: { value: payload.data_act?.[i] ?? [], sem: payload.trial_sem_act ? payload.trial_sem_act[i] : null },
            bsl: { value: payload.data_bsl?.[i] ?? [], sem: payload.trial_sem_bsl ? payload.trial_sem_bsl[i] : null },
            actLabel: labels?.[0] ?? 'Active',
            bslLabel: labels?.[1] ?? 'Baseline',
          },
        };
      } else {
        traces[name][phase] = {
          all: {
            time: times,
            value: payload.data?.[i] ?? [],
            sem: payload.trial_sem ? payload.trial_sem[i] : null,
            mask,
          },
        };
      }
    });
  });
  return traces;
}

// The members of the Venn/waveform for a spec: phases (axis='phase') or conditions
// (axis='condition'). A diff type may define only a subset of phases (e.g. UP's
// lexicality omits the pre-stimulus Cue), so restrict phase-axis members to that
// subset when present — otherwise the omitted phase shows up as an empty member.
export function specMembers(metadata, spec) {
  if (spec.axis === 'condition') return metadata.conditions || [];
  const phases = metadata.phases || [];
  if (spec.datatype === 'diff') {
    const diffPhases = metadata.diff_types?.[spec.diffType]?.phases;
    if (Array.isArray(diffPhases) && diffPhases.length) {
      return phases.filter((phase) => diffPhases.includes(phase));
    }
  }
  return phases;
}

// A reasonable default spec: condition-overlap (Venn over conditions) at the first phase,
// car reference, zscore. (User's primary interest is condition-modality overlap.)
export function defaultVariantSpec(metadata) {
  return {
    reference: (metadata.references || ['car'])[0],
    datatype: 'zscore',
    diffType: null,
    direction: null,
    axis: 'condition',
    fixedPhase: (metadata.phases || [])[0] ?? null,
    fixedCondition: (metadata.conditions || [])[0] ?? null,
  };
}

// Load everything needed to render one variant spec: adapted electrodes (with member
// flags), per-member traces, and the HGA scale. `members` = phases or conditions per axis.
export async function loadVariant(manifest, spec) {
  const metadata = manifest?.metadata || {};
  const diffMeta = metadata.diff_types || {};
  const members = specMembers(metadata, spec);
  const [rawElectrodes, { sigByMember, payloads }] = await Promise.all([
    loadReferenceElectrodes(manifest, spec.reference),
    loadMemberPayloads(spec, members, diffMeta),
  ]);
  const flagged = attachPhaseFlags(rawElectrodes, sigByMember, members);
  const labels = spec.datatype === 'diff'
    ? diffDirectionLabels(diffMeta[spec.diffType], spec.direction)
    : null;
  const traces = buildVariantTraces(payloads, members, labels);
  const { electrodes, hgaScale } = attachElectrodeHga(flagged, traces, members);
  return { spec, members, reference: spec.reference, electrodes, traces, hgaScale };
}

// ------------------------------------------------------ phase x condition grid
// The time-course panel and the brain-map condition selector need EVERY (phase,
// condition) cell of the active spec simultaneously (not one axis-slice like
// loadVariant). These helpers load that full grid once per spec and re-slice it.

// The condition axis is meaningful for zscore and for diffs that carry a condition
// dimension; a condition-diff (needs_condition=false) contrasts conditions itself, so
// it collapses to a single synthetic member -> one line/phase.
export function gridAxesForSpec(metadata, spec) {
  const diffMeta = metadata?.diff_types || {};
  const allPhases = metadata?.phases || [];
  let phases = allPhases;
  if (spec?.datatype === 'diff') {
    const dphases = diffMeta?.[spec.diffType]?.phases;
    if (Array.isArray(dphases) && dphases.length) {
      phases = allPhases.filter((p) => dphases.includes(p));
    }
  }
  const hasCondition = spec?.datatype !== 'diff' || !!diffMeta?.[spec?.diffType]?.needs_condition;
  const conditions = hasCondition
    ? (metadata?.conditions || [])
    : [spec?.diffType || 'diff'];
  return { phases, conditions, hasCondition };
}

// Parse one payload into { byChannel: { name -> traceObj }, sig: Set<name> }. Mirrors
// buildVariantTraces' row alignment (keyed by channel name) but without the `.all` wrapper.
function parseGridPayload(payload, labels) {
  const { times, channel_names: names } = payload;
  const isDiff = Array.isArray(payload.data_diff);
  const byChannel = {};
  (names || []).forEach((name, i) => {
    const mask = payload.mask ? payload.mask[i] : null;
    if (isDiff) {
      byChannel[name] = {
        time: times,
        value: payload.data_diff?.[i] ?? [],
        sem: payload.trial_sem_diff ? payload.trial_sem_diff[i] : null,
        mask,
        act: { value: payload.data_act?.[i] ?? [], sem: payload.trial_sem_act ? payload.trial_sem_act[i] : null },
        bsl: { value: payload.data_bsl?.[i] ?? [], sem: payload.trial_sem_bsl ? payload.trial_sem_bsl[i] : null },
        actLabel: labels?.[0] ?? 'Active',
        bslLabel: labels?.[1] ?? 'Baseline',
      };
    } else {
      byChannel[name] = {
        time: times,
        value: payload.data?.[i] ?? [],
        sem: payload.trial_sem ? payload.trial_sem[i] : null,
        mask,
      };
    }
  });
  return { byChannel, sig: new Set(payload.sig_channels || []) };
}

async function loadGridFile(spec, phase, condition, diffMeta) {
  // Reuse resolveVariantFile by pinning the spec to condition-axis at this phase.
  const path = resolveVariantFile({ ...spec, axis: 'condition', fixedPhase: phase }, condition, diffMeta);
  const url = `${DATA_BASE}/${path}`;
  if (gridFileCache.has(url)) return gridFileCache.get(url);
  try {
    const payload = await fetchJson(url);
    gridFileCache.set(url, payload);
    return payload;
  } catch {
    gridFileCache.set(url, null); // combo may not exist; cache the miss
    return null;
  }
}

// Load grid[electrodeId][phase][condition] = { time, value, sem, mask, [act], [bsl], labels }
// plus sigSets[phase][condition] = Set<channelName> for the given spec.
export async function loadConditionPhaseGrid(manifest, spec, phases, conditions) {
  const metadata = manifest?.metadata || {};
  const diffMeta = metadata.diff_types || {};
  const labels = spec.datatype === 'diff'
    ? diffDirectionLabels(diffMeta[spec.diffType], spec.direction)
    : null;
  const grid = {};
  const sigSets = {};
  const cells = [];
  phases.forEach((phase) => {
    sigSets[phase] = {};
    conditions.forEach((condition) => cells.push({ phase, condition }));
  });
  await Promise.all(cells.map(async ({ phase, condition }) => {
    const payload = await loadGridFile(spec, phase, condition, diffMeta);
    if (!payload) {
      sigSets[phase][condition] = new Set();
      return;
    }
    const { byChannel, sig } = parseGridPayload(payload, labels);
    sigSets[phase][condition] = sig;
    Object.entries(byChannel).forEach(([name, traceObj]) => {
      if (!grid[name]) grid[name] = {};
      if (!grid[name][phase]) grid[name][phase] = {};
      grid[name][phase][condition] = traceObj;
    });
  }));
  return { grid, sigSets, phases, conditions };
}

// Re-slice the grid at one condition into the traces[id][phase].all shape that
// buildSlidingWindowFrames and computeElectrodeHga already consume.
export function sliceGridForCondition(grid, condition) {
  if (!grid || condition == null) return {};
  const out = {};
  Object.entries(grid).forEach(([name, byPhase]) => {
    const phaseObj = {};
    Object.entries(byPhase).forEach(([phase, byCondition]) => {
      const cell = byCondition[condition];
      if (cell) phaseObj[phase] = { all: cell };
    });
    if (Object.keys(phaseObj).length) out[name] = phaseObj;
  });
  return out;
}

export async function loadViewerBootstrap({ onProgress, dataBase } = {}) {
  setDataBase(dataBase);
  const reportBootstrap = (stage, completed, total = 2) => {
    onProgress?.({ stage, completed, total });
  };

  try {
    reportBootstrap('manifest', 0);
    const manifest = await fetchJson(`${DATA_BASE}/manifest.json`);
    reportBootstrap('manifest', 1);

    // brain_viewer variant layout: derive member flags + traces for the default spec.
    if (manifest.layout === 'variant') {
      const spec = defaultVariantSpec(manifest.metadata);
      applyVennAxisConfig(vennAxisConfig(manifest.metadata, spec.axis, spec.fixedPhase));
      const { electrodes, traces, hgaScale, members } = await loadVariant(manifest, spec);
      reportBootstrap('electrodes', 2);
      return {
        layout: 'variant',
        manifest,
        metadata: manifest.metadata,
        activeSpec: spec,
        members,
        electrodes,
        regions: [],
        traces,
        hgaScale,
      };
    }

    const electrodesPayload = await fetchJson(`${DATA_BASE}/${manifest.files.electrodes}`);
    reportBootstrap('electrodes', 2);
    applyPhaseConfig(manifest.metadata);
    return {
      layout: 'split',
      manifest,
      metadata: manifest.metadata,
      electrodes: electrodesPayload.electrodes,
      regions: electrodesPayload.regions || [],
      traces: {},
    };
  } catch {
    try {
      reportBootstrap('manifest', 0);
      const payload = await fetchJson(`${DATA_BASE}/phase_overlap.json`);
      reportBootstrap('electrodes', 2);
      applyPhaseConfig(payload.metadata);
      return {
        layout: 'monolith',
        manifest: null,
        metadata: payload.metadata,
        electrodes: payload.electrodes,
        regions: payload.regions || [],
        traces: payload.traces || {},
      };
    } catch {
      reportBootstrap('manifest', 0);
      const payload = await fetchJson(`${DATA_BASE}/phase_overlap_mock.json`);
      reportBootstrap('electrodes', 2);
      applyPhaseConfig(payload.metadata);
      return {
        layout: 'mock',
        manifest: null,
        metadata: payload.metadata,
        electrodes: payload.electrodes,
        regions: payload.regions || [],
        traces: payload.traces || {},
      };
    }
  }
}

export async function loadSubjectTraces(manifest, subject) {
  if (!manifest?.files?.traces?.[subject]) return {};
  if (traceCache.has(subject)) return traceCache.get(subject);
  const payload = await fetchJson(`${DATA_BASE}/${manifest.files.traces[subject]}`);
  const traces = payload.traces || {};
  traceCache.set(subject, traces);
  return traces;
}

export async function loadTracesForSubjects(manifest, subjects, existingTraces = {}, onProgress) {
  if (!manifest) {
    onProgress?.({ completed: 0, total: 0, progress: 1 });
    return existingTraces;
  }

  const merged = { ...existingTraces };
  const total = subjects.length;
  let completed = 0;

  const report = () => {
    onProgress?.({
      completed,
      total,
      progress: total > 0 ? completed / total : 1,
    });
  };

  report();

  if (!total) {
    return merged;
  }

  await Promise.all(subjects.map(async (subject) => {
    try {
      const subjectTraces = await loadSubjectTraces(manifest, subject);
      Object.assign(merged, subjectTraces);
    } finally {
      completed += 1;
      report();
    }
  }));

  return merged;
}

export async function loadSubjectPhaseAnimation(manifest, subject, phase) {
  const cacheKey = `${subject}:${phase}`;
  if (animationCache.has(cacheKey)) return animationCache.get(cacheKey);
  const path = manifest?.files?.animation?.[subject]?.[phase];
  if (!path) return null;
  const payload = await fetchJson(`${DATA_BASE}/${path}`);
  animationCache.set(cacheKey, payload);
  return payload;
}

export function getManifestAnimationPath(manifest, subject, phase) {
  return manifest?.files?.animation?.[subject]?.[phase] ?? null;
}

export function clearTraceCache() {
  traceCache.map.clear();
  animationCache.map.clear();
}
