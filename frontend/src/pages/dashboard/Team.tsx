/** Team page (manager). A manager's direct reports with enough real signal — open tickets,
 * pending leave requests, last AI Assistant activity — to spot who needs attention without
 * digging through Tickets/Approvals one person at a time. Backed by GET /api/team. */
import { useEffect, useState } from "react";

import { apiGet } from "../../api/client";
import type { TeamMember } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Panel from "../../components/ui/Panel";

export default function Team() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<TeamMember[]>("/team")
      .then(setMembers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load your team"));
  }, []);

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;
  if (!members) return <Panel style={{ padding: "var(--space-5)" }}>Loading...</Panel>;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>Team</h1>
      <p style={{ marginBottom: "var(--space-5)" }}>Your {members.length} direct reports.</p>

      {members.length === 0 ? (
        <Panel style={{ padding: "var(--space-5)" }}>
          <p style={{ fontSize: 13 }}>No one currently reports to you.</p>
        </Panel>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-4)" }}>
          {members.map((m) => (
            <Panel key={m.id} style={{ padding: "var(--space-5)" }}>
              <div style={{ marginBottom: "var(--space-3)" }}>
                <strong style={{ fontSize: 15 }}>{m.name}</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.title} · {m.department}</div>
              </div>

              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
                <Badge
                  label={`${m.open_tickets} open ticket${m.open_tickets === 1 ? "" : "s"}`}
                  tone={m.open_tickets > 0 ? "warning" : "success"}
                />
                {m.pending_leave_requests > 0 && (
                  <Badge label={`${m.pending_leave_requests} pending leave`} tone="info" />
                )}
              </div>

              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {m.total_tickets} ticket{m.total_tickets === 1 ? "" : "s"} total
                {m.last_activity_at && ` · Last active ${new Date(m.last_activity_at).toLocaleDateString()}`}
              </p>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
