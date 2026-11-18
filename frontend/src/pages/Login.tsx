import { motion } from "framer-motion";
import { ArrowLeft, LogIn } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import AccessibilityPanel from "../components/AccessibilityPanel";
import SkipLink from "../components/SkipLink";
import Button from "../components/ui/Button";
import Logo from "../components/ui/Logo";
import Panel from "../components/ui/Panel";
import TextField from "../components/ui/TextField";
import { fadeUp } from "../design/motion";
import { useAuthStore } from "../store/authStore";
import { useUIStore } from "../store/uiStore";
import type { Role } from "../api/types";

// Per docs/00_PROJECT_OVERVIEW.md's "lands on" column. The real per-role destinations are
// Phase 8+'s job; for now every role lands on the shared /app placeholder, which shows which
// page it *would* be once the dashboard shell exists.
const DEMO_ACCOUNTS: { email: string; role: Role; label: string }[] = [
  { email: "emma.employee@acme.test", role: "employee", label: "Emma — Employee" },
  { email: "mark.manager@acme.test", role: "manager", label: "Mark — Manager" },
  { email: "hannah.hr@acme.test", role: "hr", label: "Hannah — HR" },
  { email: "alex.admin@acme.test", role: "admin", label: "Alex — Admin" },
];
const DEMO_PASSWORD = "Demo@1234";

type LocationState = { from?: { pathname: string } } | null;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const { login, isLoading, error, isAuthenticated } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const destination = (location.state as LocationState)?.from?.pathname || "/app";

  useEffect(() => {
    if (isAuthenticated) navigate(destination, { replace: true });
    // Only re-check on mount / if the destination changes — not on every isAuthenticated flip,
    // since the submit handler below already navigates right after a successful login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      navigate(destination, { replace: true });
    } catch {
      // error is already surfaced via the store's `error` field
    }
  }

  async function handleQuickSignIn(demoEmail: string) {
    try {
      await login(demoEmail, DEMO_PASSWORD);
      navigate(destination, { replace: true });
    } catch {
      // error is already surfaced via the store's `error` field
    }
  }

  const content = (
    <Panel style={{ padding: "var(--space-6)", maxWidth: 420, width: "100%" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-1)", textAlign: "center" }}>Sign in</h1>
      <p style={{ marginBottom: "var(--space-5)", textAlign: "center" }}>Use your own credentials, or jump in as a demo account.</p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
          disabled={isLoading}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <LogIn size={16} aria-hidden="true" /> {isLoading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <div style={{ margin: "var(--space-5) 0", borderTop: "1px solid var(--border-subtle)" }} />

      <h2 id="demo-heading" style={{ fontSize: "0.9375rem", marginBottom: "var(--space-1)" }}>Quick sign-in</h2>
      <p style={{ fontSize: "0.8125rem", marginBottom: "var(--space-3)" }}>Demo accounts — password Demo@1234.</p>
      <div role="group" aria-labelledby="demo-heading" style={{ display: "grid", gap: "var(--space-2)" }}>
        {DEMO_ACCOUNTS.map((account) => (
          <Button
            key={account.email}
            type="button"
            variant="ghost"
            disabled={isLoading}
            onClick={() => handleQuickSignIn(account.email)}
            style={{ justifyContent: "flex-start", fontSize: "0.875rem" }}
          >
            {account.label}
          </Button>
        ))}
      </div>
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
          <Button variant="ghost" onClick={() => navigate("/")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArrowLeft size={16} aria-hidden="true" /> Back
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
