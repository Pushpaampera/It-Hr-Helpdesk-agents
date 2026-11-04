/** A single agent's 3D presence: a glowing sphere in that agent's identity color (see
 * docs/04_FRONTEND.md / src/design/tokens.css). Later phases (Control Room, AI Assistant) place
 * these per-agent and toggle `active` as `agent_event`s arrive over SSE. */
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

import { AGENT_COLORS } from "../design/agents";
import { useUIStore } from "../store/uiStore";

export { AGENT_COLORS };

type AgentOrbProps = {
  agent: string;
  position?: [number, number, number];
  active?: boolean;
  radius?: number;
};

export default function AgentOrb({ agent, position = [0, 0, 0], active = false, radius = 0.6 }: AgentOrbProps) {
  const meshRef = useRef<Mesh>(null);
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const color = AGENT_COLORS[agent] ?? "#38bdf8";

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!reduceMotion) {
      mesh.rotation.y += delta * 0.3;
    }
    const pulse = active && !reduceMotion ? 1 + Math.sin(state.clock.elapsedTime * 4) * 0.08 : 1;
    mesh.scale.setScalar(pulse);
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[radius, 32, 32]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={active ? 1.1 : 0.45}
        roughness={0.35}
        metalness={0.1}
      />
    </mesh>
  );
}
