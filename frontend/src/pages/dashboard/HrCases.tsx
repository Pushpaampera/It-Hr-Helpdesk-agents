/** "Private Cases": HR's confidential queue — complaints, colleague conflicts, harassment,
 * discrimination, manager concerns, misconduct, personal/wellbeing and safety matters raised by
 * employees on the "Talk to HR" page.
 *
 * HR only. IT support and admins are refused by the backend (403 on the list, 404 on any case);
 * the page also says so instead of showing an empty table. Urgent and "waiting for HR" cases sort
 * to the top. HR can reply privately, pick a case up ("Assign to me"), ask the employee for more
 * information, and resolve or close it with an outcome the employee can read. */
import { AlertTriangle, Lock, Mail, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiGet, apiPatch, apiPost } from "../../api/client";
import type { HrCase, HrCaseDetail, HrCaseStatus } from "../../api/types";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import CaseThread from "../../components/hrcases/CaseThread";
import {
  CATEGORY_LABEL, CONTACT_LABEL, STATUS_OPTIONS, formatDate, formatDateTime, needsHrReply, statusTone,
} from "../../components/hrcases/caseMeta";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import InfoBanner from "../../components/ui/InfoBanner";
import Panel from "../../components/ui/Panel";
import PageTransition from "../../design/pageTransition";
import { useAuthStore } from "../../store/authStore";

type Filter = "open" | "all" | HrCaseStatus;
const OPEN_STATUSES: HrCaseStatus[] = ["received", "in_review", "waiting_on_employee"];
const hintStyle = { fontSize: "0.8125rem", color: "var(--text-muted)" } as const;

