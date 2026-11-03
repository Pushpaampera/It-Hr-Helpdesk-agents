/** The live visualization for the AI Assistant page: a small constellation of AgentOrbs that
 * lights up whichever agent is currently working, a DataPulse beam on each handoff, and a
 * scrolling caption log underneath — driven entirely by real agent_event/handoff SSE events
 * (see docs/01_ARCHITECTURE.md's frontend ↔ event mapping), never a fake timer. */
import { useEffect, useRef } from "react";

import Panel from "../ui/Panel";
import AgentOrb, { AGENT_COLORS } from "../../three/AgentOrb";
import DataPulse from "../../three/DataPulse";
import Scene from "../../three/Scene";

const AGENT_ORDER = ["guard", "supervisor", "it_support", "hr_policy", "action", "ticketing", "feedback"] as const;
type KnownAgent = (typeof AGENT_ORDER)[number];

const FRIENDLY_NAMES: Record<KnownAgent, string> = {
  guard: "Gus",
  supervisor: "Sage",
  it_support: "Iris",
  hr_policy: "Hana",
  action: "Atlas",
  ticketing: "Tess",
  feedback: "Finn",
};

function isKnownAgent(agent: string): agent is KnownAgent {
  return (AGENT_ORDER as readonly string[]).includes(agent);
}

function positionFor(index: number): [number, number, number] {
  // Tight enough that all 7 orbs stay inside the frustum of the narrow (~300px) panel at
  // Scene's camera distance/fov below — verified visually, not just computed, since a wider
  // spacing clipped the two outermost orbs off-screen (caught via a live screenshot).
  const spacing = 1.05;
  const x = index * spacing - ((AGENT_ORDER.length - 1) * spacing) / 2;
  return [x, 0, 0];
}

// `id` is a locally-generated key, not the backend's `seq` — a node that re-executes on
// approval resume (e.g. Atlas re-emitting "deciding what action to take") legitimately produces
// two real entries, but they're appended from two separate SSE events arriving at different
// times, not guaranteed distinguishable by sequence number alone across that pause/resume
// boundary. Caught via a live screenshot showing a duplicate-React-key warning.
export type CaptionLogEntry = { id: string; agent: string | null; caption: string };

type AgentActivityPanelProps = {
  activeAgent: string | null;
  pulse: { from: string; to: string; trigger: number } | null;
  captions: CaptionLogEntry[];
};

export default function AgentActivityPanel({ activeAgent, pulse, captions }: AgentActivityPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [captions.length]);

  const fromIndex = pulse && isKnownAgent(pulse.from) ? AGENT_ORDER.indexOf(pulse.from) : -1;
  const toIndex = pulse && isKnownAgent(pulse.to) ? AGENT_ORDER.indexOf(pulse.to) : -1;

  return (
    <Panel style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ height: 160 }}>
        <Scene cameraPosition={[0, 0, 6.5]} fov={40}>
          {AGENT_ORDER.map((agent, i) => (
            <AgentOrb key={agent} agent={agent} position={positionFor(i)} active={activeAgent === agent} radius={0.26} />
          ))}
          {pulse && fromIndex >= 0 && toIndex >= 0 && (
            <DataPulse
              from={positionFor(fromIndex)}
              to={positionFor(toIndex)}
              trigger={pulse.trigger}
              color={isKnownAgent(pulse.to) ? AGENT_COLORS[pulse.to] : "#8b5cf6"}
            />
          )}
        </Scene>
      </div>

      <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "1px solid var(--border-subtle)" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>
          {activeAgent && isKnownAgent(activeAgent) ? `${FRIENDLY_NAMES[activeAgent]} is working...` : "Idle"}
        </div>
      </div>

      <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {captions.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Agent activity will appear here once you send a message.</p>
        )}
        {captions.map((entry) => (
          <div key={entry.id} style={{ display: "flex", gap: "var(--space-2)", fontSize: 12 }}>
            <span
              style={{
                width: 6, height: 6, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                background: entry.agent && isKnownAgent(entry.agent) ? AGENT_COLORS[entry.agent] : "var(--text-muted)",
              }}
            />
            <span style={{ color: "var(--text-secondary)" }}>{entry.caption}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
