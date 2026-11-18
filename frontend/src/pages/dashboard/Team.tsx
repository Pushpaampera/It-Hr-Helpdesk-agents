/** Team page (manager). A manager's direct reports with enough real signal — open tickets,
 * pending leave requests, last AI Assistant activity — to spot who needs attention without
 * digging through Tickets/Approvals one person at a time. Backed by GET /api/team. */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { apiGet } from "../../api/client";
import type { TeamMember } from "../../api/types";
import Badge from "../../components/ui/Badge";
import InfoBanner from "../../components/ui/InfoBanner";
import Panel from "../../components/ui/Panel";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import { fadeUp, staggerContainer } from "../../design/motion";
import PageTransition from "../../design/pageTransition";
import hover from "../../design/hoverEffects.module.css";

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
    <PageTransition routeKey="team">
    <div>
      <DashboardHeader title="Team" subtitle={`Your ${members.length} direct reports.`} />
      <InfoBanner id="team">
        A quick view of your direct reports — open tickets, pending leave, and when they last used the AI assistant — so you can spot who needs attention.
      </InfoBanner>

      {members.length === 0 ? (
        <Panel style={{ padding: "var(--space-5)" }}>
          <p style={{ fontSize: "0.8125rem" }}>No one currently reports to you.</p>
        </Panel>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer()}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-4)" }}
        >
          {members.map((m) => (
            <motion.div key={m.id} variants={fadeUp}>
            <Panel className={hover.liftOnHover} style={{ padding: "var(--space-5)" }}>
              <div style={{ marginBottom: "var(--space-3)" }}>
                <strong style={{ fontSize: "0.9375rem" }}>{m.name}</strong>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{m.title} · {m.department}</div>
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

              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                {m.total_tickets} ticket{m.total_tickets === 1 ? "" : "s"} total
                {m.last_activity_at && ` · Last active ${new Date(m.last_activity_at).toLocaleDateString()}`}
              </p>
            </Panel>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
    </PageTransition>
  );
}
