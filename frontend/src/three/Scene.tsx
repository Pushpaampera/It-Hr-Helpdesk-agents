/** Canvas wrapper every 3D scene in the app uses, so the 60fps performance budget from
 * CLAUDE.md (devicePixelRatio capped at 2, paused when the tab is hidden) is enforced in one
 * place rather than re-implemented per page. */
import { Canvas } from "@react-three/fiber";
import type { ReactNode, CSSProperties } from "react";
import { Suspense } from "react";

import { useUIStore } from "../store/uiStore";

type SceneProps = {
  children: ReactNode;
  cameraPosition?: [number, number, number];
  fov?: number;
  style?: CSSProperties;
};

export default function Scene({ children, cameraPosition = [0, 0, 8], fov = 45, style }: SceneProps) {
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
        <pointLight position={[-5, -3, -4]} intensity={0.4} color="#8b5cf6" />
        {children}
      </Suspense>
    </Canvas>
  );
}
