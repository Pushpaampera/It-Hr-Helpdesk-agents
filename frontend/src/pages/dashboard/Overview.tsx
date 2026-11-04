import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { apiGet } from "../../api/client";
import type { ConversationSummary, Kpis, TicketSummary, TimeseriesPoint } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Panel from "../../components/ui/Panel";
import { useAuthStore } from "../../store/authStore";

const STAFF_ROLES = ["manager", "hr", "admin"];

export default function Overview() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  const isStaff = STAFF_ROLES.includes(user.role);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: "var(--space-1)" }}>
        {isStaff ? "Overview" : `Welcome back, ${user.name.split(" ")[0]}`}
      </h1>
      <p style={{ marginBottom: "var(--space-6)" }}>
        {isStaff
          ? "Company-wide activity across every agent, run, and ticket."
          : "A quick look at your own recent activity."}
      </p>
      {isStaff ? <StaffOverview /> : <EmployeeOverview />}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Panel style={{ padding: "var(--space-4)" }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontFamily: "var(--font-heading)" }}>{value}</div>
    </Panel>
  );
}

function StaffOverview() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [series, setSeries] = useState<TimeseriesPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiGet<Kpis>("/analytics/kpis"), apiGet<TimeseriesPoint[]>("/analytics/timeseries?days=30")])
      .then(([k, s]) => {
        setKpis(k);
        setSeries(s);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"));
  }, []);

  if (error) {
    return (
      <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>
    );
  }
  if (!kpis) {
    return <Panel style={{ padding: "var(--space-5)" }}>Loading...</Panel>;
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)" }}>
        <StatCard label="Total runs" value={kpis.total_runs} />
        <StatCard label="Resolved rate" value={`${Math.round(kpis.resolved_rate * 100)}%`} />
        <StatCard label="Escalation rate" value={`${Math.round(kpis.escalation_rate * 100)}%`} />
        <StatCard label="Avg rating" value={kpis.avg_rating.toFixed(1)} />
        <StatCard label="Open tickets" value={kpis.open_tickets} />
        <StatCard label="Pending approvals" value={kpis.pending_approvals} />
      </div>

      <Panel style={{ padding: "var(--space-5)" }}>
        <h2 style={{ fontSize: 15, marginBottom: "var(--space-4)", color: "var(--text-secondary)" }}>
          Runs over the last 30 days
        </h2>
        {series.length === 0 ? (
          <p style={{ fontSize: 13 }}>No run activity yet.</p>
        ) : (
          <div style={{ height: 220 }}>
            {/* recharts needs concrete color strings, not CSS var() references, for SVG gradient
                stops to render reliably — #7c70af/#6b6860 mirror tokens.css's --accent-primary/
                --text-muted, same duplication tradeoff as AgentOrb's AGENT_COLORS. */}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="runsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c70af" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#7c70af" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fill: "#6b6860", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fill: "#6b6860", fontSize: 11 }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#131417", border: "1px solid rgba(124,112,175,0.18)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#a8a49c" }}
                />
                <Area type="monotone" dataKey="total_runs" stroke="#7c70af" fill="url(#runsGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  );
}

function EmployeeOverview() {
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiGet<TicketSummary[]>("/tickets"), apiGet<ConversationSummary[]>("/conversations")])
      .then(([t, c]) => {
        setTickets(t);
        setConversations(c);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load your activity"));
  }, []);

  if (error) {
    return (
      <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>
    );
  }
  if (!tickets || !conversations) {
    return <Panel style={{ padding: "var(--space-5)" }}>Loading...</Panel>;
  }

  const openTickets = tickets.filter((t) => t.status !== "resolved" && t.status !== "closed");

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)" }}>
        <StatCard label="Open tickets" value={openTickets.length} />
        <StatCard label="Conversations" value={conversations.length} />
      </div>

      <Panel style={{ padding: "var(--space-5)" }}>
        <h2 style={{ fontSize: 15, marginBottom: "var(--space-4)", color: "var(--text-secondary)" }}>Your open tickets</h2>
        {openTickets.length === 0 ? (
          <p style={{ fontSize: 13 }}>Nothing open right now — ask the AI Assistant if something comes up.</p>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {openTickets.slice(0, 5).map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", fontSize: 13 }}>
                <span>
                  {t.number} — {t.summary.length > 70 ? `${t.summary.slice(0, 70)}...` : t.summary}
                </span>
                <Badge label={t.status} tone={t.status === "waiting" ? "warning" : "info"} />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
