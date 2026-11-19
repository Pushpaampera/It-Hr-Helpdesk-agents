/** Shown under the assistant's reply when someone types a private HR matter into the chat
 * (complaint, conflict with a colleague, harassment, personal issue, safety worry…). The AI does
 * not handle these. The card hands the person straight to HR: open a confidential case (with what
 * they typed copied into the form via router state, never the URL) or contact HR directly. */
import { Lock, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { HrRedirect } from "../../api/types";
import type { TalkToHrPrefill } from "../../pages/dashboard/TalkToHr";
import Button from "../ui/Button";

export default function HrRedirectCard({ redirect, originalText }: { redirect: HrRedirect; originalText?: string }) {
  const navigate = useNavigate();
  const prefill: TalkToHrPrefill = { category: redirect.category, urgent: redirect.urgent, text: originalText };

  return (
    <div
      role="group"
      aria-label="Contact HR privately"
      style={{
        marginTop: "var(--space-3)", padding: "var(--space-4)", borderRadius: "var(--radius-md)",
        border: "2px solid var(--accent-primary)", background: "var(--bg-panel)", display: "grid", gap: "var(--space-3)",
      }}
    >
      <p style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.875rem", color: "var(--accent-primary)" }}>
        <Lock size={16} aria-hidden="true" /> Private: only the HR team can see this
        {redirect.urgent ? " · marked urgent" : ""}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <Button onClick={() => navigate("/app/hr-support", { state: { prefill } })} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Lock size={16} aria-hidden="true" /> Talk to HR privately
        </Button>
        <a
          href={`mailto:${redirect.hr_email}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "var(--space-2) var(--space-5)",
            borderRadius: "var(--radius-md)", border: "2px solid var(--border-strong)", background: "var(--bg-elevated)",
            color: "var(--text-primary)", fontWeight: 600, fontSize: "0.9375rem", textDecoration: "none",
          }}
        >
          <Mail size={16} aria-hidden="true" /> Email HR: {redirect.hr_email}
        </a>
      </div>
    </div>
  );
}
