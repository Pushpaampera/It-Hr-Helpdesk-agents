/** Costs (manager/hr/admin — nav-gated to admin, see navItems.ts). Token/$ spend from the real
 * agent_runs/agent_events data (GET /api/costs): totals, a 30-day daily chart, and breakdowns
 * by route and by model. */
import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { apiGet } from "../../api/client";
import type { CostsResponse } from "../../api/types";
import Panel from "../../components/ui/Panel";

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
    <div>
      <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>Costs</h1>
      <p style={{ marginBottom: "var(--space-5)" }}>Token spend over the last 30 days.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
        <StatCard label="Total cost" value={`$${data.total_cost_usd.toFixed(4)}`} />
        <StatCard label="Total runs" value={data.total_runs} />
        <StatCard label="Tokens in" value={data.total_tokens_in.toLocaleString()} />
        <StatCard label="Tokens out" value={data.total_tokens_out.toLocaleString()} />
      </div>

      <Panel style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>Cost per day</h2>
        {data.by_day.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No run activity yet.</p>
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.by_day}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#facc15" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#facc15" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} tick={{ fill: "#6b6860", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b6860", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip contentStyle={{ background: "#131417", border: "1px solid rgba(255,140,26,0.12)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#a8a49c" }} formatter={(v: number) => `$${v.toFixed(4)}`} />
                <Area type="monotone" dataKey="cost_usd" stroke="#facc15" fill="url(#costGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-5)" }}>
        <Panel style={{ padding: "var(--space-5)" }}>
          <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>By route</h2>
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            {data.by_route.map((r, i) => (
              // Index, not `r.route`, as the key: the backend groups by the raw `route` column
              // (NULL vs the literal string 'OTHER'), so two distinct rows can both display as
              // "OTHER" and collide on a value-based key.
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{r.route} ({r.runs} runs)</span>
                <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>${r.cost_usd.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel style={{ padding: "var(--space-5)" }}>
          <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>By model</h2>
          {data.by_model.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No model usage recorded (mock mode).</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {data.by_model.map((m) => (
                <div key={m.model} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{m.model}</span>
                  <span style={{ color: "var(--text-muted)" }}>{m.tokens.toLocaleString()} tokens · {m.calls} calls</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
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
