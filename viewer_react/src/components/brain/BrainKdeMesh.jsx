import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import {
  buildFrameVertexColors,
  buildInfluenceMap,
  extractMeshPositions,
} from '../../brainKde.js';
import { BRAIN_MESH_URL, BRAIN_HEMI_SPLIT_X } from '../../constants/brain.js';
import { buildKdeFrameColorsOffThread } from '../../utils/kdeFrameColorClient.js';
import {
  applyBrainMaterial,
  applyHemisphereClipping,
  applyKdeOverlayMaterial,
  applyOverlayVertexColors,
  prepareBrainWithHemispheres,
  prepareKdeOverlayBrain,
  setBrainHemisphereVisibility,
} from '../../lib/brainMesh.js';

const KDE_PRECOMPUTE_DELAY_MS = 0;

export default function BrainKdeMesh({
  opacity,
  hemisphereView,
  influencePoints,
  hgaValues,
  fixedHgaMax = null,
  frameHgaValues = null,
  frameIndex = 0,
  kdePreRenderToken = 0,
  manualMax = null,
  onDensityRange,
  onFrameCacheStatus,
}) {
  // Manual colorbar ceiling: forces a fixed [0, manualMax] range across the whole timeline
  // (and the static view), overriding the auto p98 range.
  const manualRange = manualMax > 0 ? { vmin: 0, vmax: manualMax, hasData: true } : null;
  const { scene } = useGLTF(BRAIN_MESH_URL);
  const meshData = useMemo(() => extractMeshPositions(scene), [scene]);
  const pointsKey = useMemo(
    () => influencePoints.map((point) => `${point.x},${point.y},${point.z}`).join('|'),
    [influencePoints],
  );

  const influenceMap = useMemo(
    () => buildInfluenceMap(meshData.positions, influencePoints),
    [meshData.positions, meshData.vertexCount, pointsKey],
  );

  const frameHgaKey = useMemo(
    () => (frameHgaValues?.length
      ? `${frameHgaValues.length}:${frameHgaValues[0]?.length ?? 0}:${frameHgaValues.at(-1)?.length ?? 0}`
      : ''),
    [frameHgaValues],
  );

  const colorCacheRef = useRef(null);
  const fixedRangeRef = useRef(null);
  const frameIndexRef = useRef(frameIndex);
  const overlayBrainRef = useRef(null);
  const lastAppliedColorsRef = useRef(null);
  const densityRangeReportedRef = useRef(false);
  const [cacheVersion, setCacheVersion] = useState(0);

  const { baseBrain, overlayBrain } = useMemo(() => ({
    baseBrain: prepareBrainWithHemispheres(scene.clone(true), BRAIN_HEMI_SPLIT_X),
    overlayBrain: prepareKdeOverlayBrain(scene, BRAIN_HEMI_SPLIT_X),
  }), [scene]);

  overlayBrainRef.current = overlayBrain;

  useEffect(() => {
    frameIndexRef.current = frameIndex;
  }, [frameIndex]);

  useEffect(() => {
    applyBrainMaterial(baseBrain, opacity, { forceSolid: true, lit: true });
    applyHemisphereClipping(baseBrain, 'both');
    setBrainHemisphereVisibility(baseBrain, hemisphereView);
  }, [baseBrain, opacity, hemisphereView]);

  useEffect(() => {
    applyKdeOverlayMaterial(overlayBrain, 'both');
    setBrainHemisphereVisibility(overlayBrain, hemisphereView);
  }, [overlayBrain, hemisphereView]);

  useEffect(() => {
    if (!frameHgaValues?.length || !fixedHgaMax || !influenceMap.vertexCount) {
      colorCacheRef.current = null;
      fixedRangeRef.current = null;
      densityRangeReportedRef.current = false;
      onFrameCacheStatus?.({ ready: true, progress: 1 });
      return undefined;
    }

    let cancelled = false;
    if (!colorCacheRef.current || colorCacheRef.current.length !== frameHgaValues.length) {
      colorCacheRef.current = new Array(frameHgaValues.length);
      fixedRangeRef.current = null;
      densityRangeReportedRef.current = false;
    }

    const allFramesCached = colorCacheRef.current.every(Boolean);
    if (allFramesCached) {
      onFrameCacheStatus?.({ ready: true, progress: 1 });
      return undefined;
    }

    const hasCurrentFrame = Boolean(colorCacheRef.current[frameIndexRef.current]);
    if (!hasCurrentFrame) {
      onFrameCacheStatus?.({ ready: false, progress: 0 });
    }

    const startHandle = window.setTimeout(() => {
      if (cancelled) return;

      buildKdeFrameColorsOffThread({
        positions: meshData.positions,
        influencePoints,
        frameHgaValues,
        globalHgaMax: fixedHgaMax,
        splitX: BRAIN_HEMI_SPLIT_X,
        statsHemisphere: hemisphereView,
        startIndex: frameIndexRef.current,
        onFrameReady: (readyIndex, colors) => {
          if (cancelled) return;
          if (!colorCacheRef.current) {
            colorCacheRef.current = new Array(frameHgaValues.length);
          }
          colorCacheRef.current[readyIndex] = colors;
          if (readyIndex === frameIndexRef.current && overlayBrainRef.current) {
            applyOverlayVertexColors(overlayBrainRef.current, colors);
          }
        },
        onProgress: (done, total, fixedRange) => {
          if (cancelled) return;
          if (!fixedRangeRef.current && fixedRange?.hasData) {
            fixedRangeRef.current = fixedRange;
            if (!densityRangeReportedRef.current) {
              onDensityRange?.(fixedRange);
              densityRangeReportedRef.current = true;
            }
          }
          const progress = total > 0 ? done / total : 0;
          onFrameCacheStatus?.({ ready: false, progress });
          if (done > 0) {
            setCacheVersion((version) => version + 1);
          }
        },
      }).then(({ fixedRange }) => {
        if (cancelled) return;
        if (fixedRange?.hasData) {
          fixedRangeRef.current = fixedRange;
        }
        if (!densityRangeReportedRef.current && fixedRangeRef.current?.hasData) {
          onDensityRange?.(fixedRangeRef.current);
          densityRangeReportedRef.current = true;
        }
        onFrameCacheStatus?.({ ready: true, progress: 1 });
        setCacheVersion((version) => version + 1);
      }).catch((error) => {
        console.error('Failed to precompute KDE frame colors', error);
        if (!cancelled) {
          onFrameCacheStatus?.({ ready: true, progress: 1 });
        }
      });
    }, KDE_PRECOMPUTE_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(startHandle);
    };
  }, [
    influenceMap,
    frameHgaKey,
    fixedHgaMax,
    pointsKey,
    hemisphereView,
    meshData.positions,
    onDensityRange,
    onFrameCacheStatus,
    kdePreRenderToken,
  ]);

  useEffect(() => {
    if (!meshData.vertexCount || !influencePoints.length) {
      lastAppliedColorsRef.current = null;
      const empty = new Float32Array(meshData.vertexCount * 4);
      applyOverlayVertexColors(overlayBrain, empty);
      onDensityRange?.({ vmin: 0, vmax: 1, hasData: false });
      return;
    }

    const kdeOptions = {
      statsHemisphere: hemisphereView,
      maskColorsToHemisphere: false,
    };

    const applyColors = (colors) => {
      applyOverlayVertexColors(overlayBrain, colors);
      lastAppliedColorsRef.current = colors;
    };

    if (frameHgaValues?.length && fixedHgaMax) {
      // A manual ceiling must override the cached (auto-ranged) frame colors.
      const cachedColors = manualRange ? null : colorCacheRef.current?.[frameIndex];
      if (cachedColors) {
        applyColors(cachedColors);
        return;
      }

      const { colors, range } = buildFrameVertexColors(
        influenceMap,
        frameHgaValues[frameIndex] ?? hgaValues,
        fixedHgaMax,
        meshData.positions,
        BRAIN_HEMI_SPLIT_X,
        kdeOptions,
        manualRange ?? fixedRangeRef.current,
      );
      if (manualRange) {
        onDensityRange?.(manualRange);
      } else if (!densityRangeReportedRef.current && range?.hasData) {
        onDensityRange?.(range);
        densityRangeReportedRef.current = true;
      }
      applyColors(colors);
      return;
    }

    const { colors, range } = buildFrameVertexColors(
      influenceMap,
      hgaValues,
      fixedHgaMax,
      meshData.positions,
      BRAIN_HEMI_SPLIT_X,
      kdeOptions,
      manualRange,
    );
    onDensityRange?.(manualRange ?? range);
    applyColors(colors);
  }, [
    overlayBrain,
    influenceMap,
    hgaValues,
    fixedHgaMax,
    frameHgaValues,
    frameIndex,
    cacheVersion,
    meshData.vertexCount,
    meshData.positions,
    hemisphereView,
    influencePoints.length,
    manualMax,
    onDensityRange,
  ]);

  return (
    <>
      <primitive object={baseBrain} />
      <primitive object={overlayBrain} />
    </>
  );
}

useGLTF.preload(BRAIN_MESH_URL);
