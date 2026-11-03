/** The global "Reduce motion" control required by CLAUDE.md. Every 3D component reads
 * useUIStore's `reduceMotion` flag directly, and src/design/motion.ts's Framer Motion variants
 * respect the same flag via `prefersReducedMotion()` — this is the one switch that drives both. */
import { useUIStore } from "../store/uiStore";

export default function ReduceMotionToggle() {
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const toggleReduceMotion = useUIStore((s) => s.toggleReduceMotion);

  return (
    <button
      type="button"
      onClick={toggleReduceMotion}
      aria-pressed={reduceMotion}
      className="glass-panel"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-4)",
        color: "var(--text-secondary)",
        fontSize: 13,
        fontFamily: "var(--font-body)",
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "var(--radius-full)",
          background: reduceMotion ? "var(--warning)" : "var(--success)",
          flexShrink: 0,
        }}
      />
      Reduce motion: {reduceMotion ? "On" : "Off"}
    </button>
  );
}
