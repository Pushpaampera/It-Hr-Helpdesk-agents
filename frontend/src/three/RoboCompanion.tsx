/** A small procedural robot — built entirely from primitives (no model file to load, no
 * reference image copied). Seven agents, seven distinct `kind`s: head/torso geometry and one
 * signature accessory mesh differ per kind, so "Sage" and "Iris" read as different characters,
 * not one robot recolored. All seven share one idle/wave/think/work/success/blocked state
 * machine — same per-frame logic, different geometry underneath. Skips all per-frame motion
 * under reduceMotion, same pattern as AgentOrb — every state below still freezes to a static
 * pose. */
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh, MeshStandardMaterial } from "three";

import type { RobotKind } from "../design/agents";
import { useUIStore } from "../store/uiStore";

export type RoboState = "idle" | "waving" | "thinking" | "working" | "success" | "blocked";

export type RoboCompanionProps = {
  position?: [number, number, number];
  scale?: number;
  color?: string;
  accentColor?: string;
  kind?: RobotKind;
  state?: RoboState;
};

const SUCCESS_JUMP_DURATION = 0.6;
const SUCCESS_GLOW_COLOR = "#22c55e";
const BLOCKED_SHIELD_COLOR = "#fb7185";

/** Per-kind head geometry: [shape, args]. "box" and "sphere" are the only primitives used so
 * every kind stays cheap (a handful of triangles), matching the project's particle/instancing
 * performance budget. */
function Head({ kind, color }: { kind: RobotKind; color: string }) {
  const material = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.45} metalness={0.1} />;
  switch (kind) {
    case "dome":
      return (
        <mesh position={[0, 0.03, 0]}>
          <sphereGeometry args={[0.3, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          {material}
        </mesh>
      );
    case "rounded":
      return (
        <mesh>
          <sphereGeometry args={[0.28, 20, 20]} />
          {material}
        </mesh>
      );
    case "petite":
      return (
        <mesh>
          <boxGeometry args={[0.4, 0.38, 0.38]} />
          {material}
        </mesh>
      );
    case "slim":
      return (
        <mesh>
          <boxGeometry args={[0.4, 0.5, 0.36]} />
          {material}
        </mesh>
      );
    case "sturdy":
      return (
        <mesh>
          <boxGeometry args={[0.6, 0.52, 0.52]} />
          {material}
        </mesh>
      );
    case "shielded":
      return (
        <mesh>
          <boxGeometry args={[0.5, 0.46, 0.46]} />
          {material}
        </mesh>
      );
    case "boxy":
    default:
      return (
        <mesh>
          <boxGeometry args={[0.55, 0.5, 0.5]} />
          {material}
        </mesh>
      );
  }
}

/** The one signature accessory that makes each kind recognizable at a glance. */
function Accessory({ kind, accentColor, t }: { kind: RobotKind; accentColor: string; t: number }) {
  switch (kind) {
    case "boxy": // Iris — headset
      return (
        <group position={[0, 0.05, 0]}>
          <mesh position={[-0.3, 0, 0]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[0.3, 0, 0]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.6} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.3, 0.02, 8, 24, Math.PI]} />
            <meshStandardMaterial color={accentColor} />
          </mesh>
        </group>
      );
    case "rounded": // Hana — clipboard held at the side
      return (
        <mesh position={[0.5, -0.5, 0.18]} rotation={[0, 0.3, 0.1]}>
          <boxGeometry args={[0.24, 0.32, 0.03]} />
          <meshStandardMaterial color="#fff7fb" emissive={accentColor} emissiveIntensity={0.25} />
        </mesh>
      );
    case "sturdy": // Atlas — tool arm (wrench head on the right arm)
      return (
        <mesh position={[0.52, -0.78, 0]} rotation={[0, 0, Math.PI / 5]}>
          <torusGeometry args={[0.1, 0.035, 8, 16, Math.PI * 1.4]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.4} metalness={0.4} />
        </mesh>
      );
    case "slim": // Tess — ticket badge on the chest
      return (
        <mesh position={[0, -0.72, 0.27]} rotation={[0, 0, -0.08]}>
          <planeGeometry args={[0.22, 0.14]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.5} />
        </mesh>
      );
    case "petite": // Finn — star above the head
      return (
        <mesh position={[0, 0.42, 0]} rotation={[0, 0, t * 0.6]}>
          <octahedronGeometry args={[0.1, 0]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.9} />
        </mesh>
      );
    case "shielded": // Gus — shield worn on the chest, always present (not just when blocked)
      return (
        <mesh position={[0, -0.72, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.2, 0.08, 16]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.4} roughness={0.35} metalness={0.25} />
        </mesh>
      );
    case "dome": // Sage — command antenna, drawn with the head group below
    default:
      return null;
  }
}

