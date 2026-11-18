/** The "Accessibility" button and its settings panel, available on every page (landing page,
 * sign-in and the dashboard top bar). It replaces the old standalone "Reduce motion" toggle.
 *
 * Modelled on the accessibility menu on amperadei.com but kept deliberately small: text size,
 * high contrast, an easy-to-read font, extra spacing and "stop animations". Choices are saved in
 * this browser (see src/store/uiStore.ts). Fully usable by keyboard and screen reader: the button
 * announces whether the panel is open, Esc closes it and returns focus to the button. */
import { Accessibility, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useUIStore, type TextSize } from "../store/uiStore";

const TEXT_SIZES: { value: TextSize; label: string; sample: string }[] = [
  { value: "normal", label: "Normal", sample: "A" },
  { value: "large", label: "Large", sample: "A" },
  { value: "xlarge", label: "Extra large", sample: "A" },
];

const SAMPLE_SIZES: Record<TextSize, string> = { normal: "1rem", large: "1.2rem", xlarge: "1.45rem" };

export default function AccessibilityPanel() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const {
    textSize, highContrast, readableFont, extraSpacing, reduceMotion,
    setTextSize, setHighContrast, setReadableFont, setExtraSpacing, setReduceMotion, resetPreferences,
  } = useUIStore();

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  // Esc closes and hands focus back; a click outside also closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const switches = [
    { id: "contrast", label: "High contrast", hint: "Black text, strong borders.", checked: highContrast, onChange: setHighContrast },
    { id: "font", label: "Easy-to-read font", hint: "A font designed to be easier with dyslexia.", checked: readableFont, onChange: setReadableFont },
    { id: "spacing", label: "Extra spacing", hint: "More space between lines, letters and words.", checked: extraSpacing, onChange: setExtraSpacing },
    { id: "motion", label: "Stop animations", hint: "Turns off movement and transitions.", checked: reduceMotion, onChange: setReduceMotion },
  ];

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        style={{
          display: "inline-flex", alignItems: "center", gap: "var(--space-2)", minHeight: 44,
          padding: "0 var(--space-4)", borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-strong)", background: "var(--bg-elevated)",
          color: "var(--text-primary)", fontSize: "0.875rem", fontWeight: 600,
        }}
      >
        <Accessibility size={18} aria-hidden="true" />
        Accessibility
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Accessibility settings"
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 150,
            width: "min(360px, calc(100vw - 32px))", maxHeight: "80vh", overflowY: "auto",
            padding: "var(--space-5)", borderRadius: "var(--radius-lg)",
            background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
            boxShadow: "var(--shadow-panel-lift)", textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
            <h2 style={{ fontSize: "1.0625rem" }}>Accessibility</h2>
            <button
              ref={closeRef}
              type="button"
              aria-label="Close accessibility settings"
              onClick={() => { setOpen(false); buttonRef.current?.focus(); }}
              style={{
                width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: "none", background: "transparent", color: "var(--text-secondary)", borderRadius: "var(--radius-md)",
              }}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <fieldset style={{ border: "none", padding: 0, margin: "0 0 var(--space-4)" }}>
            <legend style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-2)", padding: 0 }}>Text size</legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-2)" }}>
              {TEXT_SIZES.map((size) => {
                const selected = textSize === size.value;
                return (
                  <button
                    key={size.value}
                    type="button"
                    onClick={() => setTextSize(size.value)}
                    aria-pressed={selected}
                    style={{
                      minHeight: 56, borderRadius: "var(--radius-md)", padding: "var(--space-2)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                      border: `2px solid ${selected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                      background: selected ? "var(--accent-primary)" : "var(--bg-elevated)",
                      color: selected ? "var(--text-on-accent)" : "var(--text-primary)",
                    }}
                  >
                    <span aria-hidden="true" style={{ fontSize: SAMPLE_SIZES[size.value], fontWeight: 700, lineHeight: 1 }}>{size.sample}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{size.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div style={{ display: "grid", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
            {switches.map((s) => (
              <label
                key={s.id}
                htmlFor={`a11y-${s.id}`}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "var(--space-3)", cursor: "pointer",
                  padding: "var(--space-3)", borderRadius: "var(--radius-md)",
                  border: `1px solid ${s.checked ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  background: s.checked ? "var(--brand-soft)" : "var(--bg-elevated)",
                }}
              >
                <input
                  id={`a11y-${s.id}`}
                  type="checkbox"
                  checked={s.checked}
                  onChange={(e) => s.onChange(e.target.checked)}
                  style={{ width: 22, height: 22, marginTop: 2, accentColor: "var(--accent-primary)", flexShrink: 0 }}
                />
                <span>
                  <span style={{ display: "block", fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>{s.label}</span>
                  <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{s.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={resetPreferences}
            style={{
              display: "inline-flex", alignItems: "center", gap: "var(--space-2)", minHeight: 44,
              padding: "0 var(--space-4)", borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-strong)", background: "var(--bg-elevated)",
              color: "var(--text-primary)", fontSize: "0.875rem", fontWeight: 600,
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reset to default
          </button>
        </div>
      )}
    </div>
  );
}
