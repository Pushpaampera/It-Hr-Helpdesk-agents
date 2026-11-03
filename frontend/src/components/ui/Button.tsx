/** Hand-rolled button — no UI kit per CLAUDE.md's hard constraints. Styling comes from CSS
 * variable tokens so every page's buttons stay visually consistent without a shared stylesheet
 * import graph to manage. */
import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { forwardRef } from "react";

type ButtonVariant = "primary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant };

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: { background: "var(--agent-supervisor)", color: "#fff", border: "1px solid transparent" },
  ghost: { background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border-strong)" },
  danger: { background: "var(--danger)", color: "#fff", border: "1px solid transparent" },
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", style, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      {...props}
      style={{
        fontFamily: "var(--font-body)",
        fontWeight: 600,
        fontSize: 14,
        padding: "var(--space-3) var(--space-5)",
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "filter var(--duration-fast) var(--ease-standard)",
        ...VARIANT_STYLES[variant],
        ...style,
      }}
    />
  );
});

export default Button;
