/** Tickets page. Employees see only their own tickets; manager/hr/admin see every ticket and
 * can update status/priority/assignee via PATCH /api/tickets/{id}. Selecting a row opens a
 * detail panel with the ticket's event timeline (GET /api/tickets/{id}). */
import { useEffect, useState } from "react";

import { apiGet, apiPatch } from "../../api/client";
import type { AgentEventPayload, RunEventsResponse, TicketDetail, TicketSummary } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import InfoBanner from "../../components/ui/InfoBanner";
import Panel from "../../components/ui/Panel";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import PageTransition from "../../design/pageTransition";
import hover from "../../design/hoverEffects.module.css";
import { useAuthStore } from "../../store/authStore";

const STAFF_ROLES = ["manager", "hr", "admin"];
const STATUSES = ["open", "in_progress", "waiting", "resolved", "closed"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

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

export default function Tickets() {
  const user = useAuthStore((s) => s.user);
  const isStaff = !!user && STAFF_ROLES.includes(user.role);

  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    apiGet<TicketSummary[]>(`/tickets${qs}`)
      .then(setTickets)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tickets"));
  }

  useEffect(load, [statusFilter]);

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;
  if (!tickets) return <Panel style={{ padding: "var(--space-5)" }}>Loading...</Panel>;

  return (
    <PageTransition routeKey="tickets">
    <div>
      <DashboardHeader
        title="Tickets"
        subtitle={isStaff ? "Every ticket raised across the company." : "Tickets raised on your behalf."}
      />
      <InfoBanner id="tickets">
        {isStaff
          ? "Every support ticket the AI couldn't fully resolve on its own, so a human could take over."
          : "Tickets the AI assistant raised for you when it couldn't fully answer something on its own."}
      </InfoBanner>

      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        <FilterChip label="All" active={statusFilter === ""} onClick={() => setStatusFilter("")} />
        {STATUSES.map((s) => (
          <FilterChip key={s} label={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selectedId ? "1fr 380px" : "1fr", gap: "var(--space-5)" }}>
        <Panel style={{ padding: 0, overflow: "hidden" }}>
          {tickets.length === 0 ? (
            <p style={{ fontSize: 13, padding: "var(--space-5)" }}>No tickets match this filter.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>
                  <Th>Ticket</Th>
                  {isStaff && <Th>Requester</Th>}
                  <Th>Category</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={hover.glowOnHover}
                    style={{
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border-subtle)",
                      background: selectedId === t.id ? "var(--bg-elevated)" : "transparent",
                    }}
                  >
                    <Td>
                      <div style={{ fontFamily: "var(--font-mono)" }}>{t.number}</div>
                      <div style={{ color: "var(--text-muted)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.summary}
                      </div>
                    </Td>
                    {isStaff && <Td>{t.user_name}</Td>}
                    <Td>{t.category}</Td>
                    <Td><Badge label={t.priority} tone={priorityTone(t.priority)} /></Td>
                    <Td><Badge label={t.status} tone={statusTone(t.status)} /></Td>
                    <Td>{new Date(t.created_at).toLocaleDateString()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {selectedId && (
          <TicketDetailPanel
            ticketId={selectedId}
            isStaff={isStaff}
            onClose={() => setSelectedId(null)}
            onUpdated={load}
          />
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
      style={{
        fontSize: 12, fontFamily: "var(--font-body)", padding: "6px 14px", borderRadius: "var(--radius-full)",
        border: `1px solid ${active ? "var(--agent-supervisor)" : "var(--border-subtle)"}`,
        background: active ? "var(--agent-supervisor)" : "transparent",
        color: active ? "#fff" : "var(--text-secondary)", cursor: "pointer", textTransform: "capitalize",
      }}
    >
      {label.replace("_", " ")}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "var(--space-3) var(--space-4)", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "var(--space-3) var(--space-4)" }}>{children}</td>;
}

function TicketDetailPanel({
  ticketId, isStaff, onClose, onUpdated,
}: {
  ticketId: string; isStaff: boolean; onClose: () => void; onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDetail(null);
    apiGet<TicketDetail>(`/tickets/${ticketId}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load ticket"));
  }, [ticketId]);

  async function patch(body: { status?: string; priority?: string }) {
    setSaving(true);
    try {
      const updated = await apiPatch<TicketDetail>(`/tickets/${ticketId}`, body);
      setDetail(updated);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ticket");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel style={{ padding: "var(--space-5)", alignSelf: "start" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-3)" }}>
        <h2 style={{ fontSize: 16 }}>{detail?.ticket.number ?? "..."}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>
          Close
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

      {!detail ? (
        <p style={{ fontSize: 13 }}>Loading...</p>
      ) : (
        <>
          <p style={{ fontSize: 13, marginBottom: "var(--space-4)" }}>{detail.ticket.summary}</p>

          {detail.ticket.run_id && <TicketConversation runId={detail.ticket.run_id} />}

          {isStaff ? (
            <div style={{ display: "grid", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Status
                <select
                  value={detail.ticket.status}
                  disabled={saving}
                  onChange={(e) => patch({ status: e.target.value })}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "var(--space-2)", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Priority
                <select
                  value={detail.ticket.priority}
                  disabled={saving}
                  onChange={(e) => patch({ priority: e.target.value })}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "var(--space-2)", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                >
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-5)" }}>
              <Badge label={detail.ticket.status} tone={statusTone(detail.ticket.status)} />
              <Badge label={detail.ticket.priority} tone={priorityTone(detail.ticket.priority)} />
            </div>
          )}

          <h3 style={{ fontSize: 12, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
            Timeline
          </h3>
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {detail.events.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No events yet.</p>
            ) : (
              detail.events.map((e) => (
                <div key={e.id} style={{ fontSize: 12, borderLeft: "2px solid var(--border-subtle)", paddingLeft: "var(--space-3)" }}>
                  <div style={{ color: "var(--text-secondary)" }}>
                    <strong>{e.actor}</strong> — {e.type.replace("_", " ")}
                  </div>
                  {e.note && <div style={{ color: "var(--text-muted)" }}>{e.note}</div>}
                  <div style={{ color: "var(--text-muted)" }}>{new Date(e.created_at).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

/** The real conversation that led to this ticket — every ticket is created automatically from
 * a specific agent run, and until now the only thing shown for it was Tess's one-line "Ticket
 * created automatically..." timeline entry, with no way to see what the employee actually asked
 * or how the agents got there. Fetched lazily (only once expanded) since it's not needed for
 * every ticket view. */
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
    <div style={{ marginBottom: "var(--space-5)" }}>
      <button
        onClick={toggle}
        style={{
          fontSize: 12, color: "var(--accent-primary)", background: "none", border: "none",
          cursor: "pointer", padding: 0, marginBottom: open ? "var(--space-3)" : 0,
        }}
      >
        {open ? "Hide conversation" : "View the conversation that created this ticket"}
      </button>

      {open && (
        <div style={{ display: "grid", gap: "var(--space-2)", maxHeight: 280, overflowY: "auto", paddingLeft: "var(--space-2)", borderLeft: "2px solid var(--border-subtle)" }}>
          {error && <p style={{ color: "var(--danger)", fontSize: 12 }}>{error}</p>}
          {!run && !error && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading...</p>}
          {run?.events.map((e: AgentEventPayload, i: number) => (
            <div key={i} style={{ fontSize: 12 }}>
              <strong style={{ color: "var(--text-secondary)" }}>{e.agent}</strong>{" "}
              <span style={{ color: "var(--text-muted)" }}>{e.caption}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
