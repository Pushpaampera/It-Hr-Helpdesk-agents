/** A single agent's 3D presence: a glowing sphere in that agent's identity color (see
 * docs/04_FRONTEND.md / src/design/tokens.css). Later phases (Control Room, AI Assistant) place
 * these per-agent and toggle `active` as `agent_event`s arrive over SSE. */
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

import { useUIStore } from "../store/uiStore";

// Mirrors the --agent-* custom properties in src/design/tokens.css. Three.js materials need a
// real color value, not a CSS variable reference, so these are kept in sync by hand.
export const AGENT_COLORS: Record<string, string> = {
  supervisor: "#ff8c1a",
  it_support: "#38bdf8",
  hr_policy: "#c4915c",
  action: "#facc15",
  ticketing: "#94a3b8",
  feedback: "#34d399",
  knowledge: "#2dd4bf",
  guard: "#ef4444",
};

type AgentOrbProps = {
  agent: keyof typeof AGENT_COLORS | string;
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
