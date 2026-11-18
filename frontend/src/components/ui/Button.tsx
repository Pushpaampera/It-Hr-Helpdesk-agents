/** Hand-rolled button — no UI kit per CLAUDE.md's hard constraints. Styling comes from CSS
 * variable tokens so every page's buttons stay visually consistent. At least 44px tall so it is
 * easy to hit with a finger, mouse or switch device; keyboard focus uses the global focus ring. */
import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { forwardRef } from "react";

type ButtonVariant = "primary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant };

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: { background: "var(--accent-primary)", color: "var(--text-on-accent)", border: "2px solid var(--accent-primary)" },
  ghost: { background: "var(--bg-elevated)", color: "var(--text-primary)", border: "2px solid var(--border-strong)" },
  danger: { background: "var(--danger)", color: "var(--text-on-accent)", border: "2px solid var(--danger)" },
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", style, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      {...props}
      style={{
        fontFamily: "var(--font-body)",
        fontWeight: 600,
        fontSize: "0.9375rem",
        minHeight: 44,
        padding: "var(--space-2) var(--space-5)",
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "filter var(--duration-fast) var(--ease-standard)",
        ...VARIANT_STYLES[variant],
        ...style,
      }}
    />
  );
});

export default Button;
