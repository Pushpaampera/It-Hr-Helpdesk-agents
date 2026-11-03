/** Audit Log (admin). Every mock-API call and approval/leave decision already writes a real row
 * here via app/mock_apis/__init__.py::log_action; this just surfaces it
 * (GET /api/admin/audit-log, filterable by action/actor via GET .../actions for the dropdown). */
import { useEffect, useState } from "react";

import { apiGet } from "../../api/client";
import type { AuditLogEntry } from "../../api/types";
import Panel from "../../components/ui/Panel";

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
    <div>
      <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>Audit Log</h1>
      <p style={{ marginBottom: "var(--space-4)" }}>Every action taken through the mock IT/HR systems, most recent first.</p>

      <div style={{ marginBottom: "var(--space-4)" }}>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{ fontSize: 13, padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      <Panel style={{ padding: 0, overflow: "hidden" }}>
        {!entries ? (
          <p style={{ fontSize: 13, padding: "var(--space-5)" }}>Loading...</p>
        ) : entries.length === 0 ? (
          <p style={{ fontSize: 13, padding: "var(--space-5)" }}>No entries match this filter.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>
                <th style={{ padding: "var(--space-3) var(--space-4)", fontSize: 11, color: "var(--text-muted)" }}>When</th>
                <th style={{ padding: "var(--space-3) var(--space-4)", fontSize: 11, color: "var(--text-muted)" }}>Actor</th>
                <th style={{ padding: "var(--space-3) var(--space-4)", fontSize: 11, color: "var(--text-muted)" }}>Action</th>
                <th style={{ padding: "var(--space-3) var(--space-4)", fontSize: 11, color: "var(--text-muted)" }}>Target</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "var(--space-3) var(--space-4)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}>{e.actor_name ?? "—"}</td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", fontFamily: "var(--font-mono)" }}>{e.action}</td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", color: "var(--text-muted)" }}>{e.target_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
