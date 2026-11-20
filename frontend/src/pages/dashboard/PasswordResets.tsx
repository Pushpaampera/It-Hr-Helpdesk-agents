/** Password Resets (IT support and admins). Find a person, see their company accounts (Windows /
 * VPN login — also the HelpDesk sign-in — Email, Payroll portal, HR portal), and reset one after
 * confirming who they are. This is how someone who can't sign in at all gets help: they contact IT
 * support. The temporary password is shown once and never stored; every reset is audited and the
 * person is notified. IT support can also record a personal email, used for the reset code when
 * someone forgets their work email password. (GET/POST/PUT /api/it/accounts)
 *
 * Nobody resets their own accounts here — they use the assistant like everyone else. */
import { KeyRound, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { apiGet, apiPost, apiPut } from "../../api/client";
import type { AccountPerson, AccountResetResponse, AccountsResponse, CompanySystem } from "../../api/types";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import InfoBanner from "../../components/ui/InfoBanner";
import Panel from "../../components/ui/Panel";
import TextField from "../../components/ui/TextField";
import PageTransition from "../../design/pageTransition";
import { useAuthStore } from "../../store/authStore";

const ROLE_LABEL: Record<string, string> = { employee: "Employee", it_support: "IT support", hr: "HR", admin: "Admin" };

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)", fontSize: "0.875rem", padding: "var(--space-2) var(--space-3)",
  borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)", color: "var(--text-primary)",
};

