import { useNavigate } from "react-router-dom";

import ReduceMotionToggle from "../components/ReduceMotionToggle";
import Button from "../components/ui/Button";
import Panel from "../components/ui/Panel";

/** Temporary stand-in for the real login page, which is Phase 7's deliverable (JWT form,
 * role-aware post-login redirect, demo-account quick-picker). This exists only so Phase 6's
 * landing page CTA has somewhere real to navigate to instead of a 404. */
export default function LoginPlaceholder() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-6)" }}>
      <Panel style={{ padding: "var(--space-6)", maxWidth: 440, textAlign: "center" }}>
        <h1 style={{ fontSize: 24, marginBottom: "var(--space-2)" }}>Sign in</h1>
        <p style={{ marginBottom: "var(--space-5)" }}>
          The real login page (JWT form, demo-account picker) is Phase 7's deliverable. For now,
          authenticate via <code className="mono">POST /api/auth/login</code> directly.
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center" }}>
          <Button variant="ghost" onClick={() => navigate("/")}>
            Back to landing
          </Button>
          <ReduceMotionToggle />
        </div>
      </Panel>
    </div>
  );
}
