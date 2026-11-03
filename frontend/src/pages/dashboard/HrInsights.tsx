/** HR Insights page (hr/admin). Company-wide headcount/leave posture (GET /api/hr/overview)
 * plus the real pending leave requests HR has to act on, decided via
 * PATCH /api/hr/leave-requests/{id}/decide. */
import { useEffect, useState } from "react";

import { apiGet, apiPatch } from "../../api/client";
import type { HrOverview, LeaveRequest } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";

function statusTone(status: string): "success" | "warning" | "danger" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

export default function HrInsights() {
  const [overview, setOverview] = useState<HrOverview | null>(null);
  const [pending, setPending] = useState<LeaveRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  function load() {
    Promise.all([
      apiGet<HrOverview>("/hr/overview"),
      apiGet<LeaveRequest[]>("/hr/leave-requests?status=pending"),
    ])
      .then(([o, p]) => {
        setOverview(o);
        setPending(p);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load HR insights"));
  }

  useEffect(load, []);

  async function decide(id: string, decision: "approved" | "rejected") {
    setDecidingId(id);
    try {
      await apiPatch(`/hr/leave-requests/${id}/decide`, { decision });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record decision");
    } finally {
      setDecidingId(null);
    }
  }

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;
  if (!overview || !pending) return <Panel style={{ padding: "var(--space-5)" }}>Loading...</Panel>;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>HR Insights</h1>
      <p style={{ marginBottom: "var(--space-5)" }}>Company-wide headcount, leave posture, and pending leave requests.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
        <StatCard label="Headcount" value={overview.headcount_by_department.reduce((sum, d) => sum + d.count, 0)} />
        <StatCard label="Pending leave" value={overview.leave_requests_by_status.pending} />
        <StatCard label="Approved leave" value={overview.leave_requests_by_status.approved} />
        <StatCard label="Rejected leave" value={overview.leave_requests_by_status.rejected} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <Panel style={{ padding: "var(--space-5)" }}>
          <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>Headcount by department</h2>
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            {overview.headcount_by_department.map((d) => (
              <div key={d.department} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{d.department}</span>
                <span style={{ color: "var(--text-muted)" }}>{d.count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel style={{ padding: "var(--space-5)" }}>
          <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>Leave balance utilization</h2>
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {overview.leave_balances_by_type.map((b) => (
              <div key={b.leave_type}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4, textTransform: "capitalize" }}>
                  <span>{b.leave_type}</span>
                  <span style={{ color: "var(--text-muted)" }}>{Math.round(b.utilization * 100)}%</span>
                </div>
                <div style={{ height: 6, borderRadius: "var(--radius-full)", background: "var(--bg-elevated)" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, b.utilization * 100)}%`, borderRadius: "var(--radius-full)", background: "var(--agent-supervisor)" }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>Upcoming approved leave</h2>
        {overview.upcoming_approved_leave.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Nothing scheduled.</p>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            {overview.upcoming_approved_leave.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{l.user_name} — {l.leave_type} ({l.days}d)</span>
                <span style={{ color: "var(--text-muted)" }}>{l.start_date} → {l.end_date}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <h2 style={{ fontSize: 16, marginBottom: "var(--space-4)" }}>Pending leave requests</h2>
      {pending.length === 0 ? (
        <Panel style={{ padding: "var(--space-5)" }}>
          <p style={{ fontSize: 13 }}>No pending leave requests.</p>
        </Panel>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {pending.map((r) => (
            <Panel key={r.id} style={{ padding: "var(--space-4) var(--space-5)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-4)" }}>
                <div>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    <strong>{r.user_name}</strong> ({r.department}) — <Badge label={r.leave_type} tone="info" />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {r.start_date} → {r.end_date} ({r.days}d){r.reason ? ` · ${r.reason}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                  <Button variant="danger" disabled={decidingId === r.id} onClick={() => decide(r.id, "rejected")}>Reject</Button>
                  <Button variant="primary" disabled={decidingId === r.id} onClick={() => decide(r.id, "approved")}>Approve</Button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
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
