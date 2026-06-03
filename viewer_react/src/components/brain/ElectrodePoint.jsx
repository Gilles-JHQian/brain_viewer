import React from 'react';
import { Html } from '@react-three/drei';
import { ELECTRODE_BASE_RADIUS } from '../../constants/brain.js';
import { resolveHgaMean, hgaToRadius } from '../../utils/hga.js';
import { resolveBrainElectrodeColor, hgaColor } from '../../utils/electrodeColors.js';

export default function ElectrodePoint({
  electrode,
  vennPhases,
  selectedLoad,
  hgaScale,
  animationScale,
  liveHga,
  isAnimating,
  selected,
  dimmed,
  active,
  hovered,
  onHover,
  onSelect,
  colorByFunctional,
  colorMode = 'region',
  colorDirection = 'one',
  sizeScale = 1,
}) {
  const scale = isAnimating && animationScale ? animationScale : hgaScale;
  const color = isAnimating
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
  const hgaMean = isAnimating
    ? (liveHga ?? null)
    : resolveHgaMean(electrode, selectedLoad);
  const radius = hgaToRadius(hgaMean, scale, { active, selected, hovered }) * sizeScale;
  const opacity = active || selected ? 0.75 : hovered ? 0.28 : dimmed ? 0.02 : 0.08;
  return (
    <group position={[electrode.x, electrode.y, electrode.z]}>
      <mesh
        scale={[radius, radius, radius]}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(electrode.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = 'default';
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(electrode.id);
        }}
      >
        <sphereGeometry args={[ELECTRODE_BASE_RADIUS, 24, 16]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} emissive={active || hovered ? color : '#000000'} emissiveIntensity={active || hovered ? 0.35 : 0} />
      </mesh>
      {(active || hovered) && (
        <Html distanceFactor={8} className="tooltip">
          <strong>{electrode.channel}</strong>
          <span>{electrode.subject} · {electrode.roi} · {electrode.hemi}</span>
        </Html>
      )}
    </group>
  );
}
