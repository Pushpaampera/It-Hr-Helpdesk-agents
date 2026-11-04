/** The single recommended way to mount the robot mascot. Wraps Scene+RoboCompanion and resolves
 * each agent's full identity (color/accent/robot shape) from src/design/agents.ts, the one
 * place that data lives. */
import type { CSSProperties } from "react";

import { AGENTS, type AgentKey } from "../design/agents";
import RoboCompanion, { type RoboState } from "./RoboCompanion";
import Scene from "./Scene";

export type MascotAgent = AgentKey;

type AgentMascotProps = {
  state?: RoboState;
  agent?: MascotAgent;
  size?: number;
  cameraPosition?: [number, number, number];
  fov?: number;
  bloom?: boolean;
  style?: CSSProperties;
};

export default function AgentMascot({
  state = "idle",
  agent = "it_support",
  size = 140,
  cameraPosition = [0, 0, 5],
  fov = 45,
  bloom = false,
  style,
}: AgentMascotProps) {
  const identity = AGENTS[agent];

  return (
    <div style={{ width: size, height: size, ...style }}>
      <Scene cameraPosition={cameraPosition} fov={fov} bloom={bloom}>
        <RoboCompanion
          position={[0, -0.2, 0]}
          scale={1}
          color={identity.color}
          accentColor={identity.accent}
          kind={identity.robot}
          state={state}
        />
      </Scene>
    </div>
  );
}
