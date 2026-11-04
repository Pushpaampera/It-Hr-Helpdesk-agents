/** A beam between two points with a travelling particle fired whenever `trigger` increments —
 * the primitive behind the `handoff` event animation in docs/01_ARCHITECTURE.md's frontend
 * mapping ("handoff events drive DataPulse beams between AgentOrbs"). Also doubles as the
 * Landing hero's always-on "glowing data streams with small cubes flowing between desks" — a
 * thin, near-invisible `lineBasicMaterial` at 0.25 opacity used to all-but-disappear against
 * the light background, so the beam itself is now a thicker drei `<Line>` (real pixel width,
 * not a 1px WebGL line) rendered twice — a soft wide glow pass plus a bright core — and
 * `ambient` adds a continuously looping packet so idle desks still visibly feel "alive", not
 * just the one desk a `trigger` fires for. */
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useUIStore } from "../store/uiStore";

type DataPulseProps = {
  from: [number, number, number];
  to: [number, number, number];
  trigger: number;
  color?: string;
  duration?: number;
  /** Loop a dim packet along the beam continuously, independent of `trigger` — used for the
   * Landing hero's idle desks so the whole scene has constant motion, not just the active one. */
  ambient?: boolean;
};

export default function DataPulse({ from, to, trigger, color = "#8b5cf6", duration = 0.8, ambient = false }: DataPulseProps) {
  const particleRef = useRef<THREE.Mesh>(null);
  const ambientRef = useRef<THREE.Mesh>(null);
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const active = useRef(false);
  const elapsed = useRef(0);
  // Each beam offsets its ambient loop phase by its own position so a whole ring of desks
  // doesn't pulse in visible lockstep.
  const ambientOffset = useMemo(() => (from[0] + to[0] + from[2] + to[2]) % 3, [from, to]);
  const ambientPeriod = 3;

  const fromVec = useMemo(() => new THREE.Vector3(...from), [from]);
  const toVec = useMemo(() => new THREE.Vector3(...to), [to]);
  const points = useMemo(() => [fromVec, toVec], [fromVec, toVec]);

  useEffect(() => {
    if (trigger <= 0) return;
    active.current = true;
    elapsed.current = 0;
    // A reduced-motion pulse still happens (the handoff is a real backend event worth showing)
    // but resolves instantly rather than animating a travel.
    if (reduceMotion && particleRef.current) {
      particleRef.current.position.copy(toVec);
      particleRef.current.visible = true;
      active.current = false;
    }
  }, [trigger, reduceMotion, toVec]);

  useFrame((frame, delta) => {
    const particle = particleRef.current;
    if (active.current && particle) {
      elapsed.current += delta;
      const t = Math.min(elapsed.current / duration, 1);
      particle.position.lerpVectors(fromVec, toVec, t);
      particle.visible = true;
      if (t >= 1) {
        active.current = false;
        particle.visible = false;
      }
    }

    const ambientMesh = ambientRef.current;
    if (ambient && !reduceMotion && ambientMesh) {
      const t = ((frame.clock.elapsedTime + ambientOffset) % ambientPeriod) / ambientPeriod;
      ambientMesh.position.lerpVectors(fromVec, toVec, t);
      ambientMesh.rotation.x = t * Math.PI * 2;
      ambientMesh.rotation.y = t * Math.PI * 2;
    }
  });

  return (
    <group>
      {/* Wide, soft glow pass underneath a brighter thin core — makes the beam read clearly
          against the light background instead of blending into it. */}
      <Line points={points} color={color} lineWidth={3} transparent opacity={0.18} />
      <Line points={points} color={color} lineWidth={1.1} transparent opacity={0.55} />

      {ambient && !reduceMotion && (
        <mesh ref={ambientRef} visible={ambient}>
          <boxGeometry args={[0.07, 0.07, 0.07]} />
          <meshBasicMaterial color={color} transparent opacity={0.75} />
        </mesh>
      )}

      <mesh ref={particleRef} visible={false} rotation={[0.4, 0.4, 0]}>
        <boxGeometry args={[0.16, 0.16, 0.16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}
