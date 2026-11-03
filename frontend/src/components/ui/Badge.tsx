/** A small status pill (ticket/approval/run status, etc.), tone-colored from the semantic
 * tokens in src/design/tokens.css. */
type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

type BadgeProps = { label: string; tone?: BadgeTone };

const TONE_COLORS: Record<BadgeTone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  neutral: "var(--text-muted)",
};

export default function Badge({ label, tone = "neutral" }: BadgeProps) {
  const color = TONE_COLORS[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: "var(--radius-full)",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        color,
        border: `1px solid ${color}`,
        background: "var(--bg-panel)",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}
