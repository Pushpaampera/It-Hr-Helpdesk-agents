/** A small status pill (ticket/approval/run status, etc.). The status is always written out in
 * words, and each tone also has its own shape, so it never depends on colour alone. */
import { AlertTriangle, Check, Info, X, Circle } from "lucide-react";

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

type BadgeProps = { label: string; tone?: BadgeTone };

const TONE_COLORS: Record<BadgeTone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  neutral: "var(--text-secondary)",
};

const TONE_ICONS = { success: Check, warning: AlertTriangle, danger: X, info: Info, neutral: Circle };

export default function Badge({ label, tone = "neutral" }: BadgeProps) {
  const color = TONE_COLORS[tone];
  const Icon = TONE_ICONS[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: "var(--radius-full)",
        fontSize: "0.8125rem",
        fontWeight: 600,
        color,
        border: `1.5px solid ${color}`,
        background: "var(--bg-elevated)",
      }}
    >
      <Icon size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
      {label}
    </span>
  );
}
