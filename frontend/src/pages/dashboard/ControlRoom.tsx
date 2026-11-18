/** Control Room (admin). Per-agent 24h health (GET /api/agents/status), a live always-on feed
 * of every user's agent activity (GET /api/agents/live, SSE), and a recent-runs table with a
 * "Replay" control that opens a run's full event timeline (GET /api/runs/{id}/events) — the
 * operator-facing view of the same multi-agent system the Assistant page shows one conversation
 * of at a time. */
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { apiGet } from "../../api/client";
import { streamGetSSE } from "../../api/sse";
import type { AgentEventPayload, AgentStatus, LiveAgentEvent, RunEventsResponse, RunSummary } from "../../api/types";
import AgentAvatar from "../../components/ui/AgentAvatar";
import Badge from "../../components/ui/Badge";
import InfoBanner from "../../components/ui/InfoBanner";
import InfoTooltip from "../../components/ui/InfoTooltip";
import Panel from "../../components/ui/Panel";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import { AGENTS, isAgentKey, type AgentKey } from "../../design/agents";

/** A run's stored route ("IT" / "HR" / "OTHER") → the agent that answered it. "OTHER" questions
 * are answered by Sage, the router, directly. */
const ROUTE_AGENT: Record<string, AgentKey> = { IT: "it_support", HR: "hr_policy", OTHER: "supervisor" };
function routeAgent(route: string | null): AgentKey | null {
  return route ? ROUTE_AGENT[route] ?? null : null;
}
import { fadeUp, staggerContainer } from "../../design/motion";
import PageTransition from "../../design/pageTransition";
import hover from "../../design/hoverEffects.module.css";

const LIVE_FEED_LIMIT = 40;

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "resolved") return "success";
  if (status === "escalated") return "warning";
  if (status === "awaiting_approval") return "info";
  if (status === "failed") return "danger";
  return "neutral"; // "running"
}