export default function RoboCompanion({
  position = [0, 0, 0],
  scale = 1,
  color = "#8b5cf6",
  accentColor = "#c4b5fd",
  kind = "boxy",
  state = "idle",
}: RoboCompanionProps) {
  const groupRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const antennaRef = useRef<Mesh>(null);
  const leftEyeRef = useRef<Mesh>(null);
  const rightEyeRef = useRef<Mesh>(null);
  const chestRef = useRef<Mesh>(null);
  const leftArmRef = useRef<Mesh>(null);
  const rightArmRef = useRef<Mesh>(null);
  const holoRef = useRef<Mesh>(null);
  const reduceMotion = useUIStore((s) => s.reduceMotion);

  const prevStateRef = useRef(state);
  const successStartRef = useRef<number | null>(null);
  const bodyScale = kind === "petite" ? 0.82 : kind === "sturdy" ? 1.1 : 1;

  useFrame((frame) => {
    if (reduceMotion) return;
    const t = frame.clock.elapsedTime;

    if (prevStateRef.current !== state) {
      if (state === "success") successStartRef.current = t;
      prevStateRef.current = state;
    }

    const successElapsed = successStartRef.current !== null ? t - successStartRef.current : null;
    const inSuccessJump = state === "success" && successElapsed !== null && successElapsed <= SUCCESS_JUMP_DURATION;

    if (groupRef.current) {
      if (inSuccessJump && successElapsed !== null) {
        const progress = successElapsed / SUCCESS_JUMP_DURATION;
        groupRef.current.position.y = position[1] + Math.sin(progress * Math.PI) * 0.5;
      } else {
        groupRef.current.position.y = position[1] + Math.sin(t * 1.4) * 0.14;
      }
      groupRef.current.rotation.y = Math.sin(t * 0.5) * 0.25;
    }
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.9) * 0.35;
      headRef.current.rotation.x = Math.sin(t * 1.3) * 0.08;
      headRef.current.rotation.z = state === "thinking" ? Math.sin(t * 1.8) * 0.22 : 0;
    }
    if (antennaRef.current) {
      antennaRef.current.rotation.z = Math.sin(t * 2.2) * 0.18;
    }

    const glowColor = inSuccessJump ? SUCCESS_GLOW_COLOR : accentColor;
    const glow = 0.7 + Math.sin(t * 3) * 0.5;
    const scanOffset = state === "thinking" ? Math.sin(t * 2.4) * 0.05 : 0;

    const leftMat = leftEyeRef.current?.material as MeshStandardMaterial | undefined;
    const rightMat = rightEyeRef.current?.material as MeshStandardMaterial | undefined;
    if (leftMat) {
      leftMat.emissiveIntensity = glow;
      leftMat.color.set(glowColor);
      leftMat.emissive.set(glowColor);
    }
    if (rightMat) {
      rightMat.emissiveIntensity = glow;
      rightMat.color.set(glowColor);
      rightMat.emissive.set(glowColor);
    }
    if (leftEyeRef.current) leftEyeRef.current.position.x = -0.15 - scanOffset;
    if (rightEyeRef.current) rightEyeRef.current.position.x = 0.15 + scanOffset;

    const chestMat = chestRef.current?.material as MeshStandardMaterial | undefined;
    if (chestMat) {
      chestMat.color.set(glowColor);
      chestMat.emissive.set(glowColor);
    }

    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = state === "waving" ? -0.15 + Math.sin(t * 6) * 0.65 : -0.15;
    }
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = 0.15;
    }

    if (holoRef.current) {
      holoRef.current.rotation.y = t * 0.8;
      const holoMat = holoRef.current.material as MeshStandardMaterial;
      if (holoMat) holoMat.opacity = 0.45 + Math.sin(t * 3) * 0.2;
    }
  });

  return (
    <group ref={groupRef} position={position} scale={scale * bodyScale}>
      {/* Torso */}
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[0.7, 0.8, 0.5]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.45} metalness={0.1} />
      </mesh>
      {/* Chest light */}
      <mesh ref={chestRef} position={[0, -0.5, 0.26]}>
        <circleGeometry args={[0.1, 24]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.9} />
      </mesh>
      <Accessory kind={kind} accentColor={accentColor} t={0} />

      {/* Head group (neck pivot) */}
      <group ref={headRef} position={[0, 0.15, 0]}>
        <Head kind={kind} color={color} />
        {/* Eyes */}
        <mesh ref={leftEyeRef} position={[-0.15, 0.03, 0.26]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.8} />
        </mesh>
        <mesh ref={rightEyeRef} position={[0.15, 0.03, 0.26]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.8} />
        </mesh>
        {/* Antenna — every kind keeps a small one; Sage's reads as "the" command antenna since
            its dome head has nothing else competing for attention up top. */}
        <mesh ref={antennaRef} position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.3, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.45} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0.46, 0]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={1} />
        </mesh>
        {kind === "boxy" && <Accessory kind={kind} accentColor={accentColor} t={0} />}
      </group>

      {/* Arms */}
      <mesh ref={leftArmRef} position={[-0.45, -0.5, 0]} rotation={[0, 0, 0.15]}>
        <cylinderGeometry args={[0.07, 0.07, 0.55, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.45} metalness={0.1} />
      </mesh>
      <mesh ref={rightArmRef} position={[0.45, -0.5, 0]} rotation={[0, 0, -0.15]}>
        <cylinderGeometry args={[0.07, 0.07, 0.55, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.45} metalness={0.1} />
      </mesh>

      {/* Holographic work panel — only present while actively working. */}
      {state === "working" && (
        <mesh ref={holoRef} position={[0.78, -0.05, 0]}>
          <planeGeometry args={[0.46, 0.46]} />
          <meshStandardMaterial
            color={accentColor} emissive={accentColor} emissiveIntensity={0.7}
            transparent opacity={0.5} roughness={0.3} metalness={0.1}
          />
        </mesh>
      )}

      {/* Blocked flash — only present while blocked. */}
      {state === "blocked" && (
        <mesh position={[0, -0.5, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.38, 0.14, 24]} />
          <meshStandardMaterial
            color={BLOCKED_SHIELD_COLOR} emissive={BLOCKED_SHIELD_COLOR} emissiveIntensity={0.5}
            roughness={0.4} metalness={0.2} transparent opacity={0.85}
          />
        </mesh>
      )}
    </group>
  );
}
