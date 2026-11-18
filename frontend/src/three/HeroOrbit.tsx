/** The landing page's 3D animation, drawn inside the navy hero banner, behind its content.
 *
 * A dotted globe turns slowly in the banner's right-hand column, three thin orbit rings circle it,
 * and seven glowing dots — one per helper — travel along the rings. Faint specks drift upward
 * across the whole banner, and the scene tilts a little towards the mouse.
 *
 * The orbit is centred on its stage wherever the layout puts it (wide screens: right column;
 * phones: under the text) — Landing measures the stage and passes its position as `anchor`.
 *
 * Rules it follows (CLAUDE.md): decoration only (aria-hidden, no pointer events); frozen to a
 * single still frame under "Stop animations" / reduce motion and paused when the tab is hidden;
 * capped point counts, no post-processing; colours are Ampera's (lavender #BCBED0, magenta lifted
 * to #D77BD5 for the navy background, white) — hard-coded because Three.js can't read CSS
 * variables. If WebGL isn't available the banner simply shows without it. */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";

import { useUIStore } from "../store/uiStore";

/** The stage's centre and size, as fractions of the banner (0–1). */
export type OrbitAnchor = { x: number; y: number; w: number; h: number };

const LAVENDER = "#bcbed0";
const MAGENTA = "#d77bd5";
const WHITE = "#ffffff";

const SPHERE_DOTS = 900;
const SHELL_DOTS = 360;
const SPECKS = 160;

/** Evenly spread points on a sphere (Fibonacci lattice). */
function spherePoints(count: number, radius: number): Float32Array {
  const arr = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    arr[i * 3] = Math.cos(theta) * r * radius;
    arr[i * 3 + 1] = y * radius;
    arr[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return arr;
}

// Three tilted rings; the helper dots sit on them at these angles (3 + 2 + 2 = 7 helpers).
const RINGS = [
  { radius: 4.6, tilt: [1.05, 0.15, 0.32] as const, speed: 0.22, color: MAGENTA, opacity: 0.55, nodes: [0, 2.1, 4.2] },
  { radius: 5.2, tilt: [1.2, -0.35, -0.45] as const, speed: -0.16, color: LAVENDER, opacity: 0.4, nodes: [1.0, 4.0] },
  { radius: 5.8, tilt: [0.75, 0.5, 0.1] as const, speed: 0.12, color: MAGENTA, opacity: 0.32, nodes: [2.6, 5.6] },
];

function Orbit({ anchor, pointer }: { anchor: OrbitAnchor; pointer: React.MutableRefObject<{ x: number; y: number }> }) {
  const { viewport } = useThree();
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const tiltRef = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Points>(null);
  const shellRef = useRef<THREE.Points>(null);
  const spinRefs = useRef<(THREE.Group | null)[]>([]);
  const specksRef = useRef<THREE.Points>(null);

  const sphere = useMemo(() => spherePoints(SPHERE_DOTS, 3.4), []);
  const shell = useMemo(() => spherePoints(SHELL_DOTS, 4.0), []);
  const specks = useMemo(() => {
    const arr = new Float32Array(SPECKS * 3);
    for (let i = 0; i < SPECKS; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 2;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 2;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 3;
    }
    return arr;
  }, []);

  // Centre the orbit on its stage and size it to fit the stage (rings may run slightly past it).
  const cx = (anchor.x - 0.5) * viewport.width;
  const cy = (0.5 - anchor.y) * viewport.height;
  const stageW = anchor.w * viewport.width;
  const stageH = anchor.h * viewport.height;
  const scale = Math.max(Math.min(stageW / 11, stageH / 7.2, 1.3), 0.45);

  useFrame((_, delta) => {
    if (reduceMotion) return;
    const d = Math.min(delta, 0.05);
    if (sphereRef.current) sphereRef.current.rotation.y += d * 0.07;
    if (shellRef.current) shellRef.current.rotation.y -= d * 0.045;
    RINGS.forEach((ring, i) => {
      const g = spinRefs.current[i];
      if (g) g.rotation.z += d * ring.speed;
    });
    if (tiltRef.current) {
      // Ease towards the mouse — a gentle parallax, never more than ~10 degrees.
      tiltRef.current.rotation.x += (pointer.current.y * 0.18 - tiltRef.current.rotation.x) * 0.04;
      tiltRef.current.rotation.y += (pointer.current.x * 0.25 - tiltRef.current.rotation.y) * 0.04;
    }
    const pts = specksRef.current?.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (pts) {
      const arr = pts.array as Float32Array;
      for (let i = 0; i < SPECKS; i++) {
        arr[i * 3 + 1] += d * (0.015 + (i % 5) * 0.006);
        if (arr[i * 3 + 1] > 1) arr[i * 3 + 1] = -1;
      }
      pts.needsUpdate = true;
    }
  });

  return (
    <>
      {/* Drifting specks across the whole banner (stored in -1..1, stretched to the view). */}
      <points ref={specksRef} scale={[viewport.width / 2, viewport.height / 2, 1]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[specks, 3]} />
        </bufferGeometry>
        <pointsMaterial color={LAVENDER} size={0.045} sizeAttenuation transparent opacity={0.45} depthWrite={false} />
      </points>

      <group position={[cx, cy, 0]} scale={scale}>
        <group ref={tiltRef}>
          <points ref={sphereRef}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[sphere, 3]} />
            </bufferGeometry>
            <pointsMaterial color={LAVENDER} size={0.06} sizeAttenuation transparent opacity={0.8} depthWrite={false} />
          </points>
          <points ref={shellRef}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[shell, 3]} />
            </bufferGeometry>
            <pointsMaterial color={MAGENTA} size={0.05} sizeAttenuation transparent opacity={0.6} depthWrite={false} />
          </points>

          {RINGS.map((ring, i) => (
            <group key={i} rotation={[ring.tilt[0], ring.tilt[1], ring.tilt[2]]}>
              <group ref={(el) => { spinRefs.current[i] = el; }}>
                <mesh>
                  <torusGeometry args={[ring.radius, 0.014, 6, 220]} />
                  <meshBasicMaterial color={ring.color} transparent opacity={ring.opacity} depthWrite={false} />
                </mesh>
                {ring.nodes.map((angle) => (
                  <group key={angle} position={[Math.cos(angle) * ring.radius, Math.sin(angle) * ring.radius, 0]}>
                    <mesh>
                      <sphereGeometry args={[0.075, 16, 16]} />
                      <meshBasicMaterial color={WHITE} />
                    </mesh>
                    <mesh>
                      <sphereGeometry args={[0.18, 16, 16]} />
                      <meshBasicMaterial color={MAGENTA} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
                    </mesh>
                  </group>
                ))}
              </group>
            </group>
          ))}
        </group>
      </group>
    </>
  );
}

/** If WebGL fails for any reason, show nothing rather than break the page. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function HeroOrbit({ anchor }: { anchor: OrbitAnchor }) {
  const tabVisible = useUIStore((s) => s.tabVisible);
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (reduceMotion) return;
    function onMove(e: PointerEvent) {
      pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduceMotion]);

  return (
    <Quiet>
      <Canvas
        dpr={[1, 2]}
        frameloop={tabVisible && !reduceMotion ? "always" : "demand"}
        camera={{ position: [0, 0, 12], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <Orbit anchor={anchor} pointer={pointer} />
      </Canvas>
    </Quiet>
  );
}
