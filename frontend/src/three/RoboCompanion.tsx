/** A small procedural robot — boxy head + antenna + glowing eyes on a rounded torso, built
 * entirely from primitives (no model file to load). Idles with a bob/sway/head-turn loop and a
 * pulsing eye glow; the whole system "has a face" the way the colored AgentOrb spheres alone
 * don't. Skips all per-frame motion under reduceMotion, same pattern as AgentOrb. */
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh, MeshStandardMaterial } from "three";

import { useUIStore } from "../store/uiStore";

type RoboCompanionProps = {
  position?: [number, number, number];
  scale?: number;
  color?: string;
  accentColor?: string;
};

export default function RoboCompanion({
  position = [0, 0, 0],
  scale = 1,
  color = "#94a3b8",
  accentColor = "#5da9c9",
}: RoboCompanionProps) {
  const groupRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const antennaRef = useRef<Mesh>(null);
  const leftEyeRef = useRef<Mesh>(null);
  const rightEyeRef = useRef<Mesh>(null);
  const reduceMotion = useUIStore((s) => s.reduceMotion);

  useFrame((state) => {
    if (reduceMotion) return;
    const t = state.clock.elapsedTime;

    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(t * 1.4) * 0.14;
      groupRef.current.rotation.y = Math.sin(t * 0.5) * 0.25;
    }
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.9) * 0.35;
      headRef.current.rotation.x = Math.sin(t * 1.3) * 0.08;
    }
    if (antennaRef.current) {
      antennaRef.current.rotation.z = Math.sin(t * 2.2) * 0.18;
    }
    const glow = 0.7 + Math.sin(t * 3) * 0.5;
    const leftMat = leftEyeRef.current?.material as MeshStandardMaterial | undefined;
    const rightMat = rightEyeRef.current?.material as MeshStandardMaterial | undefined;
    if (leftMat) leftMat.emissiveIntensity = glow;
    if (rightMat) rightMat.emissiveIntensity = glow;
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* Torso */}
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[0.7, 0.8, 0.5]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.5} metalness={0.15} />
      </mesh>
      {/* Chest light */}
      <mesh position={[0, -0.5, 0.26]}>
        <circleGeometry args={[0.1, 24]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.9} />
      </mesh>

      {/* Head group (neck pivot) */}
      <group ref={headRef} position={[0, 0.15, 0]}>
        <mesh>
          <boxGeometry args={[0.55, 0.5, 0.5]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.5} metalness={0.15} />
        </mesh>
        {/* Eyes */}
        <mesh ref={leftEyeRef} position={[-0.15, 0.03, 0.26]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.8} />
        </mesh>
        <mesh ref={rightEyeRef} position={[0.15, 0.03, 0.26]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.8} />
        </mesh>
        {/* Antenna */}
        <mesh ref={antennaRef} position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.3, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} roughness={0.5} metalness={0.15} />
        </mesh>
        <mesh position={[0, 0.46, 0]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={1} />
        </mesh>
      </group>

      {/* Arms */}
      <mesh position={[-0.45, -0.5, 0]} rotation={[0, 0, 0.15]}>
        <cylinderGeometry args={[0.07, 0.07, 0.55, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0.45, -0.5, 0]} rotation={[0, 0, -0.15]}>
        <cylinderGeometry args={[0.07, 0.07, 0.55, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} roughness={0.5} metalness={0.15} />
      </mesh>
    </group>
  );
}
