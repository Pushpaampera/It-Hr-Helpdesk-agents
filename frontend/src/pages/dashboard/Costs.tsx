/** Costs (manager/hr/admin — nav-gated to admin, see navItems.ts). Token/$ spend from the real
 * agent_runs/agent_events data (GET /api/costs): totals, a 30-day daily chart, and breakdowns
 * by route and by model. */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Area, AreaChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { apiGet } from "../../api/client";
import type { CostsResponse } from "../../api/types";
import InfoBanner from "../../components/ui/InfoBanner";
import ChartTable from "../../components/ui/ChartTable";
import InfoTooltip from "../../components/ui/InfoTooltip";
import Panel from "../../components/ui/Panel";
import StatCard from "../../components/ui/StatCard";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import { staggerContainer } from "../../design/motion";
import PageTransition from "../../design/pageTransition";

export default function Costs() {
  const [data, setData] = useState<CostsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<CostsResponse>("/costs?days=30")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load cost data"));
  }, []);

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;
  if (!data) return <Panel style={{ padding: "var(--space-5)" }}>Loading...</Panel>;

  return (
    <PageTransition routeKey="costs">
    <div>
      <DashboardHeader title="Costs" subtitle="Token spend over the last 30 days." />
      <InfoBanner id="costs">
        This shows how much it costs to run the AI assistant — in total, per day, and broken down by which specialist (IT, HR, etc.) and which AI model handled the conversation.
      </InfoBanner>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer()}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}
      >
        <StatCard
          label="Total cost"
          value={data.total_cost_usd}
          unit="$"
          sparklineData={data.by_day.length >= 2 ? data.by_day.map((d) => d.cost_usd) : undefined}
          infoText="What every AI conversation in the last 30 days cost, combined, in US dollars."
        />
        <StatCard
          label="Total runs"
          value={data.total_runs}
          infoText="How many AI conversations happened in the last 30 days."
        />
        <StatCard
          label="Tokens in"
          value={data.total_tokens_in}
          infoText="How much text was sent TO the AI model (the question plus any background info it was given), measured in word-pieces called tokens."
        />
        <StatCard
          label="Tokens out"
          value={data.total_tokens_out}
          infoText="How much text the AI model generated back, measured in word-pieces called tokens."
        />
      </motion.div>

      <Panel style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          Cost per day
          <InfoTooltip text="How much the AI assistant cost to run each day, in US dollars." />
        </h2>
        {data.by_day.length === 0 ? (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>No run activity yet.</p>
        ) : (
          <div style={{ height: 220 }}>
            <ChartTable caption="Cost per day in US dollars" columns={["Day", "Cost (USD)"]} rows={data.by_day.map((d) => [d.day, `$${d.cost_usd.toFixed(4)}`])} />
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.by_day} accessibilityLayer>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: "var(--accent-secondary)" }} stopOpacity={0.5} />
                    <stop offset="100%" style={{ stopColor: "var(--accent-secondary)" }} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} tick={{ fill: "var(--text-secondary)", fontSize: "0.8125rem" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: "var(--text-secondary)", fontSize: "0.8125rem" }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                  label={{ value: "USD", angle: -90, position: "insideLeft", fill: "var(--text-secondary)", fontSize: "0.8125rem" }}
                />
                <Tooltip contentStyle={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)", borderRadius: 8, fontSize: "0.8125rem" }} labelStyle={{ color: "var(--text-secondary)" }} formatter={(v: number) => `$${v.toFixed(4)}`} />
                <Legend wrapperStyle={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }} />
                <Area type="monotone" dataKey="cost_usd" name="Cost (USD)" stroke="var(--accent-primary)" fill="url(#costGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: "var(--space-5)" }}>
        <Panel style={{ padding: "var(--space-5)" }}>
          <h2 style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            By specialist
            <InfoTooltip text="How much was spent on conversations handled by each specialist (IT, HR, or other)." />
          </h2>
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            {data.by_route.map((r, i) => (
              // Index, not `r.route`, as the key: the backend groups by the raw `route` column
              // (NULL vs the literal string 'OTHER'), so two distinct rows can both display as
              // "OTHER" and collide on a value-based key.
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                <span>{r.route} ({r.runs} runs)</span>
                <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>${r.cost_usd.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel style={{ padding: "var(--space-5)" }}>
          <h2 style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            By AI model
            <InfoTooltip text="How much was spent on each underlying AI model used to generate answers." />
          </h2>
          {data.by_model.length === 0 ? (
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>No model usage recorded (mock mode).</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {data.by_model.map((m) => (
                <div key={m.model} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{m.model}</span>
                  <span style={{ color: "var(--text-muted)" }}>{m.tokens.toLocaleString()} tokens · {m.calls} calls</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
    </PageTransition>
  );
}
