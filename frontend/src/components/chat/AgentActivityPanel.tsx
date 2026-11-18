/** "Assistant activity": shows which of the seven helpers is working on the current question and
 * a step-by-step log of what each one did. It is driven entirely by real agent_event/handoff SSE
 * events (see docs/01_ARCHITECTURE.md's frontend <-> event mapping), never a fake timer.
 *
 * Each helper row shows its state in words ("Working", "Done", "Waiting"), not just colour, and
 * the log is a labelled, keyboard-scrollable region (the Assistant page announces the outcome
 * once, so the step log itself stays quiet and does not chatter). */
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { AGENT_ORDER, AGENTS, type AgentKey } from "../../design/agents";
import AgentAvatar from "../ui/AgentAvatar";
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

type AgentActivityPanelProps = {
  activeAgent: string | null;
  /** Kept for the caller's convenience; the flat layout has no travelling "data stream". */
  pulse?: { from: string; to: string; trigger: number } | null;
  captions: CaptionLogEntry[];
  agentStates: Partial<Record<AgentKey, AgentDeskState>>;
};

export default function AgentActivityPanel({ activeAgent, captions, agentStates }: AgentActivityPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [captions.length]);

  return (
    <Panel style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 style={{ fontSize: "1rem" }}>What the assistant is doing</h2>
        <p style={{ fontSize: "0.8125rem", marginTop: 2 }}>
          {activeAgent && isAgentKey(activeAgent) ? `${AGENTS[activeAgent].name} is working…` : "Idle — ask a question to get started"}
        </p>
      </div>

      <ul
        aria-label="The assistant's helpers"
        style={{ listStyle: "none", margin: 0, padding: "var(--space-3) var(--space-4)", display: "grid", gap: "var(--space-2)" }}
      >
        {AGENT_ORDER.map((key) => {
          const identity = AGENTS[key];
          const desk = agentStates[key];
          const status = desk?.done ? "Done" : desk?.working ? "Working" : "Waiting";
          return (
            <li
              key={key}
              style={{
                display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-md)",
                background: desk?.working ? "var(--brand-soft)" : "transparent",
                border: `1px solid ${desk?.working ? "var(--border-strong)" : "transparent"}`,
              }}
            >
              <AgentAvatar agent={key} size={32} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  {identity.name} <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>· {identity.role}</span>
                </span>
                {desk?.working && desk.bubble && (
                  <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{desk.bubble}</span>
                )}
              </span>
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.8125rem", fontWeight: 600, flexShrink: 0,
                  color: desk?.done ? "var(--success)" : desk?.working ? "var(--accent-primary)" : "var(--text-muted)",
                }}
              >
                {desk?.done && <Check size={14} aria-hidden="true" />}
                {desk?.working && !desk.done && <Loader2 size={14} aria-hidden="true" className="spin" />}
                {status}
              </span>
            </li>
          );
        })}
      </ul>

      <div
        ref={logRef}
        role="region"
        tabIndex={0}
        aria-label="Step-by-step activity"
        style={{
          flex: 1, minHeight: 120, overflowY: "auto", padding: "var(--space-3) var(--space-4)",
          display: "flex", flexDirection: "column", gap: "var(--space-3)", borderTop: "1px solid var(--border-subtle)",
        }}
      >
        {captions.length === 0 && (
          <p style={{ fontSize: "0.8125rem" }}>Each step will be listed here once you send a message.</p>
        )}
        {captions.map((entry) => {
          const identity = entry.agent && isAgentKey(entry.agent) ? AGENTS[entry.agent] : null;
          return (
            <div key={entry.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
              {entry.agent && isAgentKey(entry.agent) ? (
                <AgentAvatar agent={entry.agent} size={24} style={{ marginTop: 1 }} />
              ) : (
                <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: "var(--text-muted)" }} />
              )}
              <span style={{ fontSize: "0.8125rem", lineHeight: 1.45 }}>
                {identity && <strong style={{ color: `var(--agent-${identity.key})` }}>{identity.name}: </strong>}
                <span style={{ color: "var(--text-secondary)" }}>{entry.caption}</span>
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
