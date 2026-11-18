/** A short-lived message shown right after a consequential decision (approve/reject) is
 * confirmed, giving a brief chance to undo before it's final server-side. The shrinking bar is a
 * plain CSS animation — the global "Stop animations" rule in tokens.css makes it jump instead.
 *
 * Accessibility: it is announced to screen readers when it appears (role="status"), and the
 * countdown pauses while the pointer is over it or keyboard focus is inside it, so nobody is
 * rushed off the Undo button. */
import { useEffect, useRef, useState } from "react";

import Button from "./Button";
import Panel from "./Panel";

type UndoToastProps = {
  message: string;
  onUndo: () => void;
  onExpire: () => void;
};

const DURATION_MS = 5000;

export default function UndoToast({ message, onUndo, onExpire }: UndoToastProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    timeoutRef.current = setTimeout(onExpire, DURATION_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  function handleUndo() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onUndo();
  }

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{
        position: "fixed", bottom: "var(--space-6)", left: "50%", transform: "translateX(-50%)",
        zIndex: 200, width: "max-content", maxWidth: "calc(100vw - 32px)",
      }}
    >
      <Panel
        style={{
          padding: "var(--space-3) var(--space-4)", display: "flex", alignItems: "center",
          gap: "var(--space-4)", overflow: "hidden", position: "relative", border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-panel-lift)",
        }}
      >
        {!paused && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute", left: 0, bottom: 0, height: 4, width: "100%",
              background: "var(--accent-primary)", transformOrigin: "left",
              animation: `undoToastShrink ${DURATION_MS}ms linear forwards`,
            }}
          />
        )}
        <span style={{ fontSize: "0.9375rem", fontWeight: 600 }}>{message}</span>
        <Button variant="ghost" onClick={handleUndo}>
          Undo
        </Button>
      </Panel>
      <style>{`
        @keyframes undoToastShrink {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}
