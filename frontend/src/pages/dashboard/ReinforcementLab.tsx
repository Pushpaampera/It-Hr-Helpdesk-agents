/** Reinforcement Lab (admin). The LinUCB bandit's real state (GET /api/bandit/stats): each
 * retrieval strategy's pulls/average reward, cumulative regret vs. the best-performing arm, a
 * reward-over-time chart, and per-context win rates — "why did the bandit pick this strategy"
 * made visible, the same comparison the Policy Knowledge Base's "Compare strategies" view lets
 * you inspect for one query at a time. */
import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { apiGet } from "../../api/client";
import type { BanditStats } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Panel from "../../components/ui/Panel";

const ARM_COLORS: Record<string, string> = {
  hybrid_rerank: "#8b5cf6",
  lexical_heavy: "#22d3ee",
  semantic_heavy: "#fbbf24",
};

export default function ReinforcementLab() {
  const [stats, setStats] = useState<BanditStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<BanditStats>("/bandit/stats")
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load bandit stats"));
  }, []);

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;
  if (!stats) return <Panel style={{ padding: "var(--space-5)" }}>Loading...</Panel>;

  // Reshape reward_over_time (one row per day+arm) into one row per day with each arm as a column, for the chart.
  const days = Array.from(new Set(stats.reward_over_time.map((r) => r.day))).sort();
  const chartData = days.map((day) => {
    const row: Record<string, string | number> = { day };
    for (const r of stats.reward_over_time.filter((x) => x.day === day)) {
      row[r.arm] = r.avg_reward;
    }
    return row;
  });

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>Reinforcement Lab</h1>
      <p style={{ marginBottom: "var(--space-5)" }}>
        How the retrieval-strategy bandit is learning from real feedback — Finn's live state.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
        <StatCard label="Total pulls" value={stats.total_pulls} />
        <StatCard label="Best arm" value={stats.best_arm ?? "—"} />
        <StatCard label="Cumulative regret" value={stats.cumulative_regret?.toFixed(2) ?? "—"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
        {stats.arms.map((a) => (
          <Panel key={a.arm_id} style={{ padding: "var(--space-5)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: ARM_COLORS[a.name] ?? "var(--text-muted)" }} />
              <strong style={{ fontSize: 14, fontFamily: "var(--font-mono)" }}>{a.name}</strong>
              {stats.best_arm === a.name && <Badge label="leading" tone="success" />}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
              {String(a.config.description ?? "")}
            </p>
            <div style={{ display: "flex", gap: "var(--space-4)" }}>
              <div>
                <div style={{ fontSize: 20, fontFamily: "var(--font-heading)" }}>{a.pulls}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>pulls</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontFamily: "var(--font-heading)" }}>{a.avg_reward?.toFixed(3) ?? "—"}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>avg reward</div>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <Panel style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>Average reward over time</h2>
        {chartData.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No reward history yet.</p>
        ) : (
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} tick={{ fill: "#6b7097", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 1]} tick={{ fill: "#6b7097", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                <Tooltip contentStyle={{ background: "#0a0c1b", border: "1px solid rgba(148,163,255,0.12)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#a6acd6" }} />
                {Object.keys(ARM_COLORS).map((arm) => (
                  <Line key={arm} type="monotone" dataKey={arm} stroke={ARM_COLORS[arm]} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel style={{ padding: "var(--space-5)" }}>
        <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>Win rate by context</h2>
        {stats.context_win_rates.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No context data yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>
                <th style={{ padding: "var(--space-2)", color: "var(--text-muted)", fontSize: 11 }}>Dept</th>
                <th style={{ padding: "var(--space-2)", color: "var(--text-muted)", fontSize: 11 }}>Has error code</th>
                <th style={{ padding: "var(--space-2)", color: "var(--text-muted)", fontSize: 11 }}>Strategy</th>
                <th style={{ padding: "var(--space-2)", color: "var(--text-muted)", fontSize: 11 }}>Decisions</th>
              </tr>
            </thead>
            <tbody>
              {stats.context_win_rates.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "var(--space-2)" }}>{r.dept ?? "—"}</td>
                  <td style={{ padding: "var(--space-2)" }}>{r.has_error_code ? "Yes" : "No"}</td>
                  <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)" }}>{r.arm}</td>
                  <td style={{ padding: "var(--space-2)" }}>{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Panel style={{ padding: "var(--space-4)" }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: "var(--font-heading)" }}>{value}</div>
    </Panel>
  );
}
