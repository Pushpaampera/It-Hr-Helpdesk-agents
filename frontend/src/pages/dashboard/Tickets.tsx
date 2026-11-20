/** Tickets: where a person takes over from the AI.
 *
 * Employees see their own tickets: who is working on it, any question IT/HR asked them (they
 * answer in the reply box), and what fixed it. Replying to a resolved ticket reopens it.
 *
 * IT support (IT tickets only) / HR (HR tickets) / admin (all) see their queue (backend:
 * routers/tickets.py::_visible). Opening a ticket shows what the AI already tried and the
 * conversation behind it, and lets them: take it, change status / priority / assignee, reply to or
 * ask the employee, write an internal note, ask an admin for help, and resolve it with a note of
 * what fixed it. Admins answer those questions. `?ticket=<id>` opens a ticket directly (links in
 * notifications use it). */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiGet, apiPatch, apiPost } from "../../api/client";
import type {
  AgentEventPayload, Role, RunEventsResponse, StaffMember, TemporaryPasswordResponse, TicketDetail, TicketEvent,
  TicketSummary,
} from "../../api/types";
import AgentAvatar from "../../components/ui/AgentAvatar";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import InfoBanner from "../../components/ui/InfoBanner";
import Panel from "../../components/ui/Panel";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import { AGENTS, isAgentKey } from "../../design/agents";
import PageTransition from "../../design/pageTransition";
import hover from "../../design/hoverEffects.module.css";
import { useAuthStore } from "../../store/authStore";

const STAFF_ROLES: Role[] = ["it_support", "hr", "admin"];

// What each role's ticket list contains (the backend filters it the same way).
const TICKET_COPY: Record<Role, { subtitle: string; banner: string }> = {
  employee: {
    subtitle: "Tickets raised on your behalf.",
    banner: "When the AI assistant can't fix something, it raises a ticket and a person from IT or HR takes over. If they ask you a question, answer it here. If a fix didn't work, reply and the ticket reopens.",
  },
  it_support: {
    subtitle: "IT problems the AI couldn't solve.",
    banner: "Your own requests (leave, pay, HR) are under \"My own requests\". When the AI can't fix an IT problem, the ticket lands here and in your bell. Take it, ask the employee if you need details, ask an admin if you're stuck (e.g. a licence), and write what fixed it when you resolve it — the employee is told each step.",
  },
  hr: {
    subtitle: "HR tickets from across the company.",
    banner: "Questions about leave, pay, benefits and policies that the AI couldn't fully answer. Pick one up and update it as you work on it.",
  },
  admin: {
    subtitle: "Every ticket raised across the company.",
    banner: "Every support ticket the AI couldn't fully resolve on its own, so a human could take over.",
  },
};
const STATUSES = ["open", "in_progress", "waiting", "resolved", "closed"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const SCOPES: { key: string; label: string; roles: Role[] }[] = [
  { key: "", label: "Everything", roles: ["it_support", "hr", "admin"] },
  { key: "mine", label: "Assigned to me", roles: ["it_support", "hr"] },
  { key: "own", label: "My own requests", roles: ["it_support"] },
  { key: "overdue", label: "Overdue", roles: ["it_support", "hr", "admin"] },
  { key: "asked", label: "Asked for my help", roles: ["admin"] },
];

const nice = (s: string) => s.replace(/_/g, " ");
const question = (summary: string) => summary.match(/"([^"]+)"/)?.[1] ?? summary;

function statusTone(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "resolved" || status === "closed") return "success";
  if (status === "waiting") return "warning";
  if (status === "in_progress") return "info";
  return "danger";
}

function priorityTone(priority: string): "success" | "warning" | "danger" | "info" {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "info";
  return "success";
}

function statusLabel(t: TicketSummary, viewerIsRequester: boolean): string {
  if (t.status === "waiting" && t.waiting_on) {
    if (t.waiting_on === "employee") return viewerIsRequester ? "waiting on you" : "waiting on employee";
    // Questions to an admin are staff-only, so the employee just sees that work continues.
    return viewerIsRequester ? "in progress" : "waiting on admin";
  }
  return nice(t.status);
}

