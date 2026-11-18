/** Evaluation (admin). Triggers a real golden-set run through the live agent graph
 * (POST /api/eval/run — all 70 questions, synchronous, matches `poetry run eval`), lists past
 * runs (GET /api/eval/runs), and drills into one run's full per-question breakdown
 * (GET /api/eval/runs/{id}). */
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { apiGet, apiPost } from "../../api/client";
import type { EvalRun, EvalRunDetail } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import InfoBanner from "../../components/ui/InfoBanner";
import ChartTable from "../../components/ui/ChartTable";
import InfoTooltip from "../../components/ui/InfoTooltip";
import Panel from "../../components/ui/Panel";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import PageTransition from "../../design/pageTransition";
import hover from "../../design/hoverEffects.module.css";

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
    <PageTransition routeKey="evaluation">
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
        <DashboardHeader title="Evaluation" subtitle="A fixed set of 70 test questions with known-correct answers, used to check how accurate the AI is." />
        <Button variant="primary" onClick={trigger} disabled={running} style={{ flexShrink: 0, marginTop: 2 }}>
          {running ? "Running (all 70 questions)..." : "Run evaluation"}
        </Button>
      </div>
      <InfoBanner id="evaluation">
        This page tests the AI against 70 questions with known-correct answers, so you can see how accurate it is and track whether it's getting better or worse over time.
      </InfoBanner>

      {runs && runs.length >= 2 && (
        <Panel style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
          <h2 style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            Pass rate across recent runs
            <InfoTooltip text="What share of the 70 test questions the AI answered correctly, for each time this test was run." />
          </h2>
          <div style={{ height: 220 }}>
            <ChartTable
              caption="Pass rate for each recent evaluation run"
              columns={["Run date", "Pass rate"]}
              rows={runs.slice().reverse().map((r) => [new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }), `${Math.round(r.summary.pass_rate * 100)}%`])}
            />
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                accessibilityLayer
                data={runs
                  .slice()
                  .reverse()
                  .map((r) => ({
                    run: new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                    pass_rate_pct: Math.round(r.summary.pass_rate * 100),
                  }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="run" tick={{ fill: "var(--text-secondary)", fontSize: "0.8125rem" }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "var(--text-secondary)", fontSize: "0.8125rem" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  label={{ value: "Pass rate %", angle: -90, position: "insideLeft", fill: "var(--text-secondary)", fontSize: "0.8125rem" }}
                />
                <Tooltip
                  contentStyle={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)", borderRadius: 8, fontSize: "0.8125rem" }}
                  labelStyle={{ color: "var(--text-secondary)" }}
                  formatter={(v: number) => [`${v}%`, "Pass rate"]}
                />
                <Legend wrapperStyle={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }} />
                <Bar dataKey="pass_rate_pct" name="Pass rate" fill="var(--success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      <div style={{ display: "grid", gridTemplateColumns: selectedId ? "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" : "1fr", gap: "var(--space-5)" }}>
        <Panel style={{ padding: 0, overflow: "hidden", alignSelf: "start" }}>
          {!runs ? (
            <p style={{ fontSize: "0.8125rem", padding: "var(--space-5)" }}>Loading...</p>
          ) : runs.length === 0 ? (
            <p style={{ fontSize: "0.8125rem", padding: "var(--space-5)" }}>No eval runs yet — click "Run evaluation".</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>
                  <th scope="col" style={{ padding: "var(--space-3) var(--space-4)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>Run</th>
                  <th scope="col" style={{ padding: "var(--space-3) var(--space-4)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>Pass rate</th>
                  <th scope="col" style={{ padding: "var(--space-3) var(--space-4)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
                      Answer quality
                      <InfoTooltip text="A 0-1 score of how close each answer was to the known-correct answer, averaged across all 70 questions." />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={hover.glowOnHover}
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
    </PageTransition>
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
        <h2 style={{ fontSize: "0.875rem" }}>Run breakdown</h2>
        <button onClick={onClose} style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, minHeight: 44, padding: "0 var(--space-4)" }}>
          Close
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: "0.8125rem" }}>{error}</p>}
      {!detail ? (
        <p style={{ fontSize: "0.8125rem" }}>Loading...</p>
      ) : (
        <div tabIndex={0} style={{ display: "grid", gap: "var(--space-3)", maxHeight: 520, overflowY: "auto"  }}>
          {Object.entries(detail.summary.by_route).map(([route, r]) => (
            <div key={route} style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              {route}: {r.passed}/{r.total} passed
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: "var(--space-2)", paddingTop: "var(--space-3)" }} />
          {detail.results.map((r) => (
            <div key={r.id} style={{ fontSize: "0.8125rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "var(--space-2)" }}>
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