export default function HrCases() {
  const user = useAuthStore((s) => s.user);
  const [cases, setCases] = useState<HrCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A notification links here as ?case=<id>&n=<notification id>: open that case (and reload it,
  // even if it's already open, since the notification means something new happened).
  const [searchParams] = useSearchParams();
  const linkedCase = searchParams.get("case");
  const linkTick = searchParams.get("n");

  function load() {
    apiGet<HrCase[]>("/hr-cases")
      .then((c) => {
        setCases(c);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load cases"));
  }

  useEffect(() => {
    if (user?.role === "hr") load();
  }, [user?.role]);

  useEffect(() => {
    if (!linkedCase || user?.role !== "hr") return;
    setSelectedId(linkedCase);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedCase, linkTick]);

  if (user?.role !== "hr") {
    return (
      <Panel style={{ padding: "var(--space-6)", display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
        <Lock size={20} aria-hidden="true" color="var(--accent-primary)" />
        <p>Private HR cases can only be seen by the HR team.</p>
      </Panel>
    );
  }

  const visible = (cases ?? []).filter((c) =>
    filter === "all" ? true : filter === "open" ? OPEN_STATUSES.includes(c.status) : c.status === filter,
  );
  const counts = {
    urgent: (cases ?? []).filter((c) => c.urgency === "urgent" && OPEN_STATUSES.includes(c.status)).length,
    needsReply: (cases ?? []).filter(needsHrReply).length,
    open: (cases ?? []).filter((c) => OPEN_STATUSES.includes(c.status)).length,
    resolved: (cases ?? []).filter((c) => c.status === "resolved" || c.status === "closed").length,
  };

  return (
    <PageTransition routeKey="hr-cases">
      <div>
        <DashboardHeader title="Private Cases" subtitle="Confidential matters raised by employees. Visible to the HR team only." />
        <InfoBanner id="hr-cases">
          Complaints, conflicts between colleagues, harassment, discrimination, concerns about managers and personal
          matters land here, never in the normal ticket list. IT support and admins can't see this page or these cases.
        </InfoBanner>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
          <Stat label="Urgent and open" value={counts.urgent} emphasis={counts.urgent > 0} />
          <Stat label="Waiting for HR" value={counts.needsReply} emphasis={counts.needsReply > 0} />
          <Stat label="Open cases" value={counts.open} />
          <Stat label="Resolved or closed" value={counts.resolved} />
        </div>

        <div role="group" aria-label="Filter cases" style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
          <Chip label="Open" active={filter === "open"} onClick={() => setFilter("open")} />
          {STATUS_OPTIONS.map((s) => (
            <Chip key={s.value} label={s.label} active={filter === s.value} onClick={() => setFilter(s.value)} />
          ))}
          <Chip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: selectedId ? "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" : "1fr", gap: "var(--space-5)", alignItems: "start" }}>
          <Panel style={{ padding: 0, overflow: "hidden" }}>
            {error && <p role="alert" style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</p>}
            {!cases && !error && <p style={{ padding: "var(--space-5)" }}>Loading…</p>}
            {cases && visible.length === 0 && <p style={{ padding: "var(--space-5)", fontSize: "0.875rem" }}>No cases match this filter.</p>}
            {visible.length > 0 && (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {visible.map((c) => (
                  <li key={c.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                      aria-expanded={selectedId === c.id}
                      aria-label={`Case ${c.number}: ${c.subject}`}
                      style={{
                        width: "100%", textAlign: "left", display: "grid", gap: 4, padding: "var(--space-4) var(--space-5)",
                        background: selectedId === c.id ? "var(--bg-elevated)" : "transparent", border: "none",
                        borderLeft: `4px solid ${selectedId === c.id ? "var(--accent-primary)" : "transparent"}`,
                        cursor: "pointer", fontFamily: "var(--font-body)", color: "var(--text-primary)",
                      }}
                    >
                      <span style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: "0.9375rem" }}>{c.subject}</strong>
                        {c.urgency === "urgent" && OPEN_STATUSES.includes(c.status) && <Badge label="Urgent" tone="danger" />}
                        {needsHrReply(c) && <Badge label="Waiting for HR" tone="warning" />}
                      </span>
                      <span style={hintStyle}>
                        {c.number} · {CATEGORY_LABEL[c.category]} · {c.reporter_name} · {formatDate(c.created_at)}
                      </span>
                      <span style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                        <Badge label={STATUS_OPTIONS.find((s) => s.value === c.status)?.label ?? c.status} tone={statusTone(c.status)} />
                        <span style={hintStyle}>{c.assigned_hr_name ? `Handled by ${c.assigned_hr_name}` : "Not picked up yet"}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {selectedId && <CaseDetailPanel key={`${selectedId}-${linkTick ?? ""}`} caseId={selectedId} onChanged={load} onClose={() => setSelectedId(null)} />}
        </div>
      </div>
    </PageTransition>
  );
}

function CaseDetailPanel({ caseId, onChanged, onClose }: { caseId: string; onChanged: () => void; onClose: () => void }) {
  const [detail, setDetail] = useState<HrCaseDetail | null>(null);
  const [statusDraft, setStatusDraft] = useState<HrCaseStatus>("received");
  const [noteDraft, setNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply(d: HrCaseDetail) {
    setDetail(d);
    setStatusDraft(d.case.status);
    setNoteDraft(d.case.resolution_note ?? "");
  }

  useEffect(() => {
    setDetail(null);
    apiGet<HrCaseDetail>(`/hr-cases/${caseId}`).then(apply).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load case"));
  }, [caseId]);

  async function update(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      apply(await apiPatch<HrCaseDetail>(`/hr-cases/${caseId}`, body));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the case");
    } finally {
      setSaving(false);
    }
  }

  if (error && !detail) return <Panel style={{ padding: "var(--space-5)", color: "var(--danger)" }}>{error}</Panel>;
  if (!detail) return <Panel style={{ padding: "var(--space-5)" }}>Loading case…</Panel>;
  const c = detail.case;
  const needsNote = statusDraft === "resolved" && !noteDraft.trim();

  return (
    <Panel style={{ padding: "var(--space-5)", display: "grid", gap: "var(--space-4)" }} aria-label={`Case ${c.number}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: "1.125rem" }}>{c.subject}</h2>
          <p style={hintStyle}>{c.number} · {CATEGORY_LABEL[c.category]} · raised {formatDateTime(c.created_at)}</p>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Close case details" style={{ padding: "0 var(--space-3)" }}>Close</Button>
      </div>

      {c.urgency === "urgent" && (
        <p style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 700, color: "var(--danger)", fontSize: "0.875rem" }}>
          <AlertTriangle size={16} aria-hidden="true" /> Marked urgent. Please respond today.
        </p>
      )}

      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "var(--space-2) var(--space-4)", fontSize: "0.875rem", margin: 0 }}>
        <dt style={{ fontWeight: 600 }}>Raised by</dt>
        <dd style={{ margin: 0 }}>
          {c.reporter_name}
          {c.reporter_department ? ` · ${c.reporter_department}` : ""}
          {c.reporter_email && (
            <> · <a href={`mailto:${c.reporter_email}?subject=${encodeURIComponent(`Your HR case ${c.number}`)}`}><Mail size={12} aria-hidden="true" /> {c.reporter_email}</a></>
          )}
        </dd>
        <dt style={{ fontWeight: 600 }}>Wants to be contacted by</dt>
        <dd style={{ margin: 0 }}>{CONTACT_LABEL[c.preferred_contact]}</dd>
        {c.people_involved && (<><dt style={{ fontWeight: 600 }}>People involved</dt><dd style={{ margin: 0 }}>{c.people_involved}</dd></>)}
        {c.incident_date && (<><dt style={{ fontWeight: 600 }}>When it happened</dt><dd style={{ margin: 0 }}>{formatDate(c.incident_date)}</dd></>)}
        <dt style={{ fontWeight: 600 }}>Handled by</dt>
        <dd style={{ margin: 0 }}>{c.assigned_hr_name ?? "Nobody yet"}</dd>
      </dl>
      {c.anonymous && <p style={hintStyle}><Lock size={12} aria-hidden="true" /> The employee chose to stay anonymous. Reply here; you can't contact them directly.</p>}

      <div>
        <h3 style={{ fontSize: "0.9375rem", marginBottom: "var(--space-2)" }}>What the employee told HR</h3>
        <p style={{ fontSize: "0.9375rem", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{c.description}</p>
      </div>

      <section aria-label="Case actions" style={{ display: "grid", gap: "var(--space-3)", padding: "var(--space-4)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
        {!c.assigned_hr_name && (
          <div>
            <Button variant="ghost" onClick={() => update({ assign_to_me: true })} disabled={saving} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <UserCheck size={16} aria-hidden="true" /> Assign to me
            </Button>
          </div>
        )}
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          <label htmlFor="case-status" style={{ fontSize: "0.875rem", fontWeight: 600 }}>Status</label>
          <select
            id="case-status"
            value={statusDraft}
            onChange={(e) => setStatusDraft(e.target.value as HrCaseStatus)}
            style={{ fontFamily: "var(--font-body)", fontSize: "1rem", minHeight: 44, padding: "0 var(--space-3)", borderRadius: "var(--radius-md)", border: "2px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}
          >
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        {(statusDraft === "resolved" || statusDraft === "closed" || c.resolution_note) && (
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            <label htmlFor="case-outcome" style={{ fontSize: "0.875rem", fontWeight: 600 }}>Outcome (the employee can read this)</label>
            <textarea
              id="case-outcome"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={3}
              maxLength={2000}
              aria-describedby={needsNote ? "case-outcome-hint" : undefined}
              style={{ fontFamily: "var(--font-body)", fontSize: "0.9375rem", padding: "var(--space-3)", borderRadius: "var(--radius-md)", border: "2px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", resize: "vertical" }}
            />
            {needsNote && <span id="case-outcome-hint" style={hintStyle}>Add a short outcome before marking it resolved.</span>}
          </div>
        )}
        {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "0.875rem", fontWeight: 600 }}>{error}</p>}
        <div>
          <Button
            onClick={() => update({ status: statusDraft, resolution_note: noteDraft })}
            disabled={saving || needsNote || (statusDraft === c.status && (noteDraft || "") === (c.resolution_note || ""))}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </section>

      <div>
        <h3 style={{ fontSize: "0.9375rem", marginBottom: "var(--space-3)" }}>Private conversation with the employee</h3>
        <CaseThread
          messages={detail.messages}
          closed={c.status === "closed"}
          replyLabel="Reply to the employee"
          replyHint="Only the employee and the HR team can read this."
          onSend={async (body) => {
            apply(await apiPost<HrCaseDetail>(`/hr-cases/${caseId}/messages`, { body }));
            onChanged();
          }}
        />
      </div>
    </Panel>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <Panel style={{ padding: "var(--space-4)", borderTop: `3px solid ${emphasis ? "var(--accent-primary)" : "var(--border-subtle)"}` }}>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color: emphasis ? "var(--accent-primary)" : "var(--text-primary)" }}>{value}</div>
      <div style={hintStyle}>{label}</div>
    </Panel>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontSize: "0.875rem", fontWeight: 600, fontFamily: "var(--font-body)", padding: "0 var(--space-4)", minHeight: 44,
        borderRadius: "var(--radius-full)", cursor: "pointer",
        border: `2px solid ${active ? "var(--accent-primary)" : "var(--border-strong)"}`,
        background: active ? "var(--accent-primary)" : "var(--bg-elevated)",
        color: active ? "var(--text-on-accent)" : "var(--text-primary)",
      }}
    >
      {label}
    </button>
  );
}
