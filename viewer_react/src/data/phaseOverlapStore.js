import { applyPhaseConfig } from '../constants/phaseConfig.js';
import { attachPhaseFlags } from '../utils/phaseFlags.js';

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

async function loadReferenceElectrodes(manifest, reference) {
  if (variantElectrodeCache.has(reference)) return variantElectrodeCache.get(reference);
  const path = manifest?.files?.electrodes?.[reference];
  if (!path) return [];
  const payload = await fetchJson(`/data/${path}`);
  const electrodes = (payload.electrodes || []).map(adaptElectrode);
  variantElectrodeCache.set(reference, electrodes);
  return electrodes;
}

// Fetch each phase file once and return both the significance sets (for phase_flags) and
// the raw payloads (for trace building).
async function loadVariantPhasePayloads(variant, phases) {
  const sigByPhase = {};
  const phasePayloads = {};
  await Promise.all(phases.map(async (phase) => {
    const path = variant?.phaseFiles?.[phase];
    if (!path) {
      sigByPhase[phase] = new Set();
      return;
    }
    const payload = await fetchJson(`/data/${path}`);
    phasePayloads[phase] = payload;
    sigByPhase[phase] = new Set(payload.sig_channels || []);
  }));
  return { sigByPhase, phasePayloads };
}

// Build traces[electrodeId][phase] = { all: { time, value, sem } } from the per-phase
// payloads (rows aligned with channel_names). brain_viewer has no "load" axis, so a single
// 'all' bucket carries the trace; resolvePhaseTrace's selectedLoad='all' path consumes it.
function buildVariantTraces(phasePayloads, phases) {
  const traces = {};
  phases.forEach((phase) => {
    const payload = phasePayloads[phase];
    if (!payload) return;
    const { times, channel_names: names, data, trial_sem: sem } = payload;
    (names || []).forEach((name, i) => {
      if (!traces[name]) traces[name] = {};
      traces[name][phase] = {
        all: { time: times, value: data?.[i] ?? [], sem: sem ? sem[i] : null },
      };
    });
  });
  return traces;
}

// Load everything needed to render one variant: adapted electrodes (with phase_flags for
// this variant) and per-phase traces. Reused by bootstrap and by variant switching.
export async function loadVariant(manifest, variantKey, phases) {
  const variant = manifest?.variants?.[variantKey];
  if (!variant) throw new Error(`Unknown variant: ${variantKey}`);
  const reference = variant.reference;
  const [rawElectrodes, { sigByPhase, phasePayloads }] = await Promise.all([
    loadReferenceElectrodes(manifest, reference),
    loadVariantPhasePayloads(variant, phases),
  ]);
  const electrodes = attachPhaseFlags(rawElectrodes, sigByPhase, phases);
  const traces = buildVariantTraces(phasePayloads, phases);
  return { variantKey, reference, electrodes, traces };
}

export async function loadViewerBootstrap({ onProgress } = {}) {
  const reportBootstrap = (stage, completed, total = 2) => {
    onProgress?.({ stage, completed, total });
  };

  try {
    reportBootstrap('manifest', 0);
    const manifest = await fetchJson('/data/manifest.json');
    reportBootstrap('manifest', 1);

    // brain_viewer variant layout: derive phase_flags + traces for the default variant.
    if (manifest.layout === 'variant') {
      applyPhaseConfig(manifest.metadata);
      const phases = manifest.metadata.phases;
      const variantKey = manifest.metadata.default_variant;
      const { electrodes, traces } = await loadVariant(manifest, variantKey, phases);
      reportBootstrap('electrodes', 2);
      return {
        layout: 'variant',
        manifest,
        metadata: manifest.metadata,
        activeVariant: variantKey,
        electrodes,
        regions: [],
        traces,
      };
    }

    const electrodesPayload = await fetchJson(`/data/${manifest.files.electrodes}`);
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
      const payload = await fetchJson('/data/phase_overlap.json');
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
      const payload = await fetchJson('/data/phase_overlap_mock.json');
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
  const payload = await fetchJson(`/data/${manifest.files.traces[subject]}`);
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
  const payload = await fetchJson(`/data/${path}`);
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
