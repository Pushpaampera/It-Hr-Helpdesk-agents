/** Approvals page (manager/admin). Decides the real `access_request` approvals a manager's
 * reports raise through the AI Assistant (Phase 9's Atlas agent) — this gives that pause/
 * resume flow a real UI instead of the direct-API calls Phase 9 verified it with. Deciding
 * resumes the paused agent run server-side (app/agents/graph.py::resume_after_approval). */
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { apiGet, apiPost } from "../../api/client";
import type { Approval } from "../../api/types";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import ConfirmModal from "../../components/ui/ConfirmModal";
import InfoBanner from "../../components/ui/InfoBanner";
import Panel from "../../components/ui/Panel";
import UndoToast from "../../components/ui/UndoToast";
import { fadeUp, staggerContainer } from "../../design/motion";
import PageTransition from "../../design/pageTransition";
import hover from "../../design/hoverEffects.module.css";
import AgentMascot from "../../three/AgentMascot";
import type { RoboState } from "../../three/RoboCompanion";

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
  const [pendingDecision, setPendingDecision] = useState<{ approval: Approval; decision: "approved" | "rejected" } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [mascotState, setMascotState] = useState<RoboState>("idle");
  const mascotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoToast, setUndoToast] = useState<{ approvalId: string; message: string } | null>(null);

  useEffect(() => {
    return () => {
      if (mascotTimeoutRef.current) clearTimeout(mascotTimeoutRef.current);
    };
  }, []);

  function load() {
    apiGet<Approval[]>(`/approvals?status=${statusFilter}`)
      .then(setApprovals)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load approvals"));
  }

  useEffect(load, [statusFilter]);

  async function confirmDecision() {
    if (!pendingDecision) return;
    const { approval, decision } = pendingDecision;
    if (decision === "rejected" && !rejectReason.trim()) return;
    setDecidingId(approval.id);
    try {
      await apiPost(`/approvals/${approval.id}/decide`, {
        decision, comment: decision === "rejected" ? rejectReason.trim() : undefined,
      });
      setPendingDecision(null);
      setRejectReason("");
      load();
      setMascotState(decision === "approved" ? "success" : "blocked");
      if (mascotTimeoutRef.current) clearTimeout(mascotTimeoutRef.current);
      mascotTimeoutRef.current = setTimeout(() => setMascotState("idle"), 1600);
      setUndoToast({
        approvalId: approval.id,
        message: decision === "approved" ? "Access approved. Undo?" : "Request rejected. Undo?",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record decision");
    } finally {
      setDecidingId(null);
    }
  }

  async function undoDecision() {
    if (!undoToast) return;
    const { approvalId } = undoToast;
    setUndoToast(null);
    try {
      await apiPost(`/approvals/${approvalId}/undo`, {});
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to undo — the decision may already be final");
    }
  }

  if (error) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;

  return (
    <PageTransition routeKey="approvals">
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <AgentMascot agent="action" state={mascotState} size={64} />
        <div>
          <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>Approvals</h1>
          <p style={{ marginBottom: "var(--space-4)" }}>
            Access requests the AI Assistant escalated for your sign-off.
          </p>
        </div>
      </div>
      <InfoBanner id="approvals">
        Access requests the AI's Assistant paused mid-conversation, waiting on your decision. Approving or rejecting resumes that employee's conversation automatically.
      </InfoBanner>

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
        <motion.div initial="hidden" animate="visible" variants={staggerContainer()} style={{ display: "grid", gap: "var(--space-4)" }}>
          {approvals.map((a) => (
            <motion.div key={a.id} variants={fadeUp}>
            <Panel className={hover.liftOnHover} style={{ padding: "var(--space-5)" }}>
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
                    <Button variant="danger" disabled={decidingId === a.id} onClick={() => setPendingDecision({ approval: a, decision: "rejected" })}>
                      Reject
                    </Button>
                    <Button variant="primary" disabled={decidingId === a.id} onClick={() => setPendingDecision({ approval: a, decision: "approved" })}>
                      Approve
                    </Button>
                  </div>
                )}
              </div>
            </Panel>
            </motion.div>
          ))}
        </motion.div>
      )}

      {pendingDecision && (
        <ConfirmModal
          title={pendingDecision.decision === "approved" ? "Approve this access request?" : "Reject this access request?"}
          description={
            <>
              <strong>{pendingDecision.approval.requester_name}</strong> is requesting{" "}
              <strong>{String(pendingDecision.approval.payload.access_level ?? "access")}</strong> on{" "}
              <strong>{String(pendingDecision.approval.payload.system ?? pendingDecision.approval.type)}</strong>
              {pendingDecision.approval.payload.justification
                ? <> — justified as "{String(pendingDecision.approval.payload.justification)}"</>
                : null}
              .
              {pendingDecision.decision === "approved" ? (
                <p style={{ marginTop: "var(--space-3)" }}>
                  Approving grants them this access immediately and resumes their paused AI Assistant
                  conversation. You'll have a 5-second window to undo right after confirming.
                </p>
              ) : (
                <p style={{ marginTop: "var(--space-3)" }}>
                  Rejecting tells the requester this access was denied and resumes their paused AI Assistant
                  conversation with that outcome. You'll have a 5-second window to undo right after confirming.
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
                  placeholder="e.g. Access level too broad for this role"
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
          busy={decidingId === pendingDecision.approval.id}
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