function dueText(t: TicketSummary): string {
  if (t.status === "resolved" || t.status === "closed") return "—";
  const hours = Math.round((new Date(t.due_at).getTime() - Date.now()) / 3600000);
  if (hours < 0) return `${Math.abs(hours) < 48 ? `${Math.abs(hours)}h` : `${Math.round(Math.abs(hours) / 24)}d`} overdue`;
  return hours < 48 ? `in ${hours}h` : `in ${Math.round(hours / 24)}d`;
}

export default function Tickets() {
  const user = useAuthStore((s) => s.user);
  const role: Role = user?.role ?? "employee";
  const isStaff = STAFF_ROLES.includes(role);
  const [params, setParams] = useSearchParams();

  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [scope, setScope] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const selectedId = params.get("ticket");

  function select(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set("ticket", id);
    else next.delete("ticket");
    setParams(next, { replace: true });
  }

  function load() {
    const qs = new URLSearchParams();
    if (statusFilter) qs.set("status", statusFilter);
    if (scope) qs.set("scope", scope);
    const q = qs.toString();
    apiGet<TicketSummary[]>(`/tickets${q ? `?${q}` : ""}`)
      .then(setTickets)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tickets"));
  }

  useEffect(load, [statusFilter, scope]);

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;
  if (!tickets) return <Panel style={{ padding: "var(--space-5)" }}>Loading...</Panel>;
  const copy = TICKET_COPY[role];
  // With a ticket open, the list keeps only the columns needed to pick the next one.
  const compact = !!selectedId;

  return (
    <PageTransition routeKey="tickets">
    <div>
      <DashboardHeader title="Tickets" subtitle={copy.subtitle} />
      <InfoBanner id={`tickets-${role}`}>{copy.banner}</InfoBanner>

      {isStaff && (
        <div role="group" aria-label="Which tickets" style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
          {SCOPES.filter((s) => s.roles.includes(role)).map((s) => (
            <FilterChip key={s.key || "all"} label={s.label} active={scope === s.key} onClick={() => setScope(s.key)} />
          ))}
        </div>
      )}
      <div role="group" aria-label="Status" style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        <FilterChip label="Any status" active={statusFilter === ""} onClick={() => setStatusFilter("")} />
        {STATUSES.map((s) => (
          <FilterChip key={s} label={nice(s)} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selectedId ? "repeat(auto-fit, minmax(min(380px, 100%), 1fr))" : "1fr", gap: "var(--space-5)", alignItems: "start" }}>
        <Panel style={{ padding: 0, overflowX: "auto" }}>
          {tickets.length === 0 ? (
            <p style={{ fontSize: "0.8125rem", padding: "var(--space-5)" }}>No tickets match this filter.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>
                  <Th>Ticket</Th>
                  {isStaff && !compact && <Th>Requester</Th>}
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  {!compact && <Th>{isStaff ? "Assigned to" : "Who has it"}</Th>}
                  {isStaff && !compact && <Th>Due</Th>}
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => select(t.id)}
                    className={hover.glowOnHover}
                    style={{
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border-subtle)",
                      background: selectedId === t.id ? "var(--bg-elevated)" : "transparent",
                    }}
                  >
                    <Td>
                      <button
                        onClick={(e) => { e.stopPropagation(); select(t.id); }}
                        aria-label={`Open ticket ${t.number}`}
                        aria-expanded={selectedId === t.id}
                        style={{ background: "none", border: "none", padding: 0, minHeight: 24, fontWeight: 700, color: "var(--accent-primary)", textDecoration: "underline", cursor: "pointer", fontSize: "inherit" }}
                      >
                        {t.number}
                      </button>
                      <span style={{ color: "var(--text-muted)" }}> · {t.category}</span>
                      <div style={{ color: "var(--text-secondary)", maxWidth: compact ? 220 : 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {question(t.summary)}
                      </div>
                    </Td>
                    {isStaff && !compact && <Td>{t.user_name}</Td>}
                    <Td><Badge label={t.priority} tone={priorityTone(t.priority)} /></Td>
                    <Td>
                      <Badge label={statusLabel(t, t.user_id === user?.id)} tone={statusTone(t.status)} />
                      {!!t.open_consults && isStaff && <div style={{ color: "var(--text-muted)", marginTop: 2 }}>asked an admin</div>}
                    </Td>
                    {!compact && <Td>{t.assignee_name ?? <span style={{ color: "var(--text-muted)" }}>{isStaff ? "Nobody yet" : "Being assigned"}</span>}</Td>}
                    {isStaff && !compact && (
                      <Td>
                        {t.overdue ? <Badge label={dueText(t)} tone="danger" /> : <span style={{ color: "var(--text-muted)" }}>{dueText(t)}</span>}
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {selectedId && (
          <TicketDetailPanel key={selectedId} ticketId={selectedId} onClose={() => select(null)} onUpdated={load} />
        )}
      </div>
    </div>
    </PageTransition>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontSize: "0.875rem", fontWeight: 600, fontFamily: "var(--font-body)", padding: "0 var(--space-4)", minHeight: 44, borderRadius: "var(--radius-full)",
        border: `2px solid ${active ? "var(--accent-primary)" : "var(--border-strong)"}`,
        background: active ? "var(--accent-primary)" : "var(--bg-elevated)",
        color: active ? "var(--text-on-accent)" : "var(--text-primary)", cursor: "pointer", textTransform: "capitalize",
      }}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th scope="col" style={{ padding: "var(--space-3) var(--space-4)", fontWeight: 600, color: "var(--text-muted)", fontSize: "0.8125rem", textTransform: "uppercase" }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "var(--space-3) var(--space-4)", verticalAlign: "top" }}>{children}</td>;
}

const fieldStyle: React.CSSProperties = {
  display: "block", width: "100%", marginTop: 4, padding: "var(--space-2)", minHeight: 44, borderRadius: "var(--radius-sm)",
  background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", color: "var(--text-primary)",
  fontFamily: "var(--font-body)", fontSize: "0.875rem",
};
const labelStyle: React.CSSProperties = { fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 };
const sectionTitle: React.CSSProperties = { fontSize: "0.8125rem", textTransform: "uppercase", color: "var(--text-muted)", margin: "var(--space-5) 0 var(--space-3)" };
const box: React.CSSProperties = { padding: "var(--space-3)", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", fontSize: "0.8125rem" };

function TicketDetailPanel({ ticketId, onClose, onUpdated }: { ticketId: string; onClose: () => void; onUpdated: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<TicketDetail>(`/tickets/${ticketId}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load ticket"));
  }, [ticketId]);

  /** Runs one change, shows the updated ticket and refreshes the list. */
  async function run(action: () => Promise<TicketDetail>, done: string): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      setDetail(await action());
      setNotice(done);
      onUpdated();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (!detail) {
    return (
      <Panel style={{ padding: "var(--space-5)" }}>
        {error ? <p style={{ color: "var(--danger)", fontSize: "0.8125rem" }}>{error}</p> : <p style={{ fontSize: "0.8125rem" }}>Loading...</p>}
        <Button variant="ghost" onClick={onClose} style={{ marginTop: "var(--space-3)" }}>Close</Button>
      </Panel>
    );
  }

  const { ticket, permissions, consults } = detail;
  const manage = permissions.can_manage;
  const finished = ticket.status === "resolved" || ticket.status === "closed";
  const mineToWork = ticket.assignee_id === user?.id;

  return (
    <Panel
      aria-label={`Ticket ${ticket.number}`}
      style={{ padding: "var(--space-5)", position: "sticky", top: "var(--space-4)", maxHeight: "calc(100vh - 2 * var(--space-4))", overflowY: "auto" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <div>
          <h2 style={{ fontSize: "1.0625rem" }}>{ticket.number}</h2>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: 2 }}>
            {ticket.category} · raised {new Date(ticket.created_at).toLocaleString()}
            {permissions.staff_view && ` · ${ticket.user_name}${ticket.user_department ? `, ${ticket.user_department}` : ""}`}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>

      <p style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "var(--space-3) 0" }}>“{question(ticket.summary)}”</p>

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
        <Badge label={statusLabel(ticket, permissions.is_requester && !manage)} tone={statusTone(ticket.status)} />
        <Badge label={`${ticket.priority} priority`} tone={priorityTone(ticket.priority)} />
        {permissions.staff_view && !finished && (
          ticket.overdue ? <Badge label={dueText(ticket)} tone="danger" /> : <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Due {dueText(ticket)}</span>
        )}
      </div>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "var(--space-2)" }}>
        {ticket.assignee_name ? <><strong>{ticket.assignee_name}</strong> {finished ? "handled this ticket." : ticket.status === "open" ? "has this ticket (not started yet)." : "is working on this ticket."}</> : "Not assigned to anyone yet."}
      </p>

      {notice && <p role="status" style={{ fontSize: "0.8125rem", color: "var(--accent-primary)", marginTop: "var(--space-2)" }}>{notice}</p>}
      {error && <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--danger)", marginTop: "var(--space-2)" }}>{error}</p>}

      {ticket.status === "resolved" && ticket.resolution && (
        <div style={{ ...box, marginTop: "var(--space-4)", borderLeft: "4px solid var(--success)" }}>
          <strong>What fixed it:</strong> {ticket.resolution}
          {permissions.is_requester && <div style={{ color: "var(--text-muted)", marginTop: 4 }}>Still not working? Reply below and the ticket reopens.</div>}
        </div>
      )}

      {permissions.staff_view && <AiHandover ticket={ticket} />}

      {manage && !finished && (ticket.context?.kind === "password_reset_blocked" || ticket.context?.kind === "password_reset") &&
        (user?.role === "it_support" || user?.role === "admin") && (
        <PasswordResetSection detail={detail} saving={saving} run={run} />
      )}

      {manage && (
        <ManageControls detail={detail} saving={saving} mineToWork={mineToWork} run={run} />
      )}

      {permissions.staff_view && (consults.length > 0 || (manage && user?.role !== "admin")) && (
        <ConsultSection detail={detail} saving={saving} run={run} />
      )}

      <Thread events={detail.events} staffView={permissions.staff_view} />

      <Composer detail={detail} saving={saving} run={run} />
    </Panel>
  );
}

type RunFn = (action: () => Promise<TicketDetail>, done: string) => Promise<boolean>;

const ACCOUNT_OPTIONS: { system: string; label: string }[] = [
  { system: "windows", label: "Windows / VPN login (also HelpDesk sign-in)" },
  { system: "email", label: "Email (Outlook)" },
  { system: "payroll", label: "Payroll portal" },
  { system: "hr_portal", label: "HR portal" },
];

/** A password ticket (the reset was blocked after 3 wrong codes, or the assistant couldn't verify
 * the person): once IT support has confirmed it's really them, they issue a temporary password
 * for the right company account here and pass it on themselves. It's shown once and never stored
 * on the ticket. */
function PasswordResetSection({ detail, saving, run }: { detail: TicketDetail; saving: boolean; run: RunFn }) {
  const { ticket } = detail;
  const [system, setSystem] = useState(ticket.context?.account ?? "windows");
  const [confirmed, setConfirmed] = useState(false);
  const [issued, setIssued] = useState<{ password: string; expires: string; account: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const firstName = ticket.user_name.split(" ")[0];
  const blocked = ticket.context?.kind === "password_reset_blocked";

  async function issue() {
    await run(async () => {
      const res = await apiPost<TemporaryPasswordResponse>(`/tickets/${ticket.id}/temporary-password`, { system });
      setIssued({
        password: res.temporary_password, account: res.account,
        expires: new Date(res.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      return res.ticket;
    }, `Temporary password issued. ${firstName} was told you'll give it to them directly.`);
  }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <h3 style={sectionTitle}>Password reset</h3>
      <div style={box}>
        {issued ? (
          <>
            <p style={{ margin: 0 }}>
              Temporary {issued.account} password for {ticket.user_name}:{" "}
              <code style={{ fontSize: "1rem", fontWeight: 700 }}>{issued.password}</code>
            </p>
            <p style={{ margin: "var(--space-2) 0 0", color: "var(--text-muted)" }}>
              Shown only once. It works until {issued.expires} (15 minutes), and {firstName} must choose a new password when
              they sign in. Give it to them directly, never by email or on this ticket.
            </p>
            <Button variant="ghost" onClick={copy} style={{ marginTop: "var(--space-2)" }}>
              {copied ? "Copied" : "Copy password"}
            </Button>
          </>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              {blocked
                ? `${firstName}'s self-service reset was blocked after 3 wrong codes, so their password hasn't changed.`
                : `The assistant couldn't check it was really ${firstName}, so it didn't reset anything.`}{" "}
              First confirm it's really them (for example on a video call), then issue a temporary password.
            </p>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: "var(--space-3)", fontWeight: 600 }}>
              Account
              <select
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                style={{
                  fontFamily: "var(--font-body)", fontSize: "0.875rem", padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)",
                  background: "var(--bg-elevated)", color: "var(--text-primary)",
                }}
              >
                {ACCOUNT_OPTIONS.map((o) => (
                  <option key={o.system} value={o.system}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "var(--space-3)" }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              I've confirmed this is really {ticket.user_name}
            </label>
            <Button variant="primary" disabled={!confirmed || saving} onClick={issue} style={{ marginTop: "var(--space-3)" }}>
              Issue temporary password
            </Button>
          </>
        )}
      </div>
    </>
  );
}

/** What the AI tried before it handed over, so nobody has to ask the employee to start again. */
function AiHandover({ ticket }: { ticket: TicketDetail["ticket"] }) {
  const ctx = ticket.context ?? {};
  const sources = (ctx.sources ?? []).map((s) => s.title || s.source_name).filter(Boolean);
  return (
    <>
      <h3 style={sectionTitle}>What the AI already tried</h3>
      <div style={box}>
        {ctx.summary_note ? <p style={{ margin: 0 }}>{ctx.summary_note}</p> : <p style={{ margin: 0 }}>{ticket.summary}</p>}
        {sources.length > 0 && <p style={{ margin: "var(--space-2) 0 0", color: "var(--text-muted)" }}>Guides it used: {sources.join(", ")}</p>}
      </div>
      {ticket.run_id && <TicketConversation runId={ticket.run_id} />}
    </>
  );
}

function ManageControls({ detail, saving, mineToWork, run }: { detail: TicketDetail; saving: boolean; mineToWork: boolean; run: RunFn }) {
  const { ticket } = detail;
  const user = useAuthStore((s) => s.user);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState("");
  const finished = ticket.status === "resolved" || ticket.status === "closed";
  const team = ticket.category === "HR" ? "hr" : "it_support";

  useEffect(() => {
    apiGet<StaffMember[]>("/tickets/staff").then(setStaff).catch(() => setStaff([]));
  }, []);
  const assignable = useMemo(() => staff.filter((s) => s.role === team || s.role === "admin"), [staff, team]);
  const patch = (body: Record<string, string>, done: string) => run(() => apiPatch<TicketDetail>(`/tickets/${ticket.id}`, body), done);

  return (
    <>
      <h3 style={sectionTitle}>Work on this ticket</h3>
      {!mineToWork && !finished && (
        <Button disabled={saving} onClick={() => run(() => apiPost<TicketDetail>(`/tickets/${ticket.id}/claim`, {}), "It's yours now. The employee was told you're on it.")}
          style={{ marginBottom: "var(--space-3)" }}>
          Take this ticket
        </Button>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--space-3)" }}>
        <label style={labelStyle}>
          Status
          <select value={ticket.status === "resolved" ? "resolved" : ticket.status} disabled={saving}
            onChange={(e) => (e.target.value === "resolved" ? setResolving(true) : patch({ status: e.target.value }, `Status changed to ${nice(e.target.value)}.`))}
            style={fieldStyle}>
            {STATUSES.map((s) => <option key={s} value={s}>{nice(s)}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          Priority
          <select value={ticket.priority} disabled={saving} onChange={(e) => patch({ priority: e.target.value }, `Priority changed to ${e.target.value}.`)} style={fieldStyle}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          Assigned to
          <select value={ticket.assignee_id ?? ""} disabled={saving || assignable.length === 0}
            onChange={(e) => e.target.value && patch({ assignee_id: e.target.value }, "Ticket reassigned; they've been notified.")} style={fieldStyle}>
            {!ticket.assignee_id && <option value="">Nobody yet</option>}
            {assignable.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.id === user?.id ? " (me)" : ""} · {s.open_tickets} open</option>
            ))}
          </select>
        </label>
      </div>

      {!finished && (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
          <Button disabled={saving} onClick={() => setResolving(true)}>Resolve…</Button>
        </div>
      )}

      {resolving && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await patch({ status: "resolved", resolution }, "Resolved. The employee was told what fixed it.")) { setResolving(false); setResolution(""); }
          }}
          style={{ ...box, marginTop: "var(--space-3)", display: "grid", gap: "var(--space-2)" }}
        >
          <label style={labelStyle}>
            What fixed it? (the employee will see this)
            <textarea required value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} style={fieldStyle}
              placeholder="e.g. Reset the VPN profile and updated the client to 5.2." />
          </label>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button type="submit" disabled={saving || !resolution.trim()}>Mark as resolved</Button>
            <Button variant="ghost" onClick={() => setResolving(false)}>Cancel</Button>
          </div>
        </form>
      )}

    </>
  );
}

