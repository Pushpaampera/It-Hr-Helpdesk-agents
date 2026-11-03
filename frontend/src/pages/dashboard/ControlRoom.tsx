/** Control Room (admin). Per-agent 24h health (GET /api/agents/status), a live always-on feed
 * of every user's agent activity (GET /api/agents/live, SSE), and a recent-runs table with a
 * "Replay" control that opens a run's full event timeline (GET /api/runs/{id}/events) — the
 * operator-facing view of the same multi-agent system the Assistant page shows one conversation
 * of at a time. */
import { useEffect, useRef, useState } from "react";

import { apiGet } from "../../api/client";
import { streamGetSSE } from "../../api/sse";
import type { AgentEventPayload, AgentStatus, LiveAgentEvent, RunEventsResponse, RunSummary } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Panel from "../../components/ui/Panel";

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
    <div>
      <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>Control Room</h1>
      <p style={{ marginBottom: "var(--space-5)" }}>Live health and activity across every agent, for every user.</p>

      {!statuses ? (
        <Panel style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>Loading...</Panel>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
          {statuses.map((s) => (
            <Panel key={s.agent} style={{ padding: "var(--space-4)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>{s.job}</div>
              <div style={{ fontSize: 20, fontFamily: "var(--font-heading)" }}>{s.events_24h}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>events / 24h</div>
              <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.avg_latency_ms}ms avg</span>
                {s.errors_24h > 0 && <Badge label={`${s.errors_24h} errors`} tone="danger" />}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: selectedRunId ? "1fr 1fr 380px" : "1fr 1fr", gap: "var(--space-5)" }}>
        <Panel style={{ padding: "var(--space-5)" }}>
          <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>
            Live feed <span style={{ fontSize: 11, color: "var(--success)" }}>●</span>
          </h2>
          <div style={{ display: "grid", gap: "var(--space-2)", maxHeight: 480, overflowY: "auto" }}>
            {liveFeed.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Waiting for activity...</p>
            ) : (
              liveFeed.map((e, i) => (
                <div key={`${e.run_id}-${e.seq}-${i}`} style={{ fontSize: 12, borderBottom: "1px solid var(--border-subtle)", paddingBottom: 6 }}>
                  <span style={{ color: "var(--text-muted)" }}>{new Date(e.ts).toLocaleTimeString()}</span>{" "}
                  {e.user_name && <strong>{e.user_name}</strong>}{" "}
                  <span style={{ color: "var(--text-secondary)" }}>{e.caption}</span>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel style={{ padding: "var(--space-5)" }}>
          <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>Recent runs</h2>
          {!runs ? (
            <p style={{ fontSize: 13 }}>Loading...</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-2)", maxHeight: 480, overflowY: "auto" }}>
              {runs.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedRunId(r.id)}
                  style={{
                    cursor: "pointer", fontSize: 12, padding: "var(--space-2)", borderRadius: "var(--radius-sm)",
                    background: selectedRunId === r.id ? "var(--bg-elevated)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      <strong>{r.user_name}</strong> — {r.query}
                    </span>
                    <Badge label={r.status} tone={statusTone(r.status)} />
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    {r.route ?? "—"} · {new Date(r.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {selectedRunId && <RunReplay runId={selectedRunId} onClose={() => setSelectedRunId(null)} />}
      </div>
    </div>
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
        <h2 style={{ fontSize: 14 }}>Replay</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>
          Close
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
      {!detail ? (
        <p style={{ fontSize: 13 }}>Loading...</p>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-2)", maxHeight: 480, overflowY: "auto" }}>
          {(detail.events as AgentEventPayload[]).map((e, i) => (
            <div key={i} style={{ fontSize: 12, borderLeft: "2px solid var(--border-subtle)", paddingLeft: "var(--space-3)" }}>
              <div style={{ color: "var(--text-secondary)" }}>
                <strong>{e.agent}</strong> — {e.status}
              </div>
              <div style={{ color: "var(--text-muted)" }}>{e.caption}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
