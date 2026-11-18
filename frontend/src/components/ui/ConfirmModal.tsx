/** A full-screen confirmation overlay for consequential, hard-to-undo actions (deciding an
 * approval, approving a leave request) — a single accidental click on "Approve"/"Reject"
 * shouldn't be able to fire the real decision with no way back. Shows what's being decided and
 * why, and requires an explicit second click to proceed.
 *
 * Accessibility: it is a proper dialog — focus moves into it when it opens, Tab stays inside it,
 * Esc cancels, and focus returns to the button that opened it. */
import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

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
  /** Extra content rendered between the description and the action buttons — e.g. a required
   * reason textarea for a rejection. Purely additive; existing callers are unaffected. */
  extraContent?: ReactNode;
  /** Disables the confirm button for a reason other than `busy` (e.g. a required field is
   * still empty). Kept separate from `busy` since "working" and "blocked on input" are
   * different states that shouldn't share one label/spinner meaning. */
  confirmDisabled?: boolean;
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ConfirmModal({
  title, description, confirmLabel, confirmVariant = "primary", onConfirm, onCancel, busy = false,
  extraContent, confirmDisabled = false,
}: ConfirmModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus in on open (to the first control, usually a reason box or Cancel) and restore it on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialogRef.current)?.focus();
    return () => previous?.focus?.();
  }, []);

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && !busy) {
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(48, 48, 48, 0.6)", padding: "var(--space-5)",
      }}
    >
      <Panel
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        style={{ padding: "var(--space-6)", maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
      >
        <h2 id={titleId} style={{ fontSize: "1.25rem", marginBottom: "var(--space-3)" }}>{title}</h2>
        <div style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "var(--space-5)" }}>
          {description}
        </div>
        {extraContent && <div style={{ marginBottom: "var(--space-5)" }}>{extraContent}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={busy || confirmDisabled}>
            {busy ? "Working..." : confirmLabel}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
