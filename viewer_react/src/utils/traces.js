import { PHASES, phaseTimeStart } from '../constants/phases.js';
import {
  ENCODING_LOAD_CUTOFFS,
  LOAD_OPTIONS,
  PHASE_TIME_END,
  PHASE_TIME_RANGES,
} from '../constants/loads.js';
import { hexToRgba, phaseColor } from '../constants/colors.js';
import { loadKey } from './hga.js';

export function interpolateTraceValue(trace, time) {
  if (!trace?.time?.length) return null;
  const times = trace.time;
  const values = trace.value ?? trace.y;
  if (time <= times[0]) return values[0];
  if (time >= times[times.length - 1]) return values[values.length - 1];
  for (let i = 0; i < times.length - 1; i += 1) {
    if (time >= times[i] && time <= times[i + 1]) {
      const span = times[i + 1] - times[i];
      if (span === 0) return values[i];
      const weight = (time - times[i]) / span;
      return values[i] + weight * (values[i + 1] - values[i]);
    }
  }
  return null;
}

function makeTrace(electrode, phase, selectedLoad = 'all') {
  const phaseIndex = PHASES.indexOf(phase);
  let end = PHASE_TIME_END[phase];
  if (phase === 'encoding' && selectedLoad !== 'all') {
    end = ENCODING_LOAD_CUTOFFS[loadKey(selectedLoad)] ?? end;
  }
  const start = phaseTimeStart(phase);
  const n = Math.max(60, Math.round((end - start) * 40));
  const active = electrode.phase_flags?.[phase];
  const roiSeed = electrode.roi.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 9;
  const x = Array.from({ length: n }, (_, i) => start + (i / (n - 1)) * (end - start));
  const y = x.map((t, i) => {
    const bump = active ? Math.exp(-Math.pow((t - end * 0.35) / Math.max(end * 0.22, 0.18), 2)) : 0.15;
    const oscillation = 0.12 * Math.sin(i / 7 + roiSeed + phaseIndex);
    const baseline = 0.04 * phaseIndex;
    return Number((baseline + (active ? 0.85 : 0.08) * bump + oscillation).toFixed(3));
  });
  return { x, y };
}

function averageLoadTraces(phaseTraces) {
  const loads = Object.keys(phaseTraces || {});
  if (loads.length === 0) return null;
  if (loads.length === 1) {
    const trace = phaseTraces[loads[0]];
    return { time: trace.time, value: trace.value };
  }
  const timeSet = new Set();
  loads.forEach((load) => phaseTraces[load].time.forEach((time) => timeSet.add(time)));
  const times = Array.from(timeSet).sort((a, b) => a - b);
  const values = times.map((time) => {
    const samples = loads
      .map((load) => interpolateTraceValue(phaseTraces[load], time))
      .filter((value) => value != null);
    if (samples.length === 0) return null;
    return samples.reduce((sum, value) => sum + value, 0) / samples.length;
  });
  return { time: times, value: values };
}

function makeAveragedLoadTrace(electrode, phase) {
  const traces = Object.fromEntries(
    LOAD_OPTIONS.filter((load) => load !== 'all').map((load) => {
      const trace = makeTrace(electrode, phase, load);
      return [`load${load}`, { time: trace.x, value: trace.y }];
    }),
  );
  return averageLoadTraces(traces);
}

function shouldUseMockTraces(allowMock) {
  return allowMock === true;
}

export function resolvePhaseTrace(traces, electrode, phase, selectedLoad, allowMock = false) {
  const phaseTraces = traces?.[electrode?.id]?.[phase];
  if (phaseTraces && Object.keys(phaseTraces).length > 0) {
    if (selectedLoad === 'all') {
      return averageLoadTraces(phaseTraces);
    }
    const key = loadKey(selectedLoad);
    return phaseTraces[key] || phaseTraces[Object.keys(phaseTraces).find((item) => item.includes(selectedLoad))] || null;
  }
  if (!electrode || !shouldUseMockTraces(allowMock)) return null;
  if (selectedLoad === 'all') {
    return makeAveragedLoadTrace(electrode, phase);
  }
  const trace = makeTrace(electrode, phase, selectedLoad);
  return { time: trace.x, value: trace.y };
}

function meanAndSem(samples) {
  if (samples.length === 0) return { mean: null, sem: null };
  if (samples.length === 1) return { mean: samples[0], sem: 0 };
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (samples.length - 1);
  return { mean, sem: Math.sqrt(variance) / Math.sqrt(samples.length) };
}

export function electrodesActiveInPhase(electrodes, phase) {
  return (electrodes || []).filter((electrode) => electrode.phase_flags?.[phase]);
}

