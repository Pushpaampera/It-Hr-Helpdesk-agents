/** A one-line "what is this page?" banner, dismissible for the current browser tab/session
 * only (sessionStorage, keyed by `id` so each page's dismissal is independent). Reappears on
 * the next session/page reload, since it's meant to orient a first-time or returning viewer,
 * not something that should be permanently buried on first click. */
import { useState, type ReactNode } from "react";

type InfoBannerProps = {
  id: string;
  children: ReactNode;
};

function storageKey(id: string): string {
  return `helpdesk.infoBannerDismissed.${id}`;
}

function readDismissed(id: string): boolean {
  try {
    return window.sessionStorage.getItem(storageKey(id)) === "true";
  } catch {
    return false;
  }
}

export default function InfoBanner({ id, children }: InfoBannerProps) {
  const [dismissed, setDismissed] = useState(() => readDismissed(id));

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(storageKey(id), "true");
    } catch {
      // Best-effort only — a private-browsing session that can't persist this will just show
      // the banner again next time, which is harmless.
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        marginBottom: "var(--space-4)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-panel)",
        borderLeft: "3px solid var(--accent-primary)",
        fontSize: 13,
        color: "var(--text-secondary)",
        lineHeight: 1.5,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "1px solid var(--accent-primary)",
          color: "var(--accent-primary)",
          fontSize: 11,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        i
      </span>
      <span style={{ flex: 1 }}>{children}</span>
      <button
        onClick={dismiss}
        aria-label="Dismiss this explanation"
        style={{
          flexShrink: 0,
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1,
          cursor: "pointer",
          padding: 2,
        }}
      >
        ×
      </button>
    </div>
  );
}