export default function PasswordResets() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function load(q: string) {
    apiGet<AccountsResponse>(`/it/accounts?q=${encodeURIComponent(q)}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load people"));
  }

  useEffect(() => {
    const t = window.setTimeout(() => load(query), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const selected = data?.people.find((p) => p.id === selectedId) ?? null;

  function replacePerson(person: AccountPerson) {
    setData((d) => (d ? { ...d, people: d.people.map((p) => (p.id === person.id ? person : p)) } : d));
  }

  return (
    <PageTransition routeKey="password-resets">
      <div>
        <DashboardHeader title="Password Resets" subtitle="Reset a person's company account passwords after confirming who they are." />
        <InfoBanner id="password-resets">
          People can reset their own passwords in the assistant with a code sent to their email. Use this page when they
          can't: they're locked out of the HelpDesk, the code didn't work, or they have no personal email for an Email reset.
          Always confirm it's really them first, for example on a video call.
        </InfoBanner>

        <div style={{ position: "relative", maxWidth: 420, marginBottom: "var(--space-4)" }}>
          <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: 14, color: "var(--text-muted)" }} />
          <input
            type="search"
            aria-label="Search people by name or email"
            placeholder="Search by name or email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ ...inputStyle, width: "100%", minHeight: 44, paddingLeft: 36, fontSize: "1rem" }}
          />
        </div>

        {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "0.875rem" }}>{error}</p>}

        <div style={{ display: "grid", gridTemplateColumns: selected ? "repeat(auto-fit, minmax(min(360px, 100%), 1fr))" : "1fr", gap: "var(--space-5)", alignItems: "start" }}>
          <Panel style={{ padding: 0, overflow: "hidden" }}>
            {!data ? (
              <p style={{ fontSize: "0.875rem", padding: "var(--space-5)" }}>Loading...</p>
            ) : data.people.length === 0 ? (
              <p style={{ fontSize: "0.875rem", padding: "var(--space-5)" }}>Nobody matches “{query}”.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="People">
                {data.people.map((p) => {
                  const needsChange = p.accounts.filter((a) => a.must_change_password).length;
                  return (
                    <li key={p.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        aria-pressed={p.id === selectedId}
                        style={{
                          width: "100%", textAlign: "left", padding: "var(--space-3) var(--space-4)", border: "none",
                          background: p.id === selectedId ? "var(--brand-tint)" : "transparent",
                          color: "var(--text-primary)", cursor: "pointer", display: "flex", justifyContent: "space-between",
                          gap: "var(--space-3)", alignItems: "center", fontFamily: "var(--font-body)",
                        }}
                      >
                        <span>
                          <strong style={{ fontSize: "0.9375rem" }}>{p.name}</strong>
                          <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                            {p.email} · {ROLE_LABEL[p.role] ?? p.role}, {p.department}
                          </span>
                        </span>
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {p.reset_blocked && <Badge label="Reset blocked" tone="danger" />}
                          {needsChange > 0 && <Badge label="Temporary password" tone="warning" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {selected && data && (
            <PersonPanel key={selected.id} person={selected} systems={data.systems} onChanged={replacePerson} onClose={() => setSelectedId(null)} />
          )}
        </div>
      </div>
    </PageTransition>
  );
}

function PersonPanel({
  person, systems, onChanged, onClose,
}: {
  person: AccountPerson;
  systems: AccountsResponse["systems"];
  onChanged: (p: AccountPerson) => void;
  onClose: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const isMe = me?.id === person.id;
  const [system, setSystem] = useState<CompanySystem>("windows");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<{ password: string; account: string; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [personalEmail, setPersonalEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstName = person.name.split(" ")[0];

  async function reset() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiPost<AccountResetResponse>(`/it/accounts/${person.id}/temporary-password`, {
        system, identity_confirmed: confirmed, note: note.trim() || null,
      });
      setIssued({
        password: res.temporary_password, account: res.account,
        expires: new Date(res.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      setCopied(false);
      setConfirmed(false);
      setNote("");
      onChanged(res.person);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset the password");
    } finally {
      setSaving(false);
    }
  }

  /** Saves the typed personal email, or removes it when `value` is null. */
  async function savePersonalEmail(value: string | null = personalEmail.trim() || null) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiPut<{ person: AccountPerson }>(`/it/accounts/${person.id}/personal-email`, {
        personal_email: value,
      });
      onChanged(res.person);
      setPersonalEmail("");
      setMessage(value ? "Personal email saved." : "Personal email removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the personal email");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Panel aria-label={`Accounts for ${person.name}`} style={{ padding: "var(--space-5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: "1.0625rem" }}>{person.name}</h2>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: 2 }}>{person.email}</p>
        </div>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>

      {person.reset_blocked && (
        <p style={{ fontSize: "0.875rem", marginTop: "var(--space-3)", color: "var(--danger)", fontWeight: 600 }}>
          Self-service reset is blocked after 3 wrong codes{person.blocked_ticket ? ` (ticket ${person.blocked_ticket})` : ""}.
          Resetting a password here lifts the block.
        </p>
      )}

      <h3 style={{ fontSize: "0.9375rem", margin: "var(--space-4) 0 var(--space-2)" }}>Accounts</h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)", fontSize: "0.875rem" }}>
        {person.accounts.map((a) => (
          <li key={a.system} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "center" }}>
            <span>
              {a.label}
              {a.system === "windows" && <span style={{ color: "var(--text-muted)" }}> (also HelpDesk sign-in)</span>}
            </span>
            {a.must_change_password ? (
              <Badge
                label={a.temp_password_expires_at && new Date(a.temp_password_expires_at) < new Date() ? "Temporary password expired" : "Temporary password"}
                tone="warning"
              />
            ) : (
              <span style={{ color: "var(--text-muted)" }}>Normal</span>
            )}
          </li>
        ))}
      </ul>

      <h3 style={{ fontSize: "0.9375rem", margin: "var(--space-5) 0 var(--space-2)" }}>Reset a password</h3>
      {isMe ? (
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
          You can't reset your own passwords here. Ask the assistant (“I forgot my password”), like everyone else.
        </p>
      ) : issued ? (
        <div style={{ fontSize: "0.875rem" }}>
          <p style={{ margin: 0 }}>
            Temporary {issued.account} password for {firstName}:{" "}
            <code style={{ fontSize: "1rem", fontWeight: 700 }}>{issued.password}</code>
          </p>
          <p style={{ margin: "var(--space-2) 0 0", color: "var(--text-muted)" }}>
            Shown only once. It works until {issued.expires} (15 minutes), and {firstName} must choose a new password when they
            sign in. Give it to them directly, never by email or chat.
          </p>
          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
            <Button variant="ghost" onClick={copy}>{copied ? "Copied" : "Copy password"}</Button>
            <Button variant="ghost" onClick={() => setIssued(null)}>Reset another account</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)", fontSize: "0.875rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontWeight: 600 }}>
            Account
            <select value={system} onChange={(e) => setSystem(e.target.value as CompanySystem)} style={inputStyle}>
              {systems.map((s) => (
                <option key={s.system} value={s.system}>{s.label}{s.system === "windows" ? " (also HelpDesk sign-in)" : ""}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontWeight: 600 }}>
            Note for the audit log (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="e.g. Verified on a video call"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I've confirmed this is really {person.name}
          </label>
          <Button
            variant="primary"
            disabled={!confirmed || saving}
            onClick={reset}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, justifySelf: "start" }}
          >
            <KeyRound size={16} aria-hidden="true" /> Issue temporary password
          </Button>
        </div>
      )}

      <h3 style={{ fontSize: "0.9375rem", margin: "var(--space-5) 0 var(--space-2)" }}>Personal email</h3>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>
        Where the reset code goes when {firstName} forgets their work email password.{" "}
        {person.personal_email ? <>On file: <strong>{person.personal_email}</strong>.</> : <>None on file yet.</>}
      </p>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <TextField
            label={person.personal_email ? "Replace with" : "Add a personal email"}
            type="email"
            value={personalEmail}
            onChange={(e) => setPersonalEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <Button variant="ghost" disabled={saving || !personalEmail.trim()} onClick={() => savePersonalEmail()}>Save</Button>
        {person.personal_email && (
          <Button variant="ghost" disabled={saving} onClick={() => savePersonalEmail(null)}>
            Remove
          </Button>
        )}
      </div>

      {message && <p role="status" style={{ fontSize: "0.8125rem", color: "var(--accent-primary)", marginTop: "var(--space-3)" }}>{message}</p>}
      {error && <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--danger)", marginTop: "var(--space-3)" }}>{error}</p>}
    </Panel>
  );
}