export function averageElectrodePhaseTraces(traces, electrodes, phase, selectedLoad, allowMock = false) {
  const activeElectrodes = electrodesActiveInPhase(electrodes, phase);
  const electrodeTraces = activeElectrodes
    .map((electrode) => resolvePhaseTrace(traces, electrode, phase, selectedLoad, allowMock))
    .filter((trace) => trace?.time?.length);
  if (electrodeTraces.length === 0) return null;
  if (electrodeTraces.length === 1) {
    return { time: electrodeTraces[0].time, value: electrodeTraces[0].value, sem: null };
  }

  const timeSet = new Set();
  electrodeTraces.forEach((trace) => trace.time.forEach((time) => timeSet.add(time)));
  const times = Array.from(timeSet).sort((a, b) => a - b);
  const values = [];
  const sems = [];
  times.forEach((time) => {
    const samples = electrodeTraces
      .map((trace) => interpolateTraceValue(trace, time))
      .filter((value) => value != null);
    const stats = meanAndSem(samples);
    values.push(stats.mean);
    sems.push(stats.sem);
  });
  return { time: times, value: values, sem: sems };
}

export function resolvePanelPhaseTrace(traces, electrodes, phase, selectedLoad, electrode, allowMock = false) {
  if (electrode) {
    return resolvePhaseTrace(traces, electrode, phase, selectedLoad, allowMock);
  }
  return averageElectrodePhaseTraces(traces, electrodes, phase, selectedLoad, allowMock);
}

export function clipTraceToPhaseWindow(trace, phase) {
  if (!trace?.x?.length) return { x: [], y: [], upper: [], lower: [], sem: [] };
  const { min, max } = PHASE_TIME_RANGES[phase];
  const clipped = { x: [], y: [], upper: [], lower: [], sem: [] };
  trace.x.forEach((time, index) => {
    if (time >= min && time <= max) {
      clipped.x.push(time);
      clipped.y.push(trace.y[index]);
      const sem = trace.sem?.[index] ?? null;
      if (sem != null) {
        clipped.sem.push(sem);
        clipped.upper.push(trace.y[index] + sem);
        clipped.lower.push(trace.y[index] - sem);
      }
    }
  });
  return clipped;
}

export function computeTraceYRange(trace) {
  if (!trace?.y?.length) return [-0.5, 1.5];
  let ymin = Infinity;
  let ymax = -Infinity;
  const consider = (value) => {
    if (value != null && Number.isFinite(value)) {
      ymin = Math.min(ymin, value);
      ymax = Math.max(ymax, value);
    }
  };
  trace.y.forEach(consider);
  trace.upper?.forEach(consider);
  trace.lower?.forEach(consider);
  if (!Number.isFinite(ymin)) return [-0.5, 1.5];
  const span = ymax - ymin;
  const pad = Math.max(span * 0.08, 0.08);
  return [ymin - pad, ymax + pad];
}

export function buildWaveformPlotData(trace, phase, isAggregate) {
  const color = phaseColor(phase);
  const traces = [];
  if (isAggregate && trace.upper.length > 0) {
    traces.push({
      x: [...trace.x, ...trace.x.slice().reverse()],
      y: [...trace.upper, ...trace.lower.slice().reverse()],
      type: 'scatter',
      mode: 'lines',
      line: { color: 'rgba(0,0,0,0)', width: 0 },
      fill: 'toself',
      fillcolor: hexToRgba(color, 0.22),
      hoverinfo: 'skip',
      showlegend: false,
    });
  }
  traces.push({
    x: trace.x,
    y: trace.y,
    type: 'scatter',
    mode: 'lines',
    line: { color, width: 2 },
    hovertemplate: isAggregate && trace.sem.length
      ? 't=%{x:.2f}s<br>mean=%{y:.2f}<extra></extra>'
      : 't=%{x:.2f}s<br>HGA=%{y:.2f}<extra></extra>',
    showlegend: false,
  });
  return traces;
}

export function buildPlaybackVLine(time) {
  if (time == null || !Number.isFinite(time)) return [];
  return [{
    type: 'line',
    xref: 'x',
    yref: 'paper',
    x0: time,
    x1: time,
    y0: 0,
    y1: 1,
    line: {
      color: '#334155',
      width: 1.5,
      dash: 'dot',
    },
    layer: 'above',
  }];
}

export function windowMean(trace, t0, t1) {
  if (!trace?.time?.length || t1 <= t0) return null;
  const nSamples = Math.max(4, Math.ceil((t1 - t0) / 0.015625));
  const samples = [];
  for (let i = 0; i <= nSamples; i += 1) {
    const t = t0 + (i / nSamples) * (t1 - t0);
    const value = interpolateTraceValue(trace, t);
    if (value != null && Number.isFinite(value)) samples.push(value);
  }
  if (!samples.length) return null;
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

export function causalWindowMeanForElectrode(traces, electrode, phase, selectedLoad, time, windowSec, allowMock = false) {
  const t0 = time;
  const t1 = time + windowSec;
  const phaseTraces = traces?.[electrode?.id]?.[phase];
  if (selectedLoad === 'all' && phaseTraces && Object.keys(phaseTraces).length > 0) {
    const loadMeans = Object.values(phaseTraces)
      .map((trace) => windowMean(trace, t0, t1))
      .filter((value) => value != null);
    if (!loadMeans.length) return null;
    return loadMeans.reduce((sum, value) => sum + value, 0) / loadMeans.length;
  }
  const trace = resolvePhaseTrace(traces, electrode, phase, selectedLoad, allowMock);
  if (!trace) return null;
  return windowMean(trace, t0, t1);
}
