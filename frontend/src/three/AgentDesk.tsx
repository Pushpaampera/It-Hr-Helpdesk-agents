/** A single agent's "desk" in the agent-world scenes (Landing hero, Assistant workroom,
 * Overview). A floating hexagonal platform in the agent's color, their robot standing on it, a
 * small floating "artifact" that signals what they do (a document, a gear, a ticket card, a
 * shield, a star), and an optional drei <Html> speech bubble. Reused across three pages so the
 * "agent world" reads as one consistent place rather than three different scenes. */
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";

import { AGENTS, type AgentKey } from "../design/agents";
import { useUIStore } from "../store/uiStore";
import RoboCompanion, { type RoboState } from "./RoboCompanion";

type AgentDeskProps = {
  agentKey: AgentKey;
  position: [number, number, number];
  scale?: number;
  state?: RoboState;
  bubble?: string | null;
  isCore?: boolean;
  done?: boolean;
};

function Artifact({ agentKey, color }: { agentKey: AgentKey; color: string }) {
  const ref = useRef<Mesh>(null);
  useFrame((frame) => {
    if (ref.current) ref.current.rotation.y = frame.clock.elapsedTime * 0.6;
  });
  const material = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.85} />;

  switch (agentKey) {
    case "it_support":
      return (
        <mesh ref={ref}>
          <torusGeometry args={[0.16, 0.05, 10, 20]} />
          {material}
        </mesh>
      );
    case "hr_policy":
      return (
        <mesh ref={ref}>
          <planeGeometry args={[0.3, 0.38]} />
          {material}
        </mesh>
      );
    case "action":
      return (
        <mesh ref={ref} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.14, 0.4, 0.14]} />
          {material}
        </mesh>
      );
    case "ticketing":
      return (
        <mesh ref={ref}>
          <planeGeometry args={[0.36, 0.22]} />
          {material}
        </mesh>
      );
    case "feedback":
      return (
        <mesh ref={ref}>
          <octahedronGeometry args={[0.17, 0]} />
          {material}
        </mesh>
      );
    case "guard":
      return (
        <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.2, 0.3, 4]} />
          {material}
        </mesh>
      );
    case "supervisor":
    default:
      return (
        <mesh ref={ref}>
          <icosahedronGeometry args={[0.2, 0]} />
          {material}
        </mesh>
      );
  }
}

export default function AgentDesk({ agentKey, position, scale = 1, state = "idle", bubble = null, isCore = false, done = false }: AgentDeskProps) {
  const identity = AGENTS[agentKey];
  const platformRef = useRef<Mesh>(null);
  const artifactGroupRef = useRef<Group>(null);
  const reduceMotion = useUIStore((s) => s.reduceMotion);

  useFrame((frame) => {
    if (reduceMotion) return;
    const t = frame.clock.elapsedTime;
    if (platformRef.current) {
      platformRef.current.position.y = Math.sin(t * 1.1 + position[0]) * 0.08;
      platformRef.current.rotation.y = t * 0.15;
    }
    if (artifactGroupRef.current) {
      artifactGroupRef.current.position.y = 0.95 + Math.sin(t * 1.6 + position[0]) * 0.1;
    }
  });

  const radius = isCore ? 1.5 : 0.9;

  return (
    <group position={position} scale={scale}>
      <mesh ref={platformRef} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius, radius, 0.14, 6]} />
        <meshStandardMaterial
          color={identity.color}
          emissive={identity.color}
          emissiveIntensity={0.35}
          roughness={0.4}
          metalness={0.2}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[radius * 0.82, radius, 6]} />
        <meshStandardMaterial color={identity.accent} emissive={identity.accent} emissiveIntensity={0.6} transparent opacity={0.7} />
      </mesh>

      <RoboCompanion position={[0, 0.1, 0]} scale={isCore ? 1.3 : 1} color={identity.color} accentColor={identity.accent} kind={identity.robot} state={state} />

      <group ref={artifactGroupRef} position={[radius * 0.55, 0.95, 0]}>
        <Artifact agentKey={agentKey} color={identity.accent} />
      </group>

      {done && (
        <Html position={[radius * 0.75, 1.35, 0]} center distanceFactor={9} occlude={false} style={{ pointerEvents: "none" }}>
          <div
            style={{
              width: 20, height: 20, borderRadius: "50%", background: "#22c55e",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 13, fontWeight: 700, boxShadow: "0 2px 8px rgba(34,197,94,0.5)",
            }}
          >
            ✓
          </div>
        </Html>
      )}

      {bubble && (
        <Html position={[0, isCore ? 1.1 : 1.35, 0]} center distanceFactor={9} occlude={false} style={{ pointerEvents: "none" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.92)",
              border: `1px solid ${identity.color}55`,
              borderRadius: 12,
              padding: "6px 10px",
              fontFamily: "var(--font-body)",
              fontSize: 12.5,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              boxShadow: "0 8px 20px rgba(124,112,175,0.22)",
            }}
          >
            <strong style={{ color: identity.color }}>{identity.name}:</strong> {bubble}
          </div>
        </Html>
      )}
    </group>
  );
}
