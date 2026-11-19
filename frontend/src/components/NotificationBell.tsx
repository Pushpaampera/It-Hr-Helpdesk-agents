/** The notification bell in the dashboard top bar, for every role. It shows the signed-in
 * person's own notifications: leave and access decisions, new requests waiting for them, and
 * private HR case messages (both ways). Clicking one marks it read and, if it has a link, opens
 * that exact page (an HR case opens straight into its conversation).
 *
 * Checks for new notifications every 20 seconds and whenever the tab regains focus. A polite
 * live region announces new arrivals to screen-reader users. Keyboard: the button reports
 * open/closed, Esc closes the panel and returns focus to the button.
 *
 * Every notification appears here. Email is the person's choice (bottom of the panel): important
 * updates only (default), everything, or never. */
import { Bell, Mail, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiGet, apiPost, apiPut } from "../api/client";
import type { AppNotification, EmailPreference, NotificationList, NotificationPreferences } from "../api/types";

const POLL_MS = 20_000;

const EMAIL_CHOICES: { value: EmailPreference; label: string; hint: string }[] = [
  { value: "important", label: "Important only", hint: "Decisions on your requests, replies to you, urgent cases" },
  { value: "all", label: "Everything", hint: "Every notification is also emailed" },
  { value: "off", label: "Never", hint: "Only show them here" },
];

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationList | null>(null);
  const [error, setError] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsSaved, setPrefsSaved] = useState("");
  const lastUnread = useRef<number | null>(null);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    apiGet<NotificationList>("/notifications")
      .then((d) => {
        setData(d);
        setError(false);
        if (lastUnread.current !== null && d.unread_count > lastUnread.current) {
          const fresh = d.items.find((n) => !n.read);
          setAnnouncement(fresh ? `New notification: ${fresh.title}` : "You have a new notification");
        }
        lastUnread.current = d.unread_count;
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
      load();
      apiGet<NotificationPreferences>("/notifications/preferences").then(setPrefs).catch(() => setPrefs(null));
    }
  }, [open, load]);

  async function changeEmailPreference(value: EmailPreference) {
    const previous = prefs;
    setPrefs((p) => p && { ...p, email: value });
    setPrefsSaved("");
    try {
      setPrefs(await apiPut<NotificationPreferences>("/notifications/preferences", { email: value }));
      setPrefsSaved("Saved");
    } catch {
      setPrefs(previous);
      setPrefsSaved("Couldn't save. Please try again.");
    }
  }

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

  async function openNotification(n: AppNotification) {
    if (!n.read) {
      setData((d) => d && {
        unread_count: Math.max(0, d.unread_count - 1),
        items: d.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      });
      lastUnread.current = Math.max(0, (lastUnread.current ?? 1) - 1);
      apiPost(`/notifications/${n.id}/read`).catch(() => undefined);
    }
    if (n.link) {
      setOpen(false);
      // The extra n= makes the page reload the case even if it's already open.
      navigate(`${n.link}${n.link.includes("?") ? "&" : "?"}n=${n.id}`);
    }
  }

  async function markAllRead() {
    setData((d) => d && { unread_count: 0, items: d.items.map((x) => ({ ...x, read: true })) });
    lastUnread.current = 0;
    await apiPost("/notifications/read-all").catch(() => undefined);
  }

  const unread = data?.unread_count ?? 0;
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div style={{ position: "relative" }}>
      <span aria-live="polite" style={srOnly}>{announcement}</span>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        style={{
          position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 48, height: 48, padding: 0, borderRadius: "50%", flexShrink: 0,
          border: "2px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)",
        }}
      >
        <Bell size={22} aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute", top: -4, right: -4, minWidth: 22, height: 22, padding: "0 6px",
              borderRadius: 11, background: "var(--accent-primary)", color: "var(--text-on-accent)",
              border: "2px solid var(--bg-elevated)", fontSize: "0.75rem", fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 150,
            width: "min(400px, calc(100vw - 32px))", maxHeight: "75vh", display: "flex", flexDirection: "column",
            borderRadius: "var(--radius-lg)", background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
            boxShadow: "var(--shadow-panel-lift)", textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-3) var(--space-3) var(--space-3) var(--space-5)", borderBottom: "1px solid var(--border-subtle)" }}>
            <h2 style={{ fontSize: "1.0625rem", flex: 1 }}>Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{ minHeight: 44, padding: "0 var(--space-3)", border: "none", background: "transparent", color: "var(--accent-primary)", fontWeight: 600, fontSize: "0.875rem", textDecoration: "underline", borderRadius: "var(--radius-md)" }}
              >
                Mark all as read
              </button>
            )}
            <button
              ref={closeRef}
              type="button"
              aria-label="Close notifications"
              onClick={() => { setOpen(false); buttonRef.current?.focus(); }}
              style={{ width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: "var(--text-secondary)", borderRadius: "var(--radius-md)" }}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div style={{ overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
            {error && !data && <p role="alert" style={{ padding: "var(--space-5)", color: "var(--danger)", fontSize: "0.875rem" }}>Couldn't load notifications. Please try again.</p>}
            {!error && !data && <p style={{ padding: "var(--space-5)", fontSize: "0.875rem", color: "var(--text-muted)" }}>Loading…</p>}
            {data && data.items.length === 0 && (
              <p style={{ padding: "var(--space-5)", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                You're all caught up. Updates on your requests and messages will appear here.
              </p>
            )}
            {data && data.items.length > 0 && (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {data.items.map((n) => (
                  <li key={n.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      style={{
                        width: "100%", textAlign: "left", display: "flex", gap: "var(--space-3)",
                        padding: "var(--space-3) var(--space-5)", border: "none", cursor: n.link || !n.read ? "pointer" : "default",
                        background: n.read ? "transparent" : "var(--brand-soft)", color: "var(--text-primary)",
                        borderLeft: `4px solid ${n.read ? "transparent" : "var(--accent-primary)"}`,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: n.read ? 600 : 700, fontSize: "0.9375rem" }}>
                          {!n.read && <span style={srOnly}>Unread: </span>}
                          {n.title}
                        </span>
                        {n.body && <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{n.body}</span>}
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {timeAgo(n.created_at)}
                          {n.email_status === "sent" && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              · <Mail size={12} aria-hidden="true" /> Also sent by email
                            </span>
                          )}
                          {n.link && <span>· Click to open</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {prefs && (
            <fieldset style={{ border: "none", margin: 0, padding: "var(--space-3) var(--space-5) var(--space-4)", borderTop: "1px solid var(--border-subtle)" }}>
              <legend style={{ float: "left", width: "100%", padding: 0, marginBottom: "var(--space-2)", fontSize: "0.875rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                <Mail size={14} aria-hidden="true" /> Also email me
                <span aria-live="polite" style={{ marginLeft: "auto", fontWeight: 600, fontSize: "0.75rem", color: prefsSaved === "Saved" ? "var(--text-muted)" : "var(--danger)" }}>{prefsSaved}</span>
              </legend>
              <div style={{ clear: "both", display: "grid", gap: 2 }}>
                {EMAIL_CHOICES.map((c) => (
                  <label key={c.value} style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", minHeight: 44, padding: "6px 0", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="email-preference"
                      value={c.value}
                      checked={prefs.email === c.value}
                      onChange={() => changeEmailPreference(c.value)}
                      style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--accent-primary)", flexShrink: 0 }}
                    />
                    <span style={{ display: "grid" }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{c.label}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {!prefs.email_available && (
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-1)" }}>
                  Email isn't set up on this site yet, so for now you'll only see notifications here.
                </p>
              )}
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}

const srOnly: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden",
  clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0,
};