/** Asking an admin for help (IT support / HR), and answering it (admin). Staff only: the
 * employee never sees these. */
function ConsultSection({ detail, saving, run }: { detail: TicketDetail; saving: boolean; run: RunFn }) {
  const { ticket, consults, permissions } = detail;
  const role = useAuthStore((s) => s.user?.role);
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const finished = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <>
      <h3 style={sectionTitle}>Help from an admin</h3>
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        {consults.length === 0 && <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>No questions asked yet. The employee never sees these.</p>}
        {consults.map((c) => {
          const canAnswer = c.status === "open" && role === "admin";
          return (
            <div key={c.id} style={{ ...box, borderLeft: `4px solid ${c.status === "open" ? "var(--warning)" : "var(--success)"}` }}>
              <div style={{ color: "var(--text-muted)" }}>{c.requested_by_name} asked an admin · {new Date(c.created_at).toLocaleString()}</div>
              <div style={{ fontWeight: 600, margin: "2px 0" }}>“{c.question}”</div>
              {c.answer ? (
                <div><strong>{c.answered_by_name}:</strong> {c.answer}</div>
              ) : canAnswer ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await run(() => apiPost<TicketDetail>(`/tickets/${ticket.id}/consults/${c.id}/answer`, { answer: answers[c.id] ?? "" }), `Answer sent to ${c.requested_by_name}.`)) {
                      setAnswers((a) => ({ ...a, [c.id]: "" }));
                    }
                  }}
                  style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-2)" }}
                >
                  <label style={labelStyle}>
                    Your answer
                    <textarea required rows={2} value={answers[c.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [c.id]: e.target.value }))} style={fieldStyle} />
                  </label>
                  <Button type="submit" disabled={saving || !(answers[c.id] ?? "").trim()}>Send answer</Button>
                </form>
              ) : (
                <Badge label="waiting on admin" tone="warning" />
              )}
            </div>
          );
        })}
      </div>

      {permissions.can_manage && role !== "admin" && !finished && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => apiPost<TicketDetail>(`/tickets/${ticket.id}/consult`, { target_role: "admin", question: text }), "Asked an admin. They've been notified.")) setText("");
          }}
          style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-3)" }}
        >
          <label style={labelStyle}>
            Ask an admin
            <input value={text} onChange={(e) => setText(e.target.value)} style={fieldStyle} placeholder="e.g. Do we have a spare Adobe Acrobat Pro licence?" />
          </label>
          <Button type="submit" variant="ghost" disabled={saving || !text.trim()}>Ask for help</Button>
        </form>
      )}
    </>
  );
}

