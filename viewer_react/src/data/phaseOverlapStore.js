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

export async function loadViewerBootstrap({ onProgress } = {}) {
  const reportBootstrap = (stage, completed, total = 2) => {
    onProgress?.({ stage, completed, total });
  };

  try {
    reportBootstrap('manifest', 0);
    const manifest = await fetchJson('/data/manifest.json');
    reportBootstrap('manifest', 1);
    const electrodesPayload = await fetchJson(`/data/${manifest.files.electrodes}`);
    reportBootstrap('electrodes', 2);
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
