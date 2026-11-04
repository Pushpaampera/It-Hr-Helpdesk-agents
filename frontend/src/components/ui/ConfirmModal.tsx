/** A full-screen confirmation overlay for consequential, hard-to-undo actions (deciding an
 * approval, approving a leave request) — a single accidental click on "Approve"/"Reject"
 * shouldn't be able to fire the real decision with no way back. Shows what's being decided and
 * why, and requires an explicit second click to proceed. */
import type { ReactNode } from "react";

import Button from "./Button";
import Panel from "./Panel";

type ConfirmModalProps = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export default function ConfirmModal({
  title, description, confirmLabel, confirmVariant = "primary", onConfirm, onCancel, busy = false,
}: ConfirmModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(5, 5, 7, 0.72)", backdropFilter: "blur(2px)", padding: "var(--space-5)",
      }}
    >
      <Panel
        onClick={(e) => e.stopPropagation()}
        style={{ padding: "var(--space-6)", maxWidth: 440, width: "100%" }}
      >
        <h2 style={{ fontSize: 18, marginBottom: "var(--space-3)" }}>{title}</h2>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "var(--space-5)" }}>
          {description}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-3)" }}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : confirmLabel}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
