/** Canvas wrapper every 3D scene in the app uses, so the 60fps performance budget from
 * CLAUDE.md (devicePixelRatio capped at 2, paused when the tab is hidden) is enforced in one
 * place rather than re-implemented per page. */
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Canvas } from "@react-three/fiber";
import type { ReactNode, CSSProperties } from "react";
import { Suspense } from "react";

import { useUIStore } from "../store/uiStore";

type SceneProps = {
  children: ReactNode;
  cameraPosition?: [number, number, number];
  fov?: number;
  style?: CSSProperties;
  /** A soft glow pass on emissive materials (AgentOrb, DataPulse). Off by default since it's
   * one more render pass — turn it on for hero/showcase scenes where the extra cost is worth
   * it, not for every dashboard widget. */
  bloom?: boolean;
};

export default function Scene({ children, cameraPosition = [0, 0, 8], fov = 45, style, bloom = false }: SceneProps) {
  const tabVisible = useUIStore((s) => s.tabVisible);

  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={tabVisible ? "always" : "demand"}
      camera={{ position: cameraPosition, fov }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%", ...style }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={1.2} />
        <pointLight position={[-5, -3, -4]} intensity={0.4} color="#ff8c1a" />
        {children}
        {bloom && (
          <EffectComposer>
            <Bloom intensity={0.6} luminanceThreshold={0.2} luminanceSmoothing={0.3} mipmapBlur />
          </EffectComposer>
        )}
      </Suspense>
    </Canvas>
  );
}
