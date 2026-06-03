import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ELECTRODE_BASE_RADIUS } from '../../constants/brain.js';
import { resolveHgaMean, hgaToRadius } from '../../utils/hga.js';
import { resolveBrainElectrodeColor, hgaColor } from '../../utils/electrodeColors.js';

export default function ElectrodeInstances({
  electrodes,
  vennPhases,
  selectedLoad,
  hgaScale,
  animationScale,
  liveHgaByElectrodeId,
  isAnimating,
  selectedIds,
  selectedElectrodeId,
  hoveredId,
  colorByFunctional,
  colorMode = 'region',
  colorDirection = 'one',
  sizeScale = 1,
  onHover,
  onSelect,
}) {
  const meshRef = useRef(null);
  const tempObject = useMemo(() => new THREE.Object3D(), []);
  const scale = isAnimating && animationScale ? animationScale : hgaScale;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !electrodes.length) return;

    const color = new THREE.Color();
    electrodes.forEach((electrode, index) => {
      const selected = selectedIds.has(electrode.id);
      const active = selectedElectrodeId === electrode.id;
      const hovered = hoveredId === electrode.id;
      const liveHga = liveHgaByElectrodeId?.[electrode.id];
      const hgaMean = isAnimating
        ? (liveHga ?? null)
        : resolveHgaMean(electrode, selectedLoad);
      const radius = hgaToRadius(hgaMean, scale, { active, selected, hovered });

      tempObject.position.set(electrode.x, electrode.y, electrode.z);
      tempObject.scale.setScalar(radius * sizeScale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(index, tempObject.matrix);

      // During animation the electrode color tracks its live HGA; otherwise it follows the
      // chosen color mode (region overlap or static HGA).
      const colorStr = isAnimating
        ? hgaColor(liveHga ?? 0, scale, colorDirection)
        : resolveBrainElectrodeColor({
          electrode,
          vennPhases,
          selected,
          colorByFunctional,
          colorMode,
          hgaScale,
          colorDirection,
        });
      color.set(colorStr);
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [
    electrodes,
    vennPhases,
    selectedLoad,
    scale,
    liveHgaByElectrodeId,
    isAnimating,
    selectedIds,
    selectedElectrodeId,
    hoveredId,
    colorByFunctional,
    colorMode,
    colorDirection,
    hgaScale,
    sizeScale,
    liveHgaByElectrodeId,
    animationScale,
    tempObject,
  ]);

  if (!electrodes.length) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, electrodes.length]}
      onPointerMove={(event) => {
        event.stopPropagation();
        const index = event.instanceId;
        if (index == null) return;
        onHover(electrodes[index]?.id ?? null);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = 'default';
      }}
      onClick={(event) => {
        event.stopPropagation();
        const index = event.instanceId;
        if (index == null) return;
        onSelect(electrodes[index]?.id ?? null);
      }}
    >
      <sphereGeometry args={[ELECTRODE_BASE_RADIUS, 16, 12]} />
      {/* Unlit so each instance shows its mapped color exactly (instanceColor via setColorAt).
          vertexColors must NOT be set — there is no per-vertex color attribute, which made
          the spheres render black. */}
      <meshBasicMaterial transparent opacity={0.95} />
    </instancedMesh>
  );
}
