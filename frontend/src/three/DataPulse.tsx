/** A beam between two points with a travelling particle fired whenever `trigger` increments —
 * the primitive behind the `handoff` event animation in docs/01_ARCHITECTURE.md's frontend
 * mapping ("handoff events drive DataPulse beams between AgentOrbs"). */
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
};

export default function DataPulse({ from, to, trigger, color = "#ff8c1a", duration = 0.8 }: DataPulseProps) {
  const particleRef = useRef<THREE.Mesh>(null);
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const active = useRef(false);
  const elapsed = useRef(0);

  const fromVec = useMemo(() => new THREE.Vector3(...from), [from]);
  const toVec = useMemo(() => new THREE.Vector3(...to), [to]);
  const lineGeometry = useMemo(
    () => new THREE.BufferGeometry().setFromPoints([fromVec, toVec]),
    [fromVec, toVec],
  );

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

  useFrame((_, delta) => {
    const particle = particleRef.current;
    if (!active.current || !particle) return;
    elapsed.current += delta;
    const t = Math.min(elapsed.current / duration, 1);
    particle.position.lerpVectors(fromVec, toVec, t);
    particle.visible = true;
    if (t >= 1) {
      active.current = false;
      particle.visible = false;
    }
  });

  return (
    <group>
      <line>
        <primitive object={lineGeometry} attach="geometry" />
        <lineBasicMaterial color={color} transparent opacity={0.25} />
      </line>
      <mesh ref={particleRef} visible={false}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}
