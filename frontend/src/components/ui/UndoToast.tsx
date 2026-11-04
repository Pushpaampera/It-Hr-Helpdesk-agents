/** A 5-second-window toast shown right after a consequential decision (approve/reject) is
 * confirmed, giving a brief chance to undo before it's final server-side. The shrinking bar is a
 * plain CSS animation — tokens.css's `[data-reduce-motion="true"] *` rule already forces
 * animation-duration to ~0 globally, so under reduce-motion the bar just jumps instantly rather
 * than needing a separate code path here. */
import { useEffect, useRef } from "react";

import Button from "./Button";
import Panel from "./Panel";

type UndoToastProps = {
  message: string;
  onUndo: () => void;
  onExpire: () => void;
};

export default function UndoToast({ message, onUndo, onExpire }: UndoToastProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(onExpire, 5000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUndo() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onUndo();
  }

  return (
    <div
      style={{
        position: "fixed", bottom: "var(--space-6)", left: "50%", transform: "translateX(-50%)",
        zIndex: 200,
      }}
    >
      <Panel
        style={{
          padding: "var(--space-3) var(--space-4)", display: "flex", alignItems: "center",
          gap: "var(--space-4)", overflow: "hidden", position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute", left: 0, bottom: 0, height: 3, width: "100%",
            background: "var(--agent-supervisor)", transformOrigin: "left",
            animation: "undoToastShrink 5s linear forwards",
          }}
        />
        <span style={{ fontSize: 13 }}>{message}</span>
        <Button variant="ghost" onClick={handleUndo} style={{ padding: "var(--space-1) var(--space-3)", fontSize: 13 }}>
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
