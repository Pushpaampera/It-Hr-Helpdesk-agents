/** Reinforcement Lab (admin). The LinUCB bandit's real state (GET /api/bandit/stats): each
 * retrieval strategy's pulls/average reward, cumulative regret vs. the best-performing arm, a
 * reward-over-time chart, and per-context win rates — "why did the bandit pick this strategy"
 * made visible, the same comparison the Policy Knowledge Base's "Compare strategies" view lets
 * you inspect for one query at a time. */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { apiGet } from "../../api/client";
import type { BanditStats } from "../../api/types";
import Badge from "../../components/ui/Badge";
import InfoBanner from "../../components/ui/InfoBanner";
import ChartTable from "../../components/ui/ChartTable";
import InfoTooltip from "../../components/ui/InfoTooltip";
import Panel from "../../components/ui/Panel";
import StatCard from "../../components/ui/StatCard";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import { fadeUp, staggerContainer } from "../../design/motion";
import PageTransition from "../../design/pageTransition";
import hover from "../../design/hoverEffects.module.css";

const ARM_COLORS: Record<string, string> = {
  hybrid_rerank: "#5e5490",
  lexical_heavy: "#1d6fa5",
  semantic_heavy: "#b45309",
};

// Visible labels only — internal strategy ids (e.g. "hybrid_rerank") stay as-is everywhere else
// (API payloads, the ARM_COLORS key, etc.), this just makes the on-screen text readable.
function formatStrategyName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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
    <PageTransition routeKey="reinforcement-lab">
    <div>
      <DashboardHeader
        title="Reinforcement Lab"
        subtitle="How the AI is learning which search strategy works best, from real feedback."
      />
      <InfoBanner id="reinforcement-lab">
        The AI tries a few different search strategies when looking up answers, and learns over time which one gets the best results. This page shows what it's learned so far.
      </InfoBanner>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer()}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}
      >
        <StatCard
          label="Times used"
          value={stats.total_pulls}
          infoText="How many times any search strategy has been used to answer a question."
        />
        <Panel className={hover.liftOnHover} style={{ padding: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 4 }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Best-performing strategy</span>
            <InfoTooltip text="The search strategy that's currently getting the best results." />
          </div>
          <div style={{ fontSize: "1.375rem", fontFamily: "var(--font-mono)" }}>
            {stats.best_arm ? formatStrategyName(stats.best_arm) : "—"}
          </div>
        </Panel>
        <StatCard
          label="Efficiency gap"
          value={stats.cumulative_regret ?? 0}
          infoText="How much better the results could have been if the AI had always picked the best strategy from the very start. Shrinks toward zero as it learns."
        />
      </motion.div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer()}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}
      >
        {stats.arms.map((a) => (
          <motion.div key={a.arm_id} variants={fadeUp}>
          <Panel className={hover.liftOnHover} style={{ padding: "var(--space-5)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: ARM_COLORS[a.name] ?? "var(--text-muted)" }} />
              <strong style={{ fontSize: "0.875rem" }}>{formatStrategyName(a.name)}</strong>
              {stats.best_arm === a.name && <Badge label="leading" tone="success" />}
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
              {String(a.config.description ?? "")}
            </p>
            <div style={{ display: "flex", gap: "var(--space-4)" }}>
              <div>
                <div style={{ fontSize: "1.25rem", fontFamily: "var(--font-heading)" }}>{a.pulls}</div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>times used</div>
              </div>
              <div>
                <div style={{ fontSize: "1.25rem", fontFamily: "var(--font-heading)" }}>{a.avg_reward?.toFixed(3) ?? "—"}</div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>success score</div>
              </div>
            </div>
          </Panel>
          </motion.div>
        ))}
      </motion.div>

      <Panel style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          Success score over time
          <InfoTooltip text="How well each search strategy has been doing, day by day, on a 0-1 scale. Higher is better." />
        </h2>
        {chartData.length === 0 ? (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>No reward history yet.</p>
        ) : (
          <div style={{ height: 240 }}>
            <ChartTable
              caption="Success score per search strategy, by day (0 to 1)"
              columns={["Day", ...Object.keys(ARM_COLORS).map((a) => formatStrategyName(a))]}
              rows={chartData.map((row) => [String(row.day), ...Object.keys(ARM_COLORS).map((a) => (typeof row[a] === "number" ? (row[a] as number).toFixed(3) : "—"))])}
            />
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} accessibilityLayer>
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} tick={{ fill: "#4a4560", fontSize: "0.8125rem" }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fill: "#4a4560", fontSize: "0.8125rem" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  label={{ value: "Success score (0-1)", angle: -90, position: "insideLeft", fill: "#4a4560", fontSize: "0.8125rem" }}
                />
                <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid rgba(124,112,175,0.18)", borderRadius: 8, fontSize: "0.8125rem" }} labelStyle={{ color: "#4a4560" }} />
                <Legend wrapperStyle={{ fontSize: "0.8125rem", color: "#4a4560" }} />
                {Object.keys(ARM_COLORS).map((arm) => (
                  <Line key={arm} type="monotone" name={formatStrategyName(arm)} dataKey={arm} stroke={ARM_COLORS[arm]} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel style={{ padding: "var(--space-5)" }}>
        <h2 style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          Which strategy wins in which situation
          <InfoTooltip text="Breaks down which search strategy the AI picks most often for different kinds of questions." />
        </h2>
        {stats.context_win_rates.length === 0 ? (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>No context data yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>
                <th scope="col" style={{ padding: "var(--space-2)", color: "var(--text-muted)", fontSize: "0.8125rem" }}>Department</th>
                <th scope="col" style={{ padding: "var(--space-2)", color: "var(--text-muted)", fontSize: "0.8125rem" }}>Mentions an error code</th>
                <th scope="col" style={{ padding: "var(--space-2)", color: "var(--text-muted)", fontSize: "0.8125rem" }}>Strategy chosen</th>
                <th scope="col" style={{ padding: "var(--space-2)", color: "var(--text-muted)", fontSize: "0.8125rem" }}>Times seen</th>
              </tr>
            </thead>
            <tbody>
              {stats.context_win_rates.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "var(--space-2)" }}>{r.dept ?? "—"}</td>
                  <td style={{ padding: "var(--space-2)" }}>{r.has_error_code ? "Yes" : "No"}</td>
                  <td style={{ padding: "var(--space-2)" }}>{formatStrategyName(r.arm)}</td>
                  <td style={{ padding: "var(--space-2)" }}>{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
    </PageTransition>
  );
}
