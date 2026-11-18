/** Hand-rolled labeled text input — no UI kit, per CLAUDE.md. The label is always visible and
 * tied to the input; an error is announced to screen readers and linked to the field. */
import type { InputHTMLAttributes } from "react";
import { forwardRef, useId } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, id, style, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", textAlign: "left" }}>
      <label htmlFor={inputId} style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "1rem",
          minHeight: 44,
          padding: "var(--space-2) var(--space-4)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-elevated)",
          border: `2px solid ${error ? "var(--danger)" : "var(--border-strong)"}`,
          color: "var(--text-primary)",
          ...style,
        }}
      />
      {error && (
        <span id={errorId} role="alert" style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
});

export default TextField;
