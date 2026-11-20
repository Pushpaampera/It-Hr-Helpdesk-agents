/** The Overview page for IT support, HR and admins. Each role gets its own layout built around
 * what it actually does, with the most common action available right here:
 *  - IT support: "Next up" (the one ticket to work on now) and the IT queue by stage
 *    (new / working on / waiting on employee / waiting on admin / solved).
 *  - HR: three summary tiles (leave / private cases / HR tickets) that pick the one list shown below,
 *    with one clear action per row, and who's away today and soon.
 *  - Admin: questions IT support / HR asked an admin, health of every AI agent and the latest audit activity.
 * Declining always opens the full page, because it needs a written reason. */
import { AlertTriangle, ArrowRight, CalendarCheck, CalendarDays, CheckCircle2, LockKeyhole, Ticket as TicketIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { apiGet, apiPatch, apiPost } from "../../api/client";
import type {
  AgentStatus, AuditLogEntry, ConsultInboxItem, HrCase, HrOverview as HrOverviewData, LeaveRequest, TicketSummary,
} from "../../api/types";
import { useAuthStore } from "../../store/authStore";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Panel from "../ui/Panel";

// ---------- small shared pieces ----------

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    load().then(setData).catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { data, setData, error };
}

function Status({ error }: { error: string | null }) {
  return (
    <Panel style={{ padding: "var(--space-5)", color: error ? "var(--danger)" : undefined }}>
      {error ?? "Loading..."}
    </Panel>
  );
}

