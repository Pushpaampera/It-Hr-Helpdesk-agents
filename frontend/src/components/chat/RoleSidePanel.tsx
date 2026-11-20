/** The right-hand panel on the Ask the Assistant page for non-admin roles. Admins keep the full
 * live AgentActivityPanel; everyone else gets a panel built around their own work:
 *   - employee: their own recent tickets
 *   - hr:       pending leave requests + upcoming approved leave
 * Every variant opens with a plain-language status line ("Iris, IT Support, is working on it")
 * so the person still knows the assistant is busy, without the agent internals.
 *
 * `refreshKey` changes after each finished chat turn, so a ticket or approval the assistant just
 * created shows up here without a page reload. */
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { apiGet } from "../../api/client";
import type { HrOverview, LeaveRequest, Role, TicketSummary } from "../../api/types";
import { AGENTS, isAgentKey } from "../../design/agents";
import Badge from "../ui/Badge";
import Panel from "../ui/Panel";

type Props = { role: Exclude<Role, "admin">; activeAgent: string | null; refreshKey: number };

export default function RoleSidePanel({ role, activeAgent, refreshKey }: Props) {
  return (
    <Panel style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
      <StatusHeader activeAgent={activeAgent} />
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-4)", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "var(--space-5)", alignContent: "start" }}>
        {(role === "employee" || role === "it_support") && <EmployeeContent refreshKey={refreshKey} itSupport={role === "it_support"} />}
                {role === "hr" && <HrContent refreshKey={refreshKey} />}
      </div>
    </Panel>
  );
}

function StatusHeader({ activeAgent }: { activeAgent: string | null }) {
  const working = activeAgent && isAgentKey(activeAgent) ? AGENTS[activeAgent] : null;
  return (
    <div style={{ padding: "var(--space-4)", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
      {working ? (
        <Loader2 size={18} className="spin" color="var(--accent-primary)" aria-hidden="true" />
      ) : (
        <Sparkles size={18} color="var(--accent-primary)" aria-hidden="true" />
      )}
      <div>
        <h2 style={{ fontSize: "1rem" }}>{working ? "Working on it" : "Assistant ready"}</h2>
        <p style={{ fontSize: "0.8125rem", marginTop: 2 }}>
          {working ? `${working.name}, ${working.role}, is handling your question.` : "Ask a question to get started."}
        </p>
      </div>
    </div>
  );
}

/* ---------- shared bits ---------- */

function useFetch<T>(path: string, refreshKey: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    apiGet<T>(path)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load this"));
    return () => {
      alive = false;
    };
  }, [path, refreshKey]);
  return { data, error };
}

