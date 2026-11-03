import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

import ReduceMotionToggle from "../components/ReduceMotionToggle";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Panel from "../components/ui/Panel";
import { useAuthStore } from "../store/authStore";
import type { Role } from "../api/types";

// Per docs/00_PROJECT_OVERVIEW.md's "lands on" column — the real pages are Phase 8+'s job.
const LANDING_PAGE_BY_ROLE: Record<Role, string> = {
  employee: "AI Assistant",
  manager: "Overview (Approvals badge)",
  hr: "HR Insights",
  admin: "Control Room",
};

/** Temporary stand-in for the real dashboard shell (Phase 8). Confirms the authenticated
 * session is real and shows which page this role would actually land on once the dashboard
 * exists — this is what Login.tsx's role-aware redirect currently sends everyone to. */
export default function AppPlaceholder() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  function handleLogout() {
    logout();
    navigate("/");
  }

  if (!user) return null;

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-6)" }}>
      <Panel style={{ padding: "var(--space-6)", maxWidth: 480, textAlign: "center" }}>
        <h1 style={{ fontSize: 24, marginBottom: "var(--space-2)" }}>Signed in</h1>
        <p style={{ marginBottom: "var(--space-4)" }}>
          The dashboard shell is Phase 8's deliverable. You're authenticated as:
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-5)" }}>
          <strong style={{ fontSize: 18 }}>{user.name}</strong>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{user.email}</span>
          <Badge label={user.role} tone="info" />
          <p style={{ fontSize: 13, marginTop: "var(--space-2)" }}>
            Would land on: <strong>{LANDING_PAGE_BY_ROLE[user.role]}</strong>
          </p>
        </div>

        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center" }}>
          <Button variant="ghost" onClick={handleLogout} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <LogOut size={16} /> Sign out
          </Button>
          <ReduceMotionToggle />
        </div>
      </Panel>
    </div>
  );
}
