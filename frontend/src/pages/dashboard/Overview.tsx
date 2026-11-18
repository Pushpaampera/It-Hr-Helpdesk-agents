import { motion } from "framer-motion";
import { KeyRound, LifeBuoy, MessageCircle, PlaneTakeoff } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { apiGet } from "../../api/client";
import type { ConversationSummary, Kpis, TicketSummary, TimeseriesPoint } from "../../api/types";
import Badge from "../../components/ui/Badge";
import ChartTable from "../../components/ui/ChartTable";
import InfoBanner from "../../components/ui/InfoBanner";
import InfoTooltip from "../../components/ui/InfoTooltip";
import Panel from "../../components/ui/Panel";
import StatCard from "../../components/ui/StatCard";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import { fadeUp, staggerContainer } from "../../design/motion";
import PageTransition from "../../design/pageTransition";
import hover from "../../design/hoverEffects.module.css";
import { useAuthStore } from "../../store/authStore";

const STAFF_ROLES = ["manager", "hr", "admin"];

const QUICK_ACTIONS = [
  { label: "Ask a question", icon: MessageCircle, query: "" },
  { label: "Apply for leave", icon: PlaneTakeoff, query: "I'd like to apply for leave" },
  { label: "Reset password", icon: KeyRound, query: "I need to reset my password" },
  { label: "Request access", icon: LifeBuoy, query: "I need access to a system" },
];

// "User asked: "X". The assistant's best attempt: ..." -> just X, for a clean card title instead
// of the raw multi-paragraph ticket summary.
function ticketTitle(summary: string): string {
  const match = summary.match(/"([^"]+)"/);
  const text = match ? match[1] : summary;
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

