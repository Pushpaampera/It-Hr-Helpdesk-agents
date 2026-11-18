/** Audit Log (admin). Every mock-API call and approval/leave decision already writes a real row
 * here via app/mock_apis/__init__.py::log_action; this just surfaces it
 * (GET /api/admin/audit-log, filterable by action/actor via GET .../actions for the dropdown). */
import { useEffect, useState } from "react";

import { apiGet } from "../../api/client";
import type { AuditLogEntry } from "../../api/types";
import InfoBanner from "../../components/ui/InfoBanner";
import Panel from "../../components/ui/Panel";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import PageTransition from "../../design/pageTransition";

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<string[]>("/admin/audit-log/actions")
      .then(setActions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const qs = actionFilter ? `?action=${actionFilter}&limit=200` : "?limit=200";
    apiGet<AuditLogEntry[]>(`/admin/audit-log${qs}`)
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load audit log"));
  }, [actionFilter]);

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;

  return (
    <PageTransition routeKey="audit-log">
    <div>
      <DashboardHeader title="Audit Log" subtitle="Every action taken through the mock IT/HR systems, most recent first." />
      <InfoBanner id="audit-log">
        A permanent record of every action the AI (and the people deciding approvals and leave requests) has taken, for compliance and troubleshooting.
      </InfoBanner>

      <div style={{ marginBottom: "var(--space-4)" }}>
        <select
          aria-label="Filter by action"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{ fontSize: "0.8125rem", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      <Panel style={{ padding: 0, overflow: "hidden" }}>
        {!entries ? (
          <p style={{ fontSize: "0.8125rem", padding: "var(--space-5)" }}>Loading...</p>
        ) : entries.length === 0 ? (
          <p style={{ fontSize: "0.8125rem", padding: "var(--space-5)" }}>No entries match this filter.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>
                <th scope="col" style={{ padding: "var(--space-3) var(--space-4)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>When</th>
                <th scope="col" style={{ padding: "var(--space-3) var(--space-4)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>Who</th>
                <th scope="col" style={{ padding: "var(--space-3) var(--space-4)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>What happened</th>
                <th scope="col" style={{ padding: "var(--space-3) var(--space-4)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>What it affected</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "var(--space-3) var(--space-4)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}>{e.actor_name ?? "—"}</td>
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}>{e.action.replace(/_/g, " ")}</td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", color: "var(--text-muted)" }}>{e.target_type}</td>
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