function SectionTitle({ children, count, link }: { children: ReactNode; count?: number; link?: { to: string; label: string } }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
      <h2 style={{ fontSize: "1rem", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        {children}
        {count !== undefined && (
          <span
            style={{
              minWidth: 26, padding: "0 8px", borderRadius: "var(--radius-full)", fontSize: "0.8125rem", textAlign: "center",
              background: count ? "var(--accent-primary)" : "var(--bg-elevated)", color: count ? "var(--text-on-accent)" : "var(--text-muted)",
            }}
          >
            {count}
          </span>
        )}
      </h2>
      {link && (
        <Link to={link.to} style={{ fontSize: "0.8125rem", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {link.label} <ArrowRight size={13} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)",
  background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
};

function Empty({ children }: { children: ReactNode }) {
  return (
    <p style={{ ...card, display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>
      <CheckCircle2 size={16} color="var(--success)" aria-hidden="true" /> {children}
    </p>
  );
}

function Initials({ name }: { name: string }) {
  const letters = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <span
      aria-hidden="true"
      style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--brand-tint)", color: "var(--accent-primary)", fontWeight: 700, fontSize: "0.8125rem",
      }}
    >
      {letters}
    </span>
  );
}

const smallBtn: React.CSSProperties = { minHeight: 36, padding: "0 14px", fontSize: "0.8125rem" };

// ---------- Admin: questions IT support / HR asked an admin ----------

const ticketQuestion = (summary: string) => {
  const q = summary.match(/"([^"]+)"/)?.[1] ?? summary;
  return q.length > 90 ? `${q.slice(0, 90)}…` : q;
};

export function AdminHelpRequests() {
  const { data } = useLoad(() => apiGet<ConsultInboxItem[]>("/tickets/consults?status=open"));
  if (!data || data.length === 0) return null;
  return (
    <Panel style={{ padding: "var(--space-5)", borderLeft: "4px solid var(--accent-primary)" }}>
      <SectionTitle count={data.length} link={{ to: "/app/tickets", label: "Tickets" }}>Asked for your help</SectionTitle>
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        {data.slice(0, 5).map((c) => (
          <Link key={c.id} to={`/app/tickets?ticket=${c.ticket_id}`} style={{ ...card, display: "block", textDecoration: "none", color: "inherit" }}>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              {c.ticket_number} · {c.requested_by_name} · {timeAgo(c.created_at)}
            </div>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, margin: "2px 0" }}>“{c.question}”</div>
            <div style={{ fontSize: "0.8125rem", color: "var(--accent-primary)" }}>Open the ticket to answer</div>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

// ---------- IT support: "next up" + the queue by stage ----------

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const isDone = (t: TicketSummary) => t.status === "resolved" || t.status === "closed";

type Stage = { key: string; label: string; empty: string; match: (t: TicketSummary) => boolean };
const STAGES: Stage[] = [
  { key: "new", label: "New", empty: "No new tickets. The AI is handling everything else.", match: (t) => t.status === "open" },
  { key: "working", label: "Working on", empty: "Nothing in progress.", match: (t) => t.status === "in_progress" },
  { key: "employee", label: "Waiting on employee", empty: "No questions waiting for an answer.", match: (t) => t.status === "waiting" && t.waiting_on === "employee" },
  { key: "admin", label: "Waiting on admin", empty: "No questions waiting on an admin.", match: (t) => t.status === "waiting" && t.waiting_on !== "employee" },
  { key: "solved", label: "Solved", empty: "Nothing solved yet.", match: isDone },
];

function age(iso: string) {
  return timeAgo(iso).replace(" ago", "");
}

export function ItSupportOverview() {
  const me = useAuthStore((s) => s.user);
  const { data, setData, error } = useLoad(() => apiGet<TicketSummary[]>("/tickets"));
  const [stage, setStage] = useState("new");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!data) return <Status error={error} />;
  // The IT queue only (their own leave / HR requests are on the Tickets page under "My own requests").
  const all = data;
  const tickets = all.filter((t) => t.category === "IT" || t.category === "General");

  // The one to do next: overdue first, then the most urgent, then the one waiting longest.
  // Tickets waiting on someone else aren't "next" — nothing to do until they answer.
  const actionable = tickets
    .filter((t) => t.status === "open" || t.status === "in_progress")
    .sort((a, b) =>
      Number(b.overdue) - Number(a.overdue)
      || (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
      || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const next = actionable[0];
  const current = STAGES.find((s) => s.key === stage) ?? STAGES[0];
  const rows = tickets.filter(current.match).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  async function take(t: TicketSummary) {
    setBusy(true);
    try {
      await apiPost(`/tickets/${t.id}/claim`, {});
      setData(all.map((x) => (x.id === t.id ? { ...x, assignee_id: me?.id ?? null, assignee_name: me?.name ?? null, status: "in_progress" } : x)));
      setNote(`${t.number} is yours now. ${t.user_name.split(" ")[0]} was told you're on it.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't take that ticket.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      {/* Next up: the single ticket to work on now. */}
      <section
        aria-labelledby="next-up-title"
        style={{ background: "var(--banner-bg)", color: "var(--banner-text)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)" }}
      >
        <p id="next-up-title" style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--banner-text-muted)" }}>
          Next up
        </p>
        {next ? (
          <>
            <p style={{ margin: "var(--space-2) 0 0", fontSize: "0.875rem", color: "var(--banner-text-muted)" }}>
              {next.number} · {next.user_name}{next.user_department ? `, ${next.user_department}` : ""} · raised {timeAgo(next.created_at)}
            </p>
            <h2 style={{ margin: "var(--space-2) 0 var(--space-3)", fontSize: "1.375rem", lineHeight: 1.3, color: "var(--banner-text)" }}>
              “{ticketQuestion(next.summary)}”
            </h2>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-4)" }}>
              <span style={{ padding: "2px 10px", borderRadius: "var(--radius-full)", border: "1px solid var(--banner-text-muted)", fontSize: "0.8125rem", fontWeight: 600, textTransform: "capitalize" }}>
                {next.priority} priority
              </span>
              {next.overdue && (
                <span style={{ padding: "2px 10px", borderRadius: "var(--radius-full)", background: "var(--banner-text)", color: "var(--danger)", fontSize: "0.8125rem", fontWeight: 700 }}>
                  ⚠ Overdue
                </span>
              )}
              <span style={{ fontSize: "0.8125rem", color: "var(--banner-text-muted)" }}>
                {next.status === "open" ? "Nobody has started on it yet" : `${next.assignee_name ?? "Someone"} is working on it`}
              </span>
            </div>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              {next.status === "open" && (
                <Button disabled={busy} onClick={() => take(next)}>Take it</Button>
              )}
              <Link
                to={`/app/tickets?ticket=${next.id}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 var(--space-4)", borderRadius: "var(--radius-md)",
                  border: "2px solid var(--banner-text)", color: "var(--banner-text)", fontWeight: 600, fontSize: "0.875rem", textDecoration: "none",
                }}
              >
                Open the ticket <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </>
        ) : (
          <h2 style={{ margin: "var(--space-2) 0 0", fontSize: "1.25rem", color: "var(--banner-text)" }}>
            You're all caught up. New tickets show up here and in your bell the moment the AI hands one over.
          </h2>
        )}
        {note && <p role="status" style={{ margin: "var(--space-3) 0 0", fontSize: "0.875rem", color: "var(--banner-text)" }}>{note}</p>}
      </section>

      {/* The queue, one stage at a time. */}
      <Panel style={{ padding: "var(--space-5)" }}>
        <div role="group" aria-label="Ticket stage" style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
          {STAGES.map((s) => {
            const count = tickets.filter(s.match).length;
            const active = s.key === stage;
            return (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                aria-pressed={active}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 var(--space-4)",
                  borderRadius: "var(--radius-full)", fontFamily: "var(--font-body)", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
                  border: `2px solid ${active ? "var(--accent-primary)" : "var(--border-strong)"}`,
                  background: active ? "var(--accent-primary)" : "var(--bg-elevated)",
                  color: active ? "var(--text-on-accent)" : "var(--text-primary)",
                }}
              >
                {s.label} <span aria-label={`${count} tickets`}>{count}</span>
              </button>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <Empty>{current.empty}</Empty>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map((t) => (
              <li key={t.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <Link
                  to={`/app/tickets?ticket=${t.id}`}
                  style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) 0", textDecoration: "none", color: "inherit", flexWrap: "wrap" }}
                >
                  <Initials name={t.user_name} />
                  <span style={{ flex: 1, minWidth: 200 }}>
                    <span style={{ display: "block", fontSize: "0.9375rem", fontWeight: 600 }}>{ticketQuestion(t.summary)}</span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      {t.number} · {t.user_name} · {isDone(t) ? `solved ${t.resolved_at ? timeAgo(t.resolved_at) : ""}` : `waiting ${age(t.created_at)}`}
                    </span>
                  </span>
                  {t.overdue ? (
                    <Badge label="overdue" tone="danger" />
                  ) : (
                    <Badge label={t.priority} tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : isDone(t) ? "success" : "info"} />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ---------- HR: three summary tiles, one list at a time, who's away ----------

const isOpenCase = (c: HrCase) => c.status !== "resolved" && c.status !== "closed";

type HrTab = "leave" | "cases" | "tickets";

const leaveLabel = (type: string) => {
  const t = type.replace(/_/g, " ");
  const label = /leave/i.test(t) ? t : `${t} leave`;
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const dateRange = (start: string, end: string) =>
  start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`;

const iconChip: React.CSSProperties = {
  width: 36, height: 36, borderRadius: "var(--radius-md)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--brand-tint)", color: "var(--accent-primary)",
};

/** One row of the HR list: a marker on the left, the text in the middle, actions on the right. */
function HrRow({ lead, title, meta, extra, actions }: { lead: ReactNode; title: ReactNode; meta: ReactNode; extra?: ReactNode; actions: ReactNode }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border-subtle)", flexWrap: "wrap" }}>
      {lead}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: "0.9375rem", fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{meta}</div>
        {extra && <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: 2 }}>{extra}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexShrink: 0 }}>{actions}</div>
    </li>
  );
}

function HrTile({ icon, label, count, hint, active, onClick }: { icon: ReactNode; label: string; count: number; hint: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "flex", alignItems: "center", gap: "var(--space-4)", padding: "var(--space-4) var(--space-5)",
        borderRadius: "var(--radius-lg)", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-body)",
        background: active ? "var(--brand-tint)" : "var(--bg-panel)", color: "var(--text-primary)",
        border: `2px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
      }}
    >
      <span style={{ ...iconChip, width: 44, height: 44, background: active ? "var(--accent-primary)" : "var(--brand-tint)", color: active ? "var(--text-on-accent)" : "var(--accent-primary)" }} aria-hidden="true">
        {icon}
      </span>
      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: "1.75rem", fontWeight: 700, lineHeight: 1.1 }}>{count}</span>
        <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{hint}</span>
      </span>
    </button>
  );
}

export function HrOverview() {
  const { data, setData, error } = useLoad(() =>
    Promise.all([
      apiGet<LeaveRequest[]>("/hr/leave-requests?status=pending"),
      apiGet<HrCase[]>("/hr-cases"),
      apiGet<TicketSummary[]>("/tickets"),
      apiGet<HrOverviewData>("/hr/overview"),
    ]),
  );
  const [tab, setTab] = useState<HrTab | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!data) return <Status error={error} />;

  const [leave, cases, tickets, overview] = data;
  // Oldest first everywhere: whatever has waited longest is picked up first; urgent cases go on top.
  const pendingLeave = [...leave].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const openCases = cases
    .filter(isOpenCase)
    .sort((a, b) => Number(b.urgency === "urgent") - Number(a.urgency === "urgent") || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const hrTickets = tickets
    .filter((t) => t.category === "HR" && (t.status === "open" || t.status === "in_progress"))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const urgentCases = openCases.filter((c) => c.urgency === "urgent").length;
  const notStarted = hrTickets.filter((t) => t.status === "open").length;

  // Open on the first list that has something in it.
  const shown: HrTab = tab ?? (pendingLeave.length ? "leave" : openCases.length ? "cases" : hrTickets.length ? "tickets" : "leave");

  async function approveLeave(l: LeaveRequest) {
    setBusy(l.id);
    try {
      await apiPatch(`/hr/leave-requests/${l.id}/decide`, { decision: "approved" });
      setData([leave.filter((x) => x.id !== l.id), cases, tickets, overview]);
      setNote(`Approved ${l.user_name}'s ${leaveLabel(l.leave_type).toLowerCase()}. They'll be told shortly.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't approve that leave.");
    } finally {
      setBusy(null);
    }
  }

  async function startTicket(t: TicketSummary) {
    setBusy(t.id);
    try {
      await apiPost(`/tickets/${t.id}/claim`, {});
      setData([leave, cases, tickets.map((x) => (x.id === t.id ? { ...x, status: "in_progress" } : x)), overview]);
      setNote(`${t.number} is now yours and in progress.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't update that ticket.");
    } finally {
      setBusy(null);
    }
  }

  const LIST = {
    leave: { title: "Leave waiting for your decision", link: { to: "/app/hr-insights", label: "HR Dashboard" }, empty: "No leave requests are waiting." },
    cases: { title: "Open private cases", link: { to: "/app/hr-cases", label: "Private Cases" }, empty: "No open private cases." },
    tickets: { title: "Open HR tickets", link: { to: "/app/tickets", label: "All tickets" }, empty: "No open HR tickets." },
  }[shown];

  const todayIds = new Set(overview.on_leave_today.map((l) => l.id));
  const comingUp = overview.upcoming_approved_leave.filter((l) => !todayIds.has(l.id)).slice(0, 5);

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
        <HrTile
          icon={<CalendarCheck size={22} />} label="Leave to approve" count={pendingLeave.length}
          hint={pendingLeave.length ? "Waiting for your decision" : "All decided"}
          active={shown === "leave"} onClick={() => setTab("leave")}
        />
        <HrTile
          icon={<LockKeyhole size={22} />} label="Private cases" count={openCases.length}
          hint={urgentCases ? `${urgentCases} urgent` : "None urgent"}
          active={shown === "cases"} onClick={() => setTab("cases")}
        />
        <HrTile
          icon={<TicketIcon size={22} />} label="HR tickets" count={hrTickets.length}
          hint={notStarted ? `${notStarted} not started yet` : "All in progress"}
          active={shown === "tickets"} onClick={() => setTab("tickets")}
        />
      </div>

      <div className="hr-overview__layout">
        <Panel style={{ padding: "var(--space-5)", minWidth: 0 }}>
          <SectionTitle link={LIST.link}>{LIST.title}</SectionTitle>
          {note && <p role="status" style={{ margin: "0 0 var(--space-3)", fontSize: "0.875rem", color: "var(--accent-primary)" }}>{note}</p>}

          {shown === "leave" && (pendingLeave.length === 0 ? <Empty>{LIST.empty}</Empty> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {pendingLeave.map((l) => (
                <HrRow
                  key={l.id}
                  lead={<Initials name={l.user_name} />}
                  title={<>{l.user_name}{l.department ? <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · {l.department}</span> : null}</>}
                  meta={`${leaveLabel(l.leave_type)} · ${dateRange(l.start_date, l.end_date)} · ${l.days} day${l.days === 1 ? "" : "s"}`}
                  extra={l.reason ? `Reason: ${l.reason.length > 90 ? `${l.reason.slice(0, 90)}…` : l.reason}` : undefined}
                  actions={<>
                    <Button style={smallBtn} disabled={busy === l.id} onClick={() => approveLeave(l)}>Approve</Button>
                    <Link to="/app/hr-insights" style={{ fontSize: "0.8125rem" }}>Review or decline</Link>
                  </>}
                />
              ))}
            </ul>
          ))}

          {/* Case number, type and status only: the details stay on the Private Cases page. */}
          {shown === "cases" && (openCases.length === 0 ? <Empty>{LIST.empty}</Empty> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {openCases.map((c) => (
                <HrRow
                  key={c.id}
                  lead={<span style={iconChip} aria-hidden="true"><LockKeyhole size={16} /></span>}
                  title={<><span style={{ fontFamily: "var(--font-mono)" }}>{c.number}</span> · {c.category.replace(/_/g, " ")}</>}
                  meta={`${c.status_label} · opened ${timeAgo(c.created_at)}`}
                  actions={<>
                    {c.urgency === "urgent" && <Badge label="urgent" tone="danger" />}
                    <Link to={`/app/hr-cases?case=${c.id}`} style={{ fontSize: "0.8125rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Open <ArrowRight size={13} aria-hidden="true" />
                    </Link>
                  </>}
                />
              ))}
            </ul>
          ))}

          {shown === "tickets" && (hrTickets.length === 0 ? <Empty>{LIST.empty}</Empty> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {hrTickets.map((t) => (
                <HrRow
                  key={t.id}
                  lead={<Initials name={t.user_name} />}
                  title={ticketQuestion(t.summary)}
                  meta={`${t.number} · ${t.user_name} · waiting ${age(t.created_at)}`}
                  actions={<>
                    {t.status === "open" ? (
                      <Button variant="ghost" style={smallBtn} disabled={busy === t.id} onClick={() => startTicket(t)}>Start</Button>
                    ) : (
                      <Badge label="in progress" tone="info" />
                    )}
                    <Link to={`/app/tickets?ticket=${t.id}`} style={{ fontSize: "0.8125rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Open <ArrowRight size={13} aria-hidden="true" />
                    </Link>
                  </>}
                />
              ))}
            </ul>
          ))}
        </Panel>

        <Panel style={{ padding: "var(--space-5)" }}>
          <SectionTitle>
            <CalendarDays size={18} aria-hidden="true" /> Who's away
          </SectionTitle>
          <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "0 0 var(--space-2)" }}>Today</h3>
          {overview.on_leave_today.length === 0 ? (
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: "0 0 var(--space-4)" }}>Everyone is in today.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: "0 0 var(--space-4)", padding: 0, display: "grid", gap: "var(--space-3)" }}>
              {overview.on_leave_today.map((l) => (
                <li key={l.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <Initials name={l.user_name} />
                  <span style={{ fontSize: "0.875rem" }}>
                    <strong>{l.user_name}</strong>
                    <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-muted)" }}>{leaveLabel(l.leave_type)} · back after {shortDate(l.end_date)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "0 0 var(--space-2)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>Coming up</h3>
          {comingUp.length === 0 ? (
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>No approved leave coming up.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-3)" }}>
              {comingUp.map((l) => (
                <li key={l.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <Initials name={l.user_name} />
                  <span style={{ fontSize: "0.875rem" }}>
                    <strong>{l.user_name}</strong>
                    <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-muted)" }}>{leaveLabel(l.leave_type)} · {dateRange(l.start_date, l.end_date)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------- Admin: agent health + audit activity ----------

export function AdminHealth() {
  const { data, error } = useLoad(() =>
    Promise.all([apiGet<AgentStatus[]>("/agents/status"), apiGet<AuditLogEntry[]>("/admin/audit-log?limit=6")]),
  );
  if (!data) return <Status error={error} />;
  const [agents, audit] = data;
  const withErrors = agents.filter((a) => a.errors_24h > 0).length;

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <Panel style={{ padding: "var(--space-5)" }}>
        <SectionTitle link={{ to: "/app/control-room", label: "Control Room" }}>
          {withErrors ? <AlertTriangle size={18} color="var(--danger)" aria-hidden="true" /> : <CheckCircle2 size={18} color="var(--success)" aria-hidden="true" />}
          AI agents, last 24 hours {withErrors ? `· ${withErrors} with errors` : "· all healthy"}
        </SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "var(--space-3)" }}>
          {agents.map((a) => (
            <div key={a.agent} style={{ ...card, borderTop: `3px solid ${a.errors_24h ? "var(--danger)" : "var(--success)"}` }}>
              <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{a.name}</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>{a.job}</div>
              <div style={{ fontSize: "0.8125rem" }}>
                {a.events_24h} steps · {a.avg_latency_ms ? `${Math.round(a.avg_latency_ms)} ms` : "—"}
              </div>
              <div style={{ fontSize: "0.8125rem", color: a.errors_24h ? "var(--danger)" : "var(--text-muted)" }}>
                {a.errors_24h} error{a.errors_24h === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel style={{ padding: "var(--space-5)" }}>
        <SectionTitle link={{ to: "/app/audit-log", label: "Full audit log" }}>Latest activity</SectionTitle>
        {audit.length === 0 ? (
          <Empty>No activity recorded yet.</Empty>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {audit.map((e) => (
              <li key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--border-subtle)", fontSize: "0.8125rem" }}>
                <span>
                  <strong>{e.actor_name ?? "System"}</strong> · {e.action.replace(/_/g, " ")}
                  {e.target_type ? <span style={{ color: "var(--text-muted)" }}> on {e.target_type.replace(/_/g, " ")}</span> : null}
                </span>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{timeAgo(e.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
