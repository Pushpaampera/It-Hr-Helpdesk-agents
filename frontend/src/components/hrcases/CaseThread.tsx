/** The private conversation on one HR case — used by the employee ("Talk to HR") and by HR
 * ("Private Cases"). System lines (status changes, assignments) are shown as quiet centred notes;
 * the viewer's own messages sit on the right. The reply box is a labelled textarea; Enter adds a
 * new line here (long, careful messages), the Send button sends. */
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { HrCaseMessage } from "../../api/types";
import Button from "../ui/Button";
import { formatDateTime } from "./caseMeta";

type Props = {
  messages: HrCaseMessage[];
  closed: boolean;
  replyLabel: string;
  replyHint?: string;
  onSend: (body: string) => Promise<void>;
};

export default function CaseThread({ messages, closed, replyLabel, replyHint, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <ol
        aria-label="Case conversation"
        style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-3)", maxHeight: 420, overflowY: "auto" }}
      >
        {messages.map((m) =>
          m.author_role === "system" ? (
            <li key={m.id} style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              {m.body} <span aria-hidden="true">·</span> {formatDateTime(m.created_at)}
            </li>
          ) : (
            <li key={m.id} style={{ display: "flex", justifyContent: m.is_mine ? "flex-end" : "flex-start" }}>
              <div
                style={{
                  maxWidth: "85%", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)",
                  background: m.is_mine ? "var(--accent-primary)" : "var(--bg-elevated)",
                  color: m.is_mine ? "var(--text-on-accent)" : "var(--text-primary)",
                  border: m.is_mine ? "none" : "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: 4, opacity: 0.9 }}>
                  {m.is_mine ? "You" : m.author_name} · {formatDateTime(m.created_at)}
                </div>
                <div style={{ fontSize: "0.875rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{m.body}</div>
              </div>
            </li>
          ),
        )}
        <li ref={endRef} aria-hidden="true" />
      </ol>

      {closed ? (
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>This case is closed, so replies are turned off.</p>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          <label htmlFor="case-reply" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
            {replyLabel}
          </label>
          {replyHint && (
            <p id="case-reply-hint" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              {replyHint}
            </p>
          )}
          <textarea
            id="case-reply"
            aria-describedby={replyHint ? "case-reply-hint" : undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            style={{
              fontFamily: "var(--font-body)", fontSize: "0.9375rem", padding: "var(--space-3)",
              borderRadius: "var(--radius-md)", border: "2px solid var(--border-strong)",
              background: "var(--bg-elevated)", color: "var(--text-primary)", resize: "vertical",
            }}
          />
          {error && (
            <p role="alert" style={{ fontSize: "0.875rem", color: "var(--danger)", fontWeight: 600 }}>
              {error}
            </p>
          )}
          <div>
            <Button onClick={send} disabled={sending || !draft.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Send size={16} aria-hidden="true" /> {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
