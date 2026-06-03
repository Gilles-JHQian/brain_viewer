import { buildInfluenceMap, buildKdeFrameColorCache } from '../brainKde.js';

self.onmessage = async (event) => {
  const {
    id,
    type,
    positions,
    influencePoints,
    frameHgaValues,
    globalHgaMax,
    splitX,
    statsHemisphere,
    bandwidth,
    maxDistance,
    startIndex,
  } = event.data;

  if (type !== 'build') return;

  try {
    const posArray = positions instanceof Float32Array
      ? positions
      : new Float32Array(positions);
    const influenceMap = buildInfluenceMap(posArray, influencePoints, bandwidth, maxDistance);

    await buildKdeFrameColorCache(
      influenceMap,
      frameHgaValues,
      globalHgaMax,
      posArray,
      splitX,
      { statsHemisphere },
      {
        chunkSize: 4,
        startIndex: startIndex ?? 0,
        onFrameReady: (frameIndex, colors) => {
          self.postMessage(
            { type: 'frame', id, index: frameIndex, colors },
            [colors.buffer],
          );
        },
        onProgress: (done, total, fixedRange) => {
          self.postMessage({ type: 'progress', id, done, total, fixedRange });
        },
      },
    );

    self.postMessage({ type: 'done', id });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      message: error?.message || 'KDE worker failed',
    });
  }
};