const EVENT_LABEL: Record<string, string> = {
  created: "raised the ticket", assigned: "assignment", message: "replied", question: "asked a question",
  employee_reply: "replied", internal_note: "internal note", resolved: "resolved it", reopened: "reopened it",
  status_change: "status", priority_change: "priority", transferred: "moved the ticket", note: "note",
  consult_asked: "asked an admin", consult_answered: "answered",
};
const CONVERSATION_TYPES = new Set(["message", "question", "employee_reply"]);

function Thread({ events, staffView }: { events: TicketEvent[]; staffView: boolean }) {
  return (
    <>
      <h3 style={sectionTitle}>Updates and messages</h3>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-3)" }}>
        {events.length === 0 && <li style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>No updates yet.</li>}
        {events.map((e) => {
          const isMessage = CONVERSATION_TYPES.has(e.type);
          const internal = e.visibility === "internal";
          const actor = e.actor === "tess" ? "Tess (AI)" : e.actor;
          return (
            <li key={e.id} style={{
              fontSize: "0.8125rem", paddingLeft: "var(--space-3)",
              borderLeft: `3px solid ${internal ? "var(--warning)" : isMessage ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              ...(isMessage ? { ...box, borderLeft: "3px solid var(--accent-primary)" } : {}),
            }}>
              <div style={{ color: "var(--text-secondary)", display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                <strong>{actor}</strong> <span>{EVENT_LABEL[e.type] ?? nice(e.type)}</span>
                {internal && staffView && <Badge label="staff only" tone="warning" />}
              </div>
              {e.note && <div style={{ color: isMessage ? "var(--text-primary)" : "var(--text-muted)", whiteSpace: "pre-wrap", marginTop: 2 }}>{e.note}</div>}
              <div style={{ color: "var(--text-muted)" }}>{new Date(e.created_at).toLocaleString()}</div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** Staff: reply, ask the employee a question, or write an internal note. Employee: reply (which
 * answers a question, or reopens a resolved ticket). */
function Composer({ detail, saving, run }: { detail: TicketDetail; saving: boolean; run: RunFn }) {
  const { ticket, permissions } = detail;
  const [text, setText] = useState("");
  const finished = ticket.status === "resolved" || ticket.status === "closed";
  const send = async (kind: "reply" | "question" | "internal", done: string) => {
    if (await run(() => apiPost<TicketDetail>(`/tickets/${ticket.id}/messages`, { body: text, kind }), done)) setText("");
  };

  if (permissions.can_manage) {
    return (
      <div style={{ marginTop: "var(--space-5)", display: "grid", gap: "var(--space-2)" }}>
        <label style={labelStyle}>
          Message
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} style={fieldStyle}
            placeholder={finished ? "The ticket is finished — only internal notes can be added." : "Write to the employee, or a note for your team"} />
        </label>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {!finished && !permissions.is_requester && (
            <>
              <Button disabled={saving || !text.trim()} onClick={() => send("reply", "Reply sent. The employee was notified.")}>Reply to employee</Button>
              <Button variant="ghost" disabled={saving || !text.trim()} onClick={() => send("question", "Question sent. The ticket now waits for their answer.")}>Ask employee a question</Button>
            </>
          )}
          <Button variant="ghost" disabled={saving || !text.trim()} onClick={() => send("internal", "Internal note saved (staff only).")}>Add internal note</Button>
        </div>
      </div>
    );
  }

  if (!permissions.is_requester) return null;
  const waitingOnMe = ticket.status === "waiting" && ticket.waiting_on === "employee";
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); send("reply", finished ? "Ticket reopened. The team was told it isn't fixed." : "Reply sent."); }}
      style={{ marginTop: "var(--space-5)", display: "grid", gap: "var(--space-2)" }}
    >
      <label style={labelStyle}>
        {waitingOnMe ? "Answer their question" : finished ? "Still not fixed? Tell us what's happening" : "Add more details"}
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} style={fieldStyle} />
      </label>
      <Button type="submit" disabled={saving || !text.trim()}>{finished ? "Reopen with this message" : "Send"}</Button>
    </form>
  );
}

/** The real conversation that led to this ticket — every ticket is created automatically from
 * a specific agent run. Fetched lazily (only once expanded) since it's not needed for every
 * ticket view. */
function TicketConversation({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<RunEventsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    if (!open && !run) {
      apiGet<RunEventsResponse>(`/runs/${runId}/events`)
        .then(setRun)
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the conversation"));
    }
    setOpen((o) => !o);
  }

  return (
    <div style={{ marginTop: "var(--space-2)" }}>
      <button
        onClick={toggle}
        aria-expanded={open}
        style={{
          fontSize: "0.875rem", fontWeight: 600, color: "var(--accent-primary)", background: "none", border: "none",
          textDecoration: "underline", cursor: "pointer", padding: "var(--space-2) 0", minHeight: 44,
        }}
      >
        {open ? "Hide the AI conversation" : "See every step the AI took"}
      </button>

      {open && (
        <div tabIndex={0} style={{ display: "grid", gap: "var(--space-2)", maxHeight: 280, overflowY: "auto", paddingLeft: "var(--space-2)", borderLeft: "2px solid var(--border-subtle)" }}>
          {error && <p style={{ color: "var(--danger)", fontSize: "0.8125rem" }}>{error}</p>}
          {!run && !error && <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Loading...</p>}
          {run?.events.map((e: AgentEventPayload, i: number) => (
            <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start", fontSize: "0.8125rem" }}>
              {isAgentKey(e.agent) && <AgentAvatar agent={e.agent} size={28} style={{ marginTop: 2 }} />}
              <span>
                <strong style={{ color: "var(--text-secondary)" }}>{isAgentKey(e.agent) ? AGENTS[e.agent].name : e.agent}</strong>{" "}
                <span style={{ color: "var(--text-muted)" }}>{e.caption}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
