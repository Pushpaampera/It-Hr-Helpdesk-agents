/** HR Insights page (hr/admin). Company-wide headcount/leave posture (GET /api/hr/overview)
 * plus the real pending leave requests HR has to act on, decided via
 * PATCH /api/hr/leave-requests/{id}/decide. */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { apiGet, apiPatch, apiPost } from "../../api/client";
import type { HrOverview, LeaveRequest } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import ConfirmModal from "../../components/ui/ConfirmModal";
import InfoBanner from "../../components/ui/InfoBanner";
import InfoTooltip from "../../components/ui/InfoTooltip";
import Panel from "../../components/ui/Panel";
import StatCard from "../../components/ui/StatCard";
import UndoToast from "../../components/ui/UndoToast";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import { fadeUp, staggerContainer } from "../../design/motion";
import PageTransition from "../../design/pageTransition";
import hover from "../../design/hoverEffects.module.css";

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
  const [pendingDecision, setPendingDecision] = useState<{ request: LeaveRequest; decision: "approved" | "rejected" } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [undoToast, setUndoToast] = useState<{ requestId: string; message: string } | null>(null);

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

  async function confirmDecision() {
    if (!pendingDecision) return;
    const { request, decision } = pendingDecision;
    if (decision === "rejected" && !rejectReason.trim()) return;
    setDecidingId(request.id);
    try {
      await apiPatch(`/hr/leave-requests/${request.id}/decide`, {
        decision, comment: decision === "rejected" ? rejectReason.trim() : undefined,
      });
      setPendingDecision(null);
      setRejectReason("");
      load();
      setUndoToast({
        requestId: request.id,
        message: decision === "approved" ? "Leave approved. Undo?" : "Leave request rejected. Undo?",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record decision");
    } finally {
      setDecidingId(null);
    }
  }

  async function undoDecision() {
    if (!undoToast) return;
    const { requestId } = undoToast;
    setUndoToast(null);
    try {
      await apiPost(`/hr/leave-requests/${requestId}/undo`, {});
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to undo — the decision may already be final");
    }
  }

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;
  if (!overview || !pending) return <Panel style={{ padding: "var(--space-5)" }}>Loading...</Panel>;

  return (
    <PageTransition routeKey="hr-insights">
    <div>
      <DashboardHeader title="HR Insights" subtitle="Company-wide headcount, leave posture, and pending leave requests." />
      <InfoBanner id="hr-insights">
        This page shows headcount and leave trends across the whole company, plus any leave requests that still need your decision.
      </InfoBanner>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer()}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}
      >
        <StatCard
          label="Headcount"
          value={overview.headcount_by_department.reduce((sum, d) => sum + d.count, 0)}
          infoText="The total number of active employees across every department."
        />
        <StatCard
          label="Pending leave"
          value={overview.leave_requests_by_status.pending}
          infoText="Leave requests still waiting on a decision."
        />
        <StatCard
          label="Approved leave"
          value={overview.leave_requests_by_status.approved}
          infoText="Leave requests that have been approved."
        />
        <StatCard
          label="Rejected leave"
          value={overview.leave_requests_by_status.rejected}
          infoText="Leave requests that were turned down."
        />
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <Panel style={{ padding: "var(--space-5)" }}>
          <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            Headcount by department
            <InfoTooltip text="How many active employees are in each department." />
          </h2>
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
          <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            How much leave has been used
            <InfoTooltip text="What share of each leave type's total allowance has already been used, company-wide." />
          </h2>
          {overview.leave_balances_by_type.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No leave balance data yet.</p>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={overview.leave_balances_by_type.map((b) => ({
                    leave_type: b.leave_type.charAt(0).toUpperCase() + b.leave_type.slice(1),
                    utilization_pct: Math.round(b.utilization * 100),
                  }))}
                  layout="vertical"
                  margin={{ left: 8 }}
                >
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: "#8c87a3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: "% of balance used", position: "insideBottom", offset: -4, fill: "#8c87a3", fontSize: 11 }}
                  />
                  <YAxis type="category" dataKey="leave_type" tick={{ fill: "#5c5775", fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip
                    contentStyle={{ background: "#ffffff", border: "1px solid rgba(124,112,175,0.18)", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#5c5775" }}
                    formatter={(v: number) => [`${v}%`, "Utilization"]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#5c5775" }} />
                  <Bar dataKey="utilization_pct" name="Utilization" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <Panel style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          Upcoming approved leave
          <InfoTooltip text="People who are approved to be out soon, so you can plan around it." />
        </h2>
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
        <motion.div initial="hidden" animate="visible" variants={staggerContainer()} style={{ display: "grid", gap: "var(--space-3)" }}>
          {pending.map((r) => (
            <motion.div key={r.id} variants={fadeUp}>
            <Panel className={hover.liftOnHover} style={{ padding: "var(--space-4) var(--space-5)" }}>
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
                  <Button variant="danger" disabled={decidingId === r.id} onClick={() => setPendingDecision({ request: r, decision: "rejected" })}>Reject</Button>
                  <Button variant="primary" disabled={decidingId === r.id} onClick={() => setPendingDecision({ request: r, decision: "approved" })}>Approve</Button>
                </div>
              </div>
            </Panel>
            </motion.div>
          ))}
        </motion.div>
      )}

      {pendingDecision && (
        <ConfirmModal
          title={pendingDecision.decision === "approved" ? "Approve this leave request?" : "Reject this leave request?"}
          description={
            <>
              <strong>{pendingDecision.request.user_name}</strong> ({pendingDecision.request.department}) requested{" "}
              <strong>{pendingDecision.request.leave_type}</strong> leave from{" "}
              <strong>{pendingDecision.request.start_date}</strong> to <strong>{pendingDecision.request.end_date}</strong>{" "}
              ({pendingDecision.request.days} day{pendingDecision.request.days === 1 ? "" : "s"})
              {pendingDecision.request.reason ? <> — "{pendingDecision.request.reason}"</> : null}.
              {pendingDecision.decision === "approved" ? (
                <p style={{ marginTop: "var(--space-3)" }}>
                  Approving immediately deducts {pendingDecision.request.days} day(s) from their{" "}
                  {pendingDecision.request.leave_type} balance. You'll have a 5-second window to undo right
                  after confirming.
                </p>
              ) : (
                <p style={{ marginTop: "var(--space-3)" }}>
                  Rejecting leaves their leave balance unchanged. You'll have a 5-second window to undo right
                  after confirming.
                </p>
              )}
            </>
          }
          extraContent={
            pendingDecision.decision === "rejected" ? (
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: "var(--space-2)" }}>
                  Reason for rejecting (required)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Conflicts with team coverage during this period"
                  rows={3}
                  style={{
                    width: "100%", resize: "vertical", fontFamily: "var(--font-body)", fontSize: 13,
                    padding: "var(--space-3)", borderRadius: "var(--radius-md)",
                    background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)", outline: "none",
                  }}
                />
              </div>
            ) : undefined
          }
          confirmLabel={pendingDecision.decision === "approved" ? "Yes, approve" : "Yes, reject"}
          confirmVariant={pendingDecision.decision === "approved" ? "primary" : "danger"}
          busy={decidingId === pendingDecision.request.id}
          confirmDisabled={pendingDecision.decision === "rejected" && !rejectReason.trim()}
          onConfirm={confirmDecision}
          onCancel={() => {
            setPendingDecision(null);
            setRejectReason("");
          }}
        />
      )}

      {undoToast && (
        <UndoToast
          message={undoToast.message}
          onUndo={undoDecision}
          onExpire={() => setUndoToast(null)}
        />
      )}
    </div>
    </PageTransition>
  );
}
