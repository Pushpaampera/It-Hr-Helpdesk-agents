/** The "Agent Workroom": a mini 3D office where all 7 robots sit at their own desks and are
 * always visible, driven entirely by real agent_event/handoff SSE events (see
 * docs/01_ARCHITECTURE.md's frontend <-> event mapping), never a fake timer. When a question
 * comes in, a data stream travels from whichever agent just finished to the one taking over,
 * that robot's desk shows "working" + a plain-English speech bubble, and a green check appears
 * once its step completes. Below the scene, a timeline lists every step with the agent's avatar,
 * name, and one-line action. */
import { useEffect, useRef } from "react";

import { AGENT_ORDER, AGENTS, type AgentKey } from "../../design/agents";
import AgentDesk from "../../three/AgentDesk";
import DataPulse from "../../three/DataPulse";
import Scene from "../../three/Scene";
import type { RoboState } from "../../three/RoboCompanion";
import Panel from "../ui/Panel";

function isAgentKey(agent: string): agent is AgentKey {
  return (AGENT_ORDER as readonly string[]).includes(agent);
}

// `id` is a locally-generated key, not the backend's `seq` — a node that re-executes on
// approval resume (e.g. Atlas re-emitting "deciding what action to take") legitimately produces
// two real entries, but they're appended from two separate SSE events arriving at different
// times, not guaranteed distinguishable by sequence number alone across that pause/resume
// boundary. Caught via a live screenshot showing a duplicate-React-key warning.
export type CaptionLogEntry = { id: string; agent: string | null; caption: string };

export type AgentDeskState = { working: boolean; done: boolean; bubble: string | null };

const DESK_POSITIONS: Record<AgentKey, [number, number, number]> = {
  supervisor: [0, 1.7, 1.8],
  it_support: [-2.3, 0.35, -2.1],
  hr_policy: [0, 0.35, -2.5],
  action: [2.3, 0.35, -2.1],
  ticketing: [-2.3, -0.95, -5.2],
  feedback: [0, -0.95, -5.6],
  guard: [2.3, -0.95, -5.2],
};

type AgentActivityPanelProps = {
  activeAgent: string | null;
  pulse: { from: string; to: string; trigger: number } | null;
  captions: CaptionLogEntry[];
  agentStates: Partial<Record<AgentKey, AgentDeskState>>;
};

export default function AgentActivityPanel({ activeAgent, pulse, captions, agentStates }: AgentActivityPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [captions.length]);

  const pulseFrom = pulse && isAgentKey(pulse.from) ? DESK_POSITIONS[pulse.from] : null;
  const pulseTo = pulse && isAgentKey(pulse.to) ? DESK_POSITIONS[pulse.to] : null;
  const pulseColor = pulse && isAgentKey(pulse.to) ? AGENTS[pulse.to].color : "#8b5cf6";

  return (
    <Panel style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 style={{ fontSize: 14, fontWeight: 700 }}>Agent Workroom</h2>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {activeAgent && isAgentKey(activeAgent) ? `${AGENTS[activeAgent].name} is working…` : "Idle — all agents at their desks"}
        </div>
      </div>

      <div style={{ height: 290 }}>
        <Scene cameraPosition={[0, 0.1, 10.5]} fov={38}>
          {AGENT_ORDER.map((key) => {
            const desk = agentStates[key];
            const state: RoboState = desk?.done ? "success" : desk?.working ? "working" : "idle";
            return (
              <AgentDesk
                key={key}
                agentKey={key}
                position={DESK_POSITIONS[key]}
                scale={key === "supervisor" ? 0.62 : 0.56}
                state={state}
                done={desk?.done ?? false}
                bubble={desk?.working ? desk.bubble : null}
                isCore={key === "supervisor"}
              />
            );
          })}
          {pulse && pulseFrom && pulseTo && <DataPulse from={pulseFrom} to={pulseTo} trigger={pulse.trigger} color={pulseColor} duration={0.6} />}
        </Scene>
      </div>

      <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
        {captions.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Agent activity will appear here once you send a message.</p>
        )}
        {captions.map((entry) => {
          const identity = entry.agent && isAgentKey(entry.agent) ? AGENTS[entry.agent] : null;
          return (
            <div key={entry.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
              <span
                style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: "#fff",
                  background: identity?.color ?? "var(--text-muted)",
                }}
              >
                {identity ? identity.name[0] : "?"}
              </span>
              <span style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                {identity && <strong style={{ color: identity.color }}>{identity.name}: </strong>}
                <span style={{ color: "var(--text-secondary)" }}>{entry.caption}</span>
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
