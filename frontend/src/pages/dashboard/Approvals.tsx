/** Approvals page (manager/admin). Decides the real `access_request` approvals a manager's
 * reports raise through the AI Assistant (Phase 9's Atlas agent) — this gives that pause/
 * resume flow a real UI instead of the direct-API calls Phase 9 verified it with. Deciding
 * resumes the paused agent run server-side (app/agents/graph.py::resume_after_approval). */
import { useEffect, useState } from "react";

import { apiGet, apiPost } from "../../api/client";
import type { Approval } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";

function statusTone(status: string): "success" | "warning" | "danger" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

export default function Approvals() {
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  function load() {
    apiGet<Approval[]>(`/approvals?status=${statusFilter}`)
      .then(setApprovals)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load approvals"));
  }

  useEffect(load, [statusFilter]);

  async function decide(id: string, decision: "approved" | "rejected") {
    setDecidingId(id);
    try {
      await apiPost(`/approvals/${id}/decide`, { decision });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record decision");
    } finally {
      setDecidingId(null);
    }
  }

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>Approvals</h1>
      <p style={{ marginBottom: "var(--space-4)" }}>
        Access requests the AI Assistant escalated for your sign-off.
      </p>

      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              fontSize: 12, padding: "6px 14px", borderRadius: "var(--radius-full)", textTransform: "capitalize",
              border: `1px solid ${statusFilter === s ? "var(--agent-supervisor)" : "var(--border-subtle)"}`,
              background: statusFilter === s ? "var(--agent-supervisor)" : "transparent",
              color: statusFilter === s ? "#fff" : "var(--text-secondary)", cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {!approvals ? (
        <Panel style={{ padding: "var(--space-5)" }}>Loading...</Panel>
      ) : approvals.length === 0 ? (
        <Panel style={{ padding: "var(--space-5)" }}>
          <p style={{ fontSize: 13 }}>No {statusFilter} approvals.</p>
        </Panel>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          {approvals.map((a) => (
            <Panel key={a.id} style={{ padding: "var(--space-5)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                    <strong style={{ fontSize: 14 }}>{a.requester_name}</strong>
                    <Badge label={a.status} tone={statusTone(a.status)} />
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: "var(--space-2)" }}>
                    Requesting <strong>{String(a.payload.access_level ?? "access")}</strong> on{" "}
                    <strong>{String(a.payload.system ?? a.type)}</strong>
                    {a.payload.justification ? ` — "${String(a.payload.justification)}"` : ""}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Requested {new Date(a.created_at).toLocaleString()}
                    {a.decided_at && ` · Decided ${new Date(a.decided_at).toLocaleString()}`}
                  </p>
                </div>

                {a.status === "pending" && (
                  <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                    <Button variant="danger" disabled={decidingId === a.id} onClick={() => decide(a.id, "rejected")}>
                      Reject
                    </Button>
                    <Button variant="primary" disabled={decidingId === a.id} onClick={() => decide(a.id, "approved")}>
                      Approve
                    </Button>
                  </div>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
