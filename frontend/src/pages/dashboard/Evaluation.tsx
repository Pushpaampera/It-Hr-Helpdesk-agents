/** Evaluation (admin). Triggers a real golden-set run through the live agent graph
 * (POST /api/eval/run — all 70 questions, synchronous, matches `poetry run eval`), lists past
 * runs (GET /api/eval/runs), and drills into one run's full per-question breakdown
 * (GET /api/eval/runs/{id}). */
import { useEffect, useState } from "react";

import { apiGet, apiPost } from "../../api/client";
import type { EvalRun, EvalRunDetail } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";

export default function Evaluation() {
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function load() {
    apiGet<EvalRun[]>("/eval/runs")
      .then(setRuns)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load eval runs"));
  }

  useEffect(load, []);

  async function trigger() {
    setRunning(true);
    setError(null);
    try {
      const result = await apiPost<{ eval_run_id: string; summary: unknown }>("/eval/run");
      load();
      setSelectedId(result.eval_run_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eval run failed");
    } finally {
      setRunning(false);
    }
  }

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-5)" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>Evaluation</h1>
          <p>The 70-question golden set, run through the real agent graph.</p>
        </div>
        <Button variant="primary" onClick={trigger} disabled={running}>
          {running ? "Running (all 70 questions)..." : "Run evaluation"}
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selectedId ? "1fr 1fr" : "1fr", gap: "var(--space-5)" }}>
        <Panel style={{ padding: 0, overflow: "hidden", alignSelf: "start" }}>
          {!runs ? (
            <p style={{ fontSize: 13, padding: "var(--space-5)" }}>Loading...</p>
          ) : runs.length === 0 ? (
            <p style={{ fontSize: 13, padding: "var(--space-5)" }}>No eval runs yet — click "Run evaluation".</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>
                  <th style={{ padding: "var(--space-3) var(--space-4)", fontSize: 11, color: "var(--text-muted)" }}>Run</th>
                  <th style={{ padding: "var(--space-3) var(--space-4)", fontSize: 11, color: "var(--text-muted)" }}>Pass rate</th>
                  <th style={{ padding: "var(--space-3) var(--space-4)", fontSize: 11, color: "var(--text-muted)" }}>Correctness</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    style={{ cursor: "pointer", borderBottom: "1px solid var(--border-subtle)", background: selectedId === r.id ? "var(--bg-elevated)" : "transparent" }}
                  >
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                      <Badge label={`${r.summary.passed}/${r.summary.total} (${Math.round(r.summary.pass_rate * 100)}%)`} tone={r.summary.pass_rate >= 0.8 ? "success" : r.summary.pass_rate >= 0.6 ? "warning" : "danger"} />
                    </td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}>{r.summary.avg_correctness.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {selectedId && <EvalRunDetailPanel runId={selectedId} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
}

function EvalRunDetailPanel({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<EvalRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    apiGet<EvalRunDetail>(`/eval/runs/${runId}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load run detail"));
  }, [runId]);

  return (
    <Panel style={{ padding: "var(--space-5)", alignSelf: "start" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: 14 }}>Run breakdown</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>
          Close
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
      {!detail ? (
        <p style={{ fontSize: 13 }}>Loading...</p>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)", maxHeight: 520, overflowY: "auto" }}>
          {Object.entries(detail.summary.by_route).map(([route, r]) => (
            <div key={route} style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {route}: {r.passed}/{r.total} passed
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: "var(--space-2)", paddingTop: "var(--space-3)" }} />
          {detail.results.map((r) => (
            <div key={r.id} style={{ fontSize: 12, borderBottom: "1px solid var(--border-subtle)", paddingBottom: "var(--space-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
                <span>{r.question}</span>
                <Badge label={r.passed ? "pass" : "fail"} tone={r.passed ? "success" : "danger"} />
              </div>
              <div style={{ color: "var(--text-muted)" }}>
                expected {r.expected_route}, got {r.actual_route ?? "—"} · correctness {r.correctness.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