function Section({ title, linkTo, linkLabel, children }: { title: string; linkTo?: string; linkLabel?: string; children: ReactNode }) {
  return (
    <section style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 700 }}>{title}</h3>
        {linkTo && (
          <Link to={linkTo} style={{ fontSize: "0.8125rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {linkLabel} <ArrowRight size={12} aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Status({ error, loading, empty, emptyText }: { error: string | null; loading: boolean; empty: boolean; emptyText: string }) {
  if (error) return <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--danger)" }}>{error}</p>;
  if (loading) return <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Loading…</p>;
  if (empty) return <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{emptyText}</p>;
  return null;
}

function Row({ primary, secondary, right }: { primary: string; secondary: string; right?: ReactNode }) {
  return (
    <li
      style={{
        display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) var(--space-3)",
        border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{primary}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{secondary}</div>
      </div>
      {right}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ padding: "var(--space-3)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)" }}>
      <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

const listStyle = { listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "var(--space-2)" } as const;

/** Seeded/auto-created tickets store 'User asked: "<question>". The assistant…' — show just the question. */
function ticketTitle(summary: string) {
  const m = summary.match(/^User asked:\s*"([^"]+)"/i);
  return m ? m[1] : summary;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function statusTone(status: string): "success" | "warning" | "info" | "neutral" {
  if (status === "resolved" || status === "closed" || status === "approved") return "success";
  if (status === "open" || status === "pending") return "warning";
  if (status === "in_progress") return "info";
  return "neutral";
}

function prettyStatus(t: TicketSummary) {
  // "Waiting on you" when IT/HR asked the employee something; a question to an admin is staff-only.
  const label = t.status === "waiting" ? (t.waiting_on === "employee" ? "waiting on you" : "in progress") : t.status.replace(/_/g, " ");
  return label.replace(/^\w/, (c) => c.toUpperCase());
}

/* ---------- employee ---------- */

/** Employee and IT support: the tickets they raised themselves (for IT support, not their IT
 * work queue, which has its own link). */
function EmployeeContent({ refreshKey, itSupport = false }: { refreshKey: number; itSupport?: boolean }) {
  const { data, error } = useFetch<TicketSummary[]>(itSupport ? "/tickets?scope=own" : "/tickets", refreshKey);
  const open = data?.filter((t) => t.status !== "resolved" && t.status !== "closed") ?? [];
  return (
    <>
      {itSupport && (
        <Section title="Your IT work" linkTo="/app/overview" linkLabel="IT queue">
          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            This page is for your own questions. The IT tickets you work on are on your Overview and Tickets pages.
          </p>
        </Section>
      )}
      <Section title={itSupport ? "Your own requests" : "Your open tickets"} linkTo="/app/tickets" linkLabel="All tickets">
        <Status error={error} loading={!data} empty={open.length === 0} emptyText="You have no open tickets." />
        {open.length > 0 && (
          <ul style={listStyle}>
            {open.slice(0, 5).map((t) => (
              <Row key={t.id} primary={ticketTitle(t.summary)} secondary={`${t.number} · ${t.category} · ${shortDate(t.created_at)}`}
                right={<Badge label={prettyStatus(t)} tone={statusTone(t.status)} />} />
            ))}
          </ul>
        )}
      </Section>
      <Section title="How this works">
        <ol style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8125rem", color: "var(--text-secondary)", display: "grid", gap: 6 }}>
          <li>Describe the problem in your own words.</li>
          <li>The assistant answers from company guides and policies.</li>
          <li>If that doesn't fix it, say so and it'll raise a ticket for a person.</li>
        </ol>
      </Section>
      <PrivateHrSection />
    </>
  );
}

/** A quiet, always-visible way to reach HR privately, for complaints, conflicts or personal
 * matters, without going through the AI at all. */
function PrivateHrSection() {
  return (
    <Section title="Private matter?" linkTo="/app/hr-support" linkLabel="Talk to HR">
      <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
        For complaints, problems with a colleague or your manager, or anything personal, talk to HR privately. Only HR
        can see it, not your manager, IT support or admins.
      </p>
    </Section>
  );
}

/* ---------- hr ---------- */

function HrContent({ refreshKey }: { refreshKey: number }) {
  const overview = useFetch<HrOverview>("/hr/overview", refreshKey);
  const requests = useFetch<LeaveRequest[]>("/hr/leave-requests?status=pending", refreshKey);
  const counts = overview.data?.leave_requests_by_status;
  const pending = requests.data ?? [];
  const upcoming = overview.data?.upcoming_approved_leave ?? [];
  return (
    <>
      <Section title="Leave requests" linkTo="/app/hr-insights" linkLabel="HR dashboard">
        <Status error={overview.error} loading={!overview.data} empty={false} emptyText="" />
        {counts && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-2)" }}>
            <Stat label="Pending" value={counts.pending ?? 0} />
            <Stat label="Approved" value={counts.approved ?? 0} />
            <Stat label="Rejected" value={counts.rejected ?? 0} />
          </div>
        )}
      </Section>
      <Section title="Waiting for a decision">
        <Status error={requests.error} loading={!requests.data} empty={pending.length === 0} emptyText="No pending leave requests." />
        {pending.length > 0 && (
          <ul style={listStyle}>
            {pending.slice(0, 4).map((r) => (
              <Row key={r.id} primary={r.user_name}
                secondary={`${r.leave_type} · ${r.days} day${r.days === 1 ? "" : "s"} from ${shortDate(r.start_date)}`}
                right={<Badge label="Pending" tone="warning" />} />
            ))}
          </ul>
        )}
      </Section>
      <Section title="Coming up" linkTo="/app/kb" linkLabel="Policies">
        <Status error={overview.error} loading={!overview.data} empty={upcoming.length === 0} emptyText="No approved leave coming up." />
        {upcoming.length > 0 && (
          <ul style={listStyle}>
            {upcoming.slice(0, 3).map((u) => (
              <Row key={u.id} primary={u.user_name} secondary={`${u.leave_type} · ${shortDate(u.start_date)} – ${shortDate(u.end_date)}`} />
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
