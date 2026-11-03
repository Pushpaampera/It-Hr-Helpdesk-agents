/** Hand-rolled labeled text input — no UI kit, per CLAUDE.md. */
import type { InputHTMLAttributes } from "react";
import { forwardRef, useId } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, id, style, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", textAlign: "left" }}>
      <label htmlFor={inputId} style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        {...props}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 15,
          padding: "var(--space-3) var(--space-4)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-elevated)",
          border: `1px solid ${error ? "var(--danger)" : "var(--border-subtle)"}`,
          color: "var(--text-primary)",
          outline: "none",
          ...style,
        }}
      />
      {error && <span style={{ fontSize: 12, color: "var(--danger)" }}>{error}</span>}
    </div>
  );
});

export default TextField;