function statusTone(status: string): "success" | "warning" | "info" | "danger" {
  if (status === "resolved" || status === "closed") return "success";
  if (status === "waiting") return "warning";
  if (status === "urgent") return "danger";
  return "info";
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function Overview() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  if (!user) return null;
  const isStaff = STAFF_ROLES.includes(user.role);

  return (
    <PageTransition routeKey="overview">
      <div>
        <DashboardHeader
          title={isStaff ? "Overview" : `Welcome back, ${user.name.split(" ")[0]}`}
          subtitle={
            isStaff
              ? "Company-wide activity: questions asked, how many were solved, and open tickets."
              : "A quick look at your own recent activity."
          }
        />
        <InfoBanner id="overview">
          {isStaff
            ? "This page is a company-wide snapshot: how many questions people asked, how often the Assistant solved them on its own, and what is still open."
            : "This page shows your own recent tickets and conversations with the AI assistant."}
        </InfoBanner>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer()}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}
        >
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.label}
                variants={fadeUp}
                className={hover.liftOnHover}
                onClick={() => navigate(`/app/assistant${action.query ? `?q=${encodeURIComponent(action.query)}` : ""}`)}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--space-3)",
                  padding: "var(--space-4)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)",
                  background: "var(--bg-panel)", backdropFilter: "blur(16px)", cursor: "pointer", textAlign: "left",
                  fontFamily: "var(--font-body)",
                }}
              >
                <span
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    width: 38, height: 38, borderRadius: "var(--radius-md)",
                    background: "rgba(139, 92, 246, 0.12)", color: "var(--accent-primary)",
                  }}
                >
                  <Icon size={18} />
                </span>
                <span style={{ fontSize: "0.8438rem", fontWeight: 600, color: "var(--text-primary)" }}>{action.label}</span>
              </motion.button>
            );
          })}
        </motion.div>

        {isStaff ? <StaffOverview /> : <EmployeeOverview />}
      </div>
    </PageTransition>
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
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer()}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)" }}
      >
        <StatCard
          label="Questions asked"
          value={kpis.total_runs}
          sparklineData={series.length >= 2 ? series.map((p) => p.total_runs) : undefined}
          infoText="How many times someone asked the AI assistant something, in the last 30 days."
        />
        <StatCard
          label="Solved by the Assistant"
          value={Math.round(kpis.resolved_rate * 100)}
          unit="%"
          infoText="The share of conversations the AI fully answered, without needing a ticket or a human."
        />
        <StatCard
          label="Needed a ticket"
          value={Math.round(kpis.escalation_rate * 100)}
          unit="%"
          infoText="The share of conversations that needed a support ticket because the AI couldn't fully resolve them."
        />
        <StatCard
          label="Average rating"
          value={kpis.avg_rating}
          unit="/5"
          infoText="The average 1-5 star rating people gave the AI's answers."
        />
        <StatCard
          label="Open tickets"
          value={kpis.open_tickets}
          infoText="Support tickets that are still waiting on a human, company-wide."
        />
        <StatCard
          label="Pending approvals"
          value={kpis.pending_approvals}
          infoText="Access requests waiting on a manager's decision."
        />
      </motion.div>

      <Panel style={{ padding: "var(--space-5)" }}>
        <h2 style={{ fontSize: "0.9375rem", marginBottom: "var(--space-4)", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          Questions asked over the last 30 days
          <InfoTooltip text="Each day's total number of AI conversations, company-wide." />
        </h2>
        {series.length === 0 ? (
          <p style={{ fontSize: "0.8125rem" }}>No run activity yet.</p>
        ) : (
          <div style={{ height: 220 }}>
            {/* recharts needs concrete color strings, not CSS var() references, for SVG gradient
                stops to render reliably — #5e5490/#4a4560 mirror tokens.css's --accent-primary/
                --text-secondary, same duplication tradeoff as AgentOrb's AGENT_COLORS. */}
            <ChartTable caption="Questions asked per day, last 30 days" columns={["Day", "Questions asked"]} rows={series.map((p) => [p.day, p.total_runs])} />
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} accessibilityLayer>
                <defs>
                  <linearGradient id="runsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c70af" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#7c70af" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fill: "#4a4560", fontSize: "0.8125rem" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#4a4560", fontSize: "0.8125rem" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  allowDecimals={false}
                  label={{ value: "Questions", angle: -90, position: "insideLeft", fill: "#4a4560", fontSize: "0.8125rem" }}
                />
                <Tooltip
                  contentStyle={{ background: "#ffffff", border: "1px solid rgba(124,112,175,0.25)", borderRadius: 8, fontSize: "0.8125rem" }}
                  labelStyle={{ color: "#4a4560" }}
                />
                <Legend wrapperStyle={{ fontSize: "0.8125rem", color: "#4a4560" }} />
                <Area type="monotone" dataKey="total_runs" name="Questions asked" stroke="#5e5490" fill="url(#runsGradient)" strokeWidth={2} />
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

  const timeline = [
    ...tickets.slice(0, 6).map((t) => ({
      id: `t-${t.id}`, kind: "ticket" as const, at: t.created_at,
      text: `Ticket opened: ${ticketTitle(t.summary)}`, status: t.status,
    })),
    ...conversations.slice(0, 6).map((c) => ({
      id: `c-${c.id}`, kind: "conversation" as const, at: c.created_at,
      text: c.title || "Conversation with the AI Assistant", status: c.status,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer()}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)" }}
      >
        <StatCard label="Open tickets" value={openTickets.length} />
        <StatCard label="Conversations" value={conversations.length} />
      </motion.div>

      <Panel style={{ padding: "var(--space-5)" }}>
        <h2 style={{ fontSize: "0.9375rem", marginBottom: "var(--space-4)", color: "var(--text-secondary)" }}>Your open tickets</h2>
        {openTickets.length === 0 ? (
          <p style={{ fontSize: "0.8125rem" }}>Nothing open right now — ask the Assistant if something comes up.</p>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer()}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-3)" }}
          >
            {openTickets.slice(0, 6).map((t) => (
              <motion.div
                key={t.id}
                variants={fadeUp}
                className={hover.liftOnHover}
                style={{
                  display: "flex", flexDirection: "column", gap: "var(--space-2)",
                  padding: "var(--space-4)", borderRadius: "var(--radius-md)",
                  background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)" }}>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{t.number}</span>
                  <Badge label={t.status} tone={statusTone(t.status)} />
                </div>
                <span style={{ fontSize: "0.8438rem", lineHeight: 1.4 }}>{ticketTitle(t.summary)}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </Panel>

      <Panel style={{ padding: "var(--space-5)" }}>
        <h2 style={{ fontSize: "0.9375rem", marginBottom: "var(--space-4)", color: "var(--text-secondary)" }}>Recent activity</h2>
        {timeline.length === 0 ? (
          <p style={{ fontSize: "0.8125rem" }}>Nothing yet — ask the Assistant something to get started.</p>
        ) : (
          <motion.div initial="hidden" animate="visible" variants={staggerContainer()} style={{ display: "grid", gap: "var(--space-3)" }}>
            {timeline.map((item) => (
              <motion.div key={item.id} variants={fadeUp} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <span
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    width: 28, height: 28, borderRadius: "50%",
                    background: item.kind === "ticket" ? "rgba(45, 212, 191, 0.14)" : "rgba(139, 92, 246, 0.14)",
                    color: item.kind === "ticket" ? "#0d9488" : "var(--accent-primary)",
                  }}
                >
                  {item.kind === "ticket" ? <LifeBuoy size={13} /> : <MessageCircle size={13} />}
                </span>
                <span style={{ fontSize: "0.8125rem", flex: 1 }}>{item.text}</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", flexShrink: 0 }}>{timeAgo(item.at)}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </Panel>
    </div>
  );
}
