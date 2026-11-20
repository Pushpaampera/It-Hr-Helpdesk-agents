/** "Choose a new password": the only page a person sees after signing in with a temporary
 * password (from the assistant's verified reset, or from IT support). The session is limited
 * until this is done — the backend refuses everything else — and the new password replaces it
 * with a normal session.
 *
 * Accessibility: every field is labelled, the rules are listed as text (met / not met is said in
 * words, not just shown), and errors are announced. */
import { motion } from "framer-motion";
import { Check, Circle, KeyRound, LogOut } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import AccessibilityPanel from "../components/AccessibilityPanel";
import SkipLink from "../components/SkipLink";
import Button from "../components/ui/Button";
import Logo from "../components/ui/Logo";
import Panel from "../components/ui/Panel";
import TextField from "../components/ui/TextField";
import { fadeUp } from "../design/motion";
import { useAuthStore } from "../store/authStore";
import { useUIStore } from "../store/uiStore";

const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "An upper-case letter", test: (p) => /[A-Z]/.test(p) },
  { label: "A lower-case letter", test: (p) => /[a-z]/.test(p) },
  { label: "A number", test: (p) => /\d/.test(p) },
];

export default function ChangePassword() {
  const navigate = useNavigate();
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const { isAuthenticated, user, changePassword, logout } = useAuthStore();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user?.must_change_password) return <Navigate to="/app" replace />;

  const rulesMet = RULES.every((r) => r.test(next));
  const mismatch = confirm.length > 0 && confirm !== next;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rulesMet) {
      setError("Your new password doesn't meet all the rules yet.");
      return;
    }
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    if (next === current) {
      setError("Please choose a password different from the temporary one.");
      return;
    }
    setSaving(true);
    try {
      await changePassword(current, next);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    logout();
    navigate("/login", { replace: true });
  }

  const content = (
    <Panel style={{ padding: "var(--space-6)", maxWidth: 440, width: "100%" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-1)", textAlign: "center" }}>Choose a new password</h1>
      <p style={{ marginBottom: "var(--space-5)", textAlign: "center" }}>
        You signed in with a temporary password{user?.name ? `, ${user.name.split(" ")[0]}` : ""}. Choose your own
        password to continue.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <TextField
          label="Temporary password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-describedby="password-rules"
          required
        />
        <ul
          id="password-rules"
          aria-label="Password rules"
          style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4, fontSize: "0.875rem" }}
        >
          {RULES.map((rule) => {
            const met = rule.test(next);
            return (
              <li
                key={rule.label}
                style={{ display: "flex", alignItems: "center", gap: 6, color: met ? "var(--text-primary)" : "var(--text-muted)" }}
              >
                {met ? (
                  <Check size={16} color="var(--accent-primary)" aria-hidden="true" />
                ) : (
                  <Circle size={14} aria-hidden="true" />
                )}
                {rule.label}
                <span className="sr-only">{met ? " (done)" : " (not yet)"}</span>
              </li>
            );
          })}
        </ul>
        <TextField
          label="Type the new password again"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "The two new passwords don't match." : undefined}
          required
        />
        {error && (
          <p style={{ color: "var(--danger)", fontSize: "0.875rem", fontWeight: 600 }} role="alert">
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={saving}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <KeyRound size={16} aria-hidden="true" /> {saving ? "Saving..." : "Save new password"}
        </Button>
      </form>
    </Panel>
  );

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <SkipLink />
      <header
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-5)", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <Logo to="/" size={26} />
        <nav aria-label="Main" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={handleSignOut} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <LogOut size={16} aria-hidden="true" /> Sign out
          </Button>
          <AccessibilityPanel />
        </nav>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-6) var(--space-4)" }}
      >
        {reduceMotion ? (
          content
        ) : (
          <motion.div initial="hidden" animate="visible" variants={fadeUp} style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            {content}
          </motion.div>
        )}
      </main>
    </div>
  );
}
