/** Ambient background starfield. A single THREE.Points draw call (not one mesh per particle),
 * with the count hard-capped — the "instancing, capped particle counts" 60fps requirement from
 * CLAUDE.md applied to the simplest possible case. */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { useUIStore } from "../store/uiStore";

const MAX_PARTICLES = 500;

type ParticleFieldProps = {
  count?: number;
  radius?: number;
  color?: string;
};

export default function ParticleField({ count = MAX_PARTICLES, radius = 12, color = "#6b6860" }: ParticleFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const safeCount = Math.min(count, MAX_PARTICLES);

  const positions = useMemo(() => {
    const arr = new Float32Array(safeCount * 3);
    for (let i = 0; i < safeCount; i++) {
      const r = radius * (0.3 + Math.random() * 0.7);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [safeCount, radius]);

  useFrame((_, delta) => {
    if (reduceMotion || !pointsRef.current) return;
    pointsRef.current.rotation.y += delta * 0.02;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.035} sizeAttenuation transparent opacity={0.6} />
    </points>
  );
}