export default function ControlRoom() {
  const [statuses, setStatuses] = useState<AgentStatus[] | null>(null);
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [liveFeed, setLiveFeed] = useState<LiveAgentEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  function load() {
    Promise.all([apiGet<AgentStatus[]>("/agents/status"), apiGet<RunSummary[]>("/agents/runs?limit=30")])
      .then(([s, r]) => {
        setStatuses(s);
        setRuns(r);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load Control Room data"));
  }

  useEffect(load, []);

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    streamGetSSE<LiveAgentEvent>(
      "/agents/live",
      (event) => setLiveFeed((f) => [event, ...f].slice(0, LIVE_FEED_LIMIT)),
      controller.signal,
    ).catch((err) => {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Live feed disconnected");
      }
    });
    return () => controller.abort();
  }, []);

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;

  return (
    <PageTransition routeKey="control-room">
    <div>
      <DashboardHeader title="Control Room" subtitle="Live health and activity across every agent, for every user." />
      <InfoBanner id="control-room">
        This is the operator's view into what every AI specialist is doing right now, across every employee — how busy each one is, a live feed of activity, and a way to replay any past conversation step by step.
      </InfoBanner>

      {!statuses ? (
        <Panel style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>Loading...</Panel>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer()}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}
        >
          {statuses.map((s) => (
            <motion.div key={s.agent} variants={fadeUp}>
            <Panel className={hover.liftOnHover} style={{ padding: "var(--space-4)" }}>
              {isAgentKey(s.agent) && <AgentAvatar agent={s.agent} size={40} style={{ marginBottom: "var(--space-3)" }} />}
              <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: 2 }}>{s.name} <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>· AI agent</span></div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>{s.job}</div>
              <div style={{ fontSize: "1.25rem", fontFamily: "var(--font-heading)" }}>{s.events_24h}</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>actions in the last 24h</div>
              <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{s.avg_latency_ms}ms avg response time</span>
                {s.errors_24h > 0 && <Badge label={`${s.errors_24h} errors`} tone="danger" />}
              </div>
            </Panel>
            </motion.div>
          ))}
        </motion.div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: selectedRunId ? "1fr 1fr 380px" : "1fr 1fr", gap: "var(--space-5)" }}>
        <Panel style={{ padding: "var(--space-5)" }}>
          <h2 style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            Live feed <span style={{ fontSize: "0.8125rem", color: "var(--success)" }}>●</span>
            <InfoTooltip text="What every AI specialist is doing right now, across all employees, as it happens." />
          </h2>
          <div tabIndex={0} style={{ display: "grid", gap: "var(--space-2)", maxHeight: 480, overflowY: "auto"  }}>
            {liveFeed.length === 0 ? (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Waiting for activity...</p>
            ) : (
              liveFeed.map((e, i) => (
                <div key={`${e.run_id}-${e.seq}-${i}`} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start", fontSize: "0.8125rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: 6 }}>
                  {isAgentKey(e.agent) && <AgentAvatar agent={e.agent} size={28} style={{ marginTop: 2 }} />}
                  <span>
                    <span style={{ color: "var(--text-muted)" }}>{new Date(e.ts).toLocaleTimeString()}</span>{" "}
                    {e.user_name && <strong>{e.user_name}</strong>}{" "}
                    <span style={{ color: "var(--text-secondary)" }}>{e.caption}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel style={{ padding: "var(--space-5)" }}>
          <h2 style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            Recent conversations
            <InfoTooltip text="Click any conversation to replay it step by step and see exactly what each specialist did." />
          </h2>
          {!runs ? (
            <p style={{ fontSize: "0.8125rem" }}>Loading...</p>
          ) : (
            <div tabIndex={0} style={{ display: "grid", gap: "var(--space-2)", maxHeight: 480, overflowY: "auto"  }}>
              {runs.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedRunId(r.id)}
                  className={hover.glowOnHover}
                  style={{
                    cursor: "pointer", fontSize: "0.8125rem", padding: "var(--space-2)", borderRadius: "var(--radius-sm)",
                    background: selectedRunId === r.id ? "var(--bg-elevated)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)" }}>
                    {routeAgent(r.route) && <AgentAvatar agent={routeAgent(r.route)!} size={28} />}
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      <strong>{r.user_name}</strong> — {r.query}
                    </span>
                    <Badge label={r.status} tone={statusTone(r.status)} />
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                    {routeAgent(r.route) ? `Handled by ${AGENTS[routeAgent(r.route)!].name} (${AGENTS[routeAgent(r.route)!].role})` : "Routing…"} · {new Date(r.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {selectedRunId && <RunReplay runId={selectedRunId} onClose={() => setSelectedRunId(null)} />}
      </div>
    </div>
    </PageTransition>
  );
}

function RunReplay({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<RunEventsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    apiGet<RunEventsResponse>(`/runs/${runId}/events`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load run"));
  }, [runId]);

  return (
    <Panel style={{ padding: "var(--space-5)", alignSelf: "start" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
        <h2 style={{ fontSize: "0.875rem" }}>Replay</h2>
        <button onClick={onClose} style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, minHeight: 44, padding: "0 var(--space-4)" }}>
          Close
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: "0.8125rem" }}>{error}</p>}
      {!detail ? (
        <p style={{ fontSize: "0.8125rem" }}>Loading...</p>
      ) : (
        <div tabIndex={0} style={{ display: "grid", gap: "var(--space-2)", maxHeight: 480, overflowY: "auto"  }}>
          {(detail.events as AgentEventPayload[]).map((e, i) => (
            <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start", fontSize: "0.8125rem", borderLeft: "2px solid var(--border-subtle)", paddingLeft: "var(--space-3)" }}>
              {isAgentKey(e.agent) && <AgentAvatar agent={e.agent} size={28} style={{ marginTop: 2 }} />}
              <div>
                <div style={{ color: "var(--text-secondary)" }}>
                  <strong>{isAgentKey(e.agent) ? AGENTS[e.agent].name : e.agent}</strong> — {e.status}
                </div>
                <div style={{ color: "var(--text-muted)" }}>{e.caption}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
