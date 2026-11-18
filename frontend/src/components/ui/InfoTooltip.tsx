/** A small "(i)" icon that explains a KPI or chart in plain English, on hover AND on keyboard
 * focus (so it's reachable without a mouse) — never hover-only. */
import { useId, useState } from "react";

type InfoTooltipProps = {
  text: string;
};

export default function InfoTooltip({ text }: InfoTooltipProps) {
  const tooltipId = useId();
  const [visible, setVisible] = useState(false);

  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        type="button"
        aria-describedby={tooltipId}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setVisible(false);
        }}
        aria-label="More information"
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: "1.5px solid var(--border-strong)",
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
          fontSize: "0.8125rem",
          fontWeight: 700,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "help",
          padding: 0,
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          minWidth: 180,
          maxWidth: 260,
          padding: "var(--space-2) var(--space-3)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-panel)",
          color: "var(--text-primary)",
          fontSize: "0.8125rem",
          lineHeight: 1.4,
          fontFamily: "var(--font-body)",
          fontWeight: 400,
          textAlign: "left",
          zIndex: 50,
          pointerEvents: "none",
          opacity: visible ? 1 : 0,
          visibility: visible ? "visible" : "hidden",
          transition: "opacity var(--duration-fast) var(--ease-standard)",
        }}
      >
        {text}
      </div>
    </span>
  );
}
