/** "Talk to HR": the private, confidential channel to the HR team, for every signed-in person.
 *
 * For anything that shouldn't go through the AI assistant: complaints about someone, fights or
 * conflict with colleagues, concerns about a manager, harassment, discrimination, misconduct,
 * personal or wellbeing matters and safety worries. Three ways in:
 *   1. HR's direct contact details (email/phone/hours), with no form at all;
 *   2. a private case form (optionally anonymous);
 *   3. the person's own cases, with a private two-way conversation with HR.
 *
 * Only the person and HR can see a case; IT support and admins can't (enforced by the backend,
 * app/routers/hr_cases.py). The chat's redirect card opens this page with the person's message
 * pre-filled via router state, which is never put in the URL or browser history. */
import { AlertTriangle, CheckCircle2, Clock, Lock, Mail, Phone, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { apiGet, apiPost } from "../../api/client";
import type { HrCase, HrCaseCategory, HrCaseDetail, HrContact } from "../../api/types";
import DashboardHeader from "../../components/dashboard/DashboardHeader";
import CaseThread from "../../components/hrcases/CaseThread";
import { CATEGORY_LABEL, CATEGORY_OPTIONS, CONTACT_LABEL, formatDate, statusTone } from "../../components/hrcases/caseMeta";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import TextField from "../../components/ui/TextField";
import PageTransition from "../../design/pageTransition";
import { useAuthStore } from "../../store/authStore";

export type TalkToHrPrefill = { category?: HrCaseCategory; urgent?: boolean; text?: string };

const fieldStyle = {
  fontFamily: "var(--font-body)", fontSize: "1rem", minHeight: 44, padding: "var(--space-2) var(--space-4)",
  borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "2px solid var(--border-strong)",
  color: "var(--text-primary)",
} as const;
const labelStyle = { fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" } as const;
const hintStyle = { fontSize: "0.8125rem", color: "var(--text-muted)" } as const;

/** Employees and IT support. HR users handle cases rather than raise them, so they're sent to
 * their Private Cases inbox; admins don't use this page, so they go back to the Overview. */
export default function TalkToHr() {
  const role = useAuthStore((s) => s.user?.role);
  if (role === "hr") return <Navigate to="/app/hr-cases" replace />;
  if (role === "admin") return <Navigate to="/app/overview" replace />;
  return <TalkToHrPage />;
}

function TalkToHrPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefill = (location.state as { prefill?: TalkToHrPrefill } | null)?.prefill;

  const [contact, setContact] = useState<HrContact | null>(null);
  const [cases, setCases] = useState<HrCase[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HrCaseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  // A notification links here as ?case=<id>&n=<notification id>: open that case and reload it.
  const [searchParams] = useSearchParams();
  const linkedCase = searchParams.get("case");
  const linkTick = searchParams.get("n");

  function loadCases(selectAfter?: string) {
    apiGet<HrCase[]>("/hr-cases/mine")
      .then((c) => {
        setCases(c);
        if (selectAfter) setSelectedId(selectAfter);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load your cases"));
  }

  useEffect(() => {
    apiGet<HrContact>("/hr-cases/contact").then(setContact).catch(() => setContact(null));
    loadCases();
    // Drop the prefill from history state once read, so a refresh doesn't re-fill the form.
    if (prefill) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!linkedCase) return;
    loadCases(linkedCase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedCase, linkTick]);

  useEffect(() => {
    if (!selectedId) return setDetail(null);
    apiGet<HrCaseDetail>(`/hr-cases/${selectedId}`).then(setDetail).catch(() => setDetail(null));
  }, [selectedId, linkTick]);

  return (
    <PageTransition routeKey="talk-to-hr">
      <div>
        <DashboardHeader title="Talk to HR" subtitle="Private and confidential. Only the HR team can see what you share here." />

        <PrivacyNotice />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: "var(--space-5)", alignItems: "start" }}>
          <div style={{ display: "grid", gap: "var(--space-5)" }}>
            <ContactCard contact={contact} />
            <NewCaseForm
              prefill={prefill}
              onCreated={(c) => {
                setJustCreated(c.number);
                loadCases(c.id);
              }}
            />
          </div>

          <div style={{ display: "grid", gap: "var(--space-5)" }}>
            {justCreated && (
              <div role="status" style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start", padding: "var(--space-4)", borderRadius: "var(--radius-md)", border: "2px solid var(--accent-primary)", background: "var(--bg-elevated)" }}>
                <CheckCircle2 size={20} color="var(--accent-primary)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: "0.9375rem" }}>
                  <strong>Case {justCreated} has been sent to HR.</strong> Only the HR team can read it. They'll reply here, and you'll see updates below.
                </p>
              </div>
            )}

            <Panel style={{ padding: "var(--space-5)" }}>
              <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-3)" }}>Your private cases</h2>
              {loadError && <p role="alert" style={{ color: "var(--danger)", fontSize: "0.875rem" }}>{loadError}</p>}
              {!cases && !loadError && <p style={hintStyle}>Loading…</p>}
              {cases && cases.length === 0 && <p style={hintStyle}>You haven't raised any cases. Anything you raise will appear here.</p>}
              {cases && cases.length > 0 && (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}>
                  {cases.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                        aria-expanded={selectedId === c.id}
                        style={{
                          width: "100%", textAlign: "left", display: "flex", gap: "var(--space-3)", alignItems: "center",
                          padding: "var(--space-3) var(--space-4)", minHeight: 44, cursor: "pointer", fontFamily: "var(--font-body)",
                          borderRadius: "var(--radius-md)", color: "var(--text-primary)",
                          border: `2px solid ${selectedId === c.id ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                          background: "var(--bg-elevated)",
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontWeight: 700, fontSize: "0.9375rem" }}>{c.subject}</span>
                          <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                            {c.number} · {CATEGORY_LABEL[c.category]} · {formatDate(c.created_at)}
                            {c.anonymous ? " · Anonymous" : ""}
                          </span>
                        </span>
                        <Badge label={c.status === "waiting_on_employee" ? "HR needs your reply" : c.status_label} tone={statusTone(c.status)} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {detail && (
              <Panel style={{ padding: "var(--space-5)" }} aria-label={`Case ${detail.case.number}`}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
                  <div>
                    <h2 style={{ fontSize: "1.125rem" }}>{detail.case.subject}</h2>
                    <p style={hintStyle}>
                      {detail.case.number} · {CATEGORY_LABEL[detail.case.category]}
                      {detail.case.assigned_hr_name ? ` · Handled by ${detail.case.assigned_hr_name}` : " · Waiting for an HR person to pick it up"}
                    </p>
                  </div>
                  <Badge label={detail.case.status_label} tone={statusTone(detail.case.status)} />
                </div>
                {detail.case.anonymous && (
                  <p style={{ ...hintStyle, marginBottom: "var(--space-3)" }}>
                    <Lock size={12} aria-hidden="true" /> You raised this anonymously: HR sees "Anonymous employee", not your name.
                  </p>
                )}
                <details style={{ marginBottom: "var(--space-4)" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.875rem", minHeight: 24 }}>What you told HR</summary>
                  <p style={{ fontSize: "0.875rem", whiteSpace: "pre-wrap", marginTop: "var(--space-2)" }}>{detail.case.description}</p>
                  {detail.case.people_involved && <p style={{ ...hintStyle, marginTop: "var(--space-2)" }}>People involved: {detail.case.people_involved}</p>}
                </details>
                {detail.case.resolution_note && (detail.case.status === "resolved" || detail.case.status === "closed") && (
                  <p style={{ fontSize: "0.875rem", marginBottom: "var(--space-4)" }}>
                    <strong>Outcome from HR:</strong> {detail.case.resolution_note}
                  </p>
                )}
                <CaseThread
                  messages={detail.messages}
                  closed={detail.case.status === "closed"}
                  replyLabel="Message HR"
                  replyHint={detail.case.status === "resolved" ? "Not happy with the outcome? Reply and HR will look at it again." : "Only the HR team can read this."}
                  onSend={async (body) => {
                    const updated = await apiPost<HrCaseDetail>(`/hr-cases/${detail.case.id}/messages`, { body });
                    setDetail(updated);
                    loadCases();
                  }}
                />
              </Panel>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

function PrivacyNotice() {
  return (
    <div
      style={{
        display: "flex", gap: "var(--space-3)", alignItems: "flex-start", padding: "var(--space-4) var(--space-5)",
        marginBottom: "var(--space-5)", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)", borderLeft: "4px solid var(--accent-primary)",
      }}
    >
      <ShieldCheck size={22} color="var(--accent-primary)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ display: "grid", gap: "var(--space-2)", fontSize: "0.9375rem" }}>
        <p>
          <strong>Who can see this:</strong> only the HR team. <strong>Your manager, IT support and admins cannot</strong>, even if the
          matter is about them. The AI assistant doesn't read or store it either.
        </p>
        <p>
          Use this for complaints about someone, problems or fights with colleagues, concerns about your manager,
          harassment, discrimination, wrongdoing, or anything personal you'd like HR's help with.
        </p>
        <p style={{ display: "flex", gap: 6, alignItems: "flex-start", fontWeight: 600 }}>
          <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
          If you or someone else is in immediate danger, call your local emergency number first.
        </p>
      </div>
    </div>
  );
}

function ContactCard({ contact }: { contact: HrContact | null }) {
  const row = { display: "flex", alignItems: "center", gap: "var(--space-3)", fontSize: "0.9375rem" } as const;
  return (
    <Panel style={{ padding: "var(--space-5)" }}>
      <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-1)" }}>Contact HR directly</h2>
      <p style={{ ...hintStyle, marginBottom: "var(--space-4)" }}>Prefer to talk to a person straight away? No form needed.</p>
      {!contact ? (
        <p style={hintStyle}>Loading…</p>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <div style={row}>
            <Mail size={18} color="var(--accent-primary)" aria-hidden="true" />
            <span>
              Email: <a href={`mailto:${contact.email}`} style={{ fontWeight: 700 }}>{contact.email}</a>
            </span>
          </div>
          {contact.phone && (
            <div style={row}>
              <Phone size={18} color="var(--accent-primary)" aria-hidden="true" />
              <span>
                Phone: <a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`} style={{ fontWeight: 700 }}>{contact.phone}</a>
              </span>
            </div>
          )}
          <div style={row}>
            <Clock size={18} color="var(--accent-primary)" aria-hidden="true" />
            <span>Hours: {contact.hours}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

function NewCaseForm({ prefill, onCreated }: { prefill?: TalkToHrPrefill; onCreated: (c: HrCase) => void }) {
  const [category, setCategory] = useState<HrCaseCategory | "">(prefill?.category ?? "");
  const [subject, setSubject] = useState(prefill?.category && prefill.category !== "other" ? CATEGORY_LABEL[prefill.category] : "");
  const [description, setDescription] = useState(prefill?.text ?? "");
  const [people, setPeople] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [urgent, setUrgent] = useState(!!prefill?.urgent);
  const [contactPref, setContactPref] = useState<HrCase["preferred_contact"]>("portal");
  const [anonymous, setAnonymous] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hint = useMemo(() => CATEGORY_OPTIONS.find((o) => o.value === category)?.hint, [category]);
  const isSafety = category === "safety";
  const today = new Date().toISOString().slice(0, 10);

  function validate() {
    const e: Record<string, string> = {};
    if (!category) e.category = "Choose what this is about.";
    if (subject.trim().length < 3) e.subject = "Give it a short title (at least 3 characters).";
    if (description.trim().length < 10) e.description = "Tell HR a little more (at least 10 characters).";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const created = await apiPost<HrCase>("/hr-cases", {
        category, subject: subject.trim(), description: description.trim(),
        people_involved: people.trim() || null, incident_date: incidentDate || null,
        urgency: urgent || isSafety ? "urgent" : "normal", preferred_contact: contactPref, anonymous,
      });
      setCategory(""); setSubject(""); setDescription(""); setPeople(""); setIncidentDate("");
      setUrgent(false); setContactPref("portal"); setAnonymous(false); setErrors({});
      onCreated(created);
    } catch (e) {
      setSubmitError(e instanceof Error && typeof e.message === "string" ? e.message : "Couldn't send your case. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel style={{ padding: "var(--space-5)" }}>
      <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-1)" }}>Raise a private case</h2>
      <p style={{ ...hintStyle, marginBottom: "var(--space-4)" }}>
        Fields marked * are required. Share only what you're comfortable with; HR can ask follow-up questions privately.
      </p>
      {prefill?.text && (
        <p style={{ fontSize: "0.875rem", marginBottom: "var(--space-4)" }}>
          We've copied what you typed in the chat into the form below so you don't have to write it again. Check it before sending.
        </p>
      )}
      <form onSubmit={submit} noValidate style={{ display: "grid", gap: "var(--space-4)" }}>
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          <label htmlFor="case-category" style={labelStyle}>What is this about? *</label>
          <select
            id="case-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as HrCaseCategory)}
            aria-invalid={errors.category ? true : undefined}
            aria-describedby={errors.category ? "case-category-error" : hint ? "case-category-hint" : undefined}
            style={fieldStyle}
          >
            <option value="">Choose one…</option>
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {hint && !errors.category && <span id="case-category-hint" style={hintStyle}>{hint}</span>}
          {errors.category && <span id="case-category-error" role="alert" style={{ color: "var(--danger)", fontWeight: 600, fontSize: "0.875rem" }}>{errors.category}</span>}
        </div>

        <TextField label="Short title *" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} error={errors.subject} placeholder="For example: Repeated shouting in team meetings" />

        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          <label htmlFor="case-description" style={labelStyle}>What happened? *</label>
          <span id="case-description-hint" style={hintStyle}>What happened, where, and how it has affected you. Write as much or as little as you like.</span>
          <textarea
            id="case-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={5000}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? "case-description-error" : "case-description-hint"}
            style={{ ...fieldStyle, minHeight: 140, padding: "var(--space-3) var(--space-4)", resize: "vertical" }}
          />
          {errors.description && <span id="case-description-error" role="alert" style={{ color: "var(--danger)", fontWeight: 600, fontSize: "0.875rem" }}>{errors.description}</span>}
        </div>

        <TextField label="People involved (optional)" value={people} onChange={(e) => setPeople(e.target.value)} maxLength={500} placeholder="Names or roles, and any witnesses" />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: "var(--space-4)" }}>
          <TextField label="When did it happen? (optional)" type="date" max={today} value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} />
          <div style={{ display: "grid", gap: "var(--space-2)", alignContent: "start" }}>
            <label htmlFor="case-contact" style={labelStyle}>How should HR contact you?</label>
            <select id="case-contact" value={contactPref} onChange={(e) => setContactPref(e.target.value as HrCase["preferred_contact"])} style={fieldStyle}>
              {(Object.keys(CONTACT_LABEL) as HrCase["preferred_contact"][]).map((k) => (
                <option key={k} value={k} disabled={anonymous && k !== "portal"}>{CONTACT_LABEL[k]}</option>
              ))}
            </select>
          </div>
        </div>

        <CheckboxRow
          id="case-urgent"
          checked={urgent || isSafety}
          disabled={isSafety}
          onChange={setUrgent}
          label="This is urgent"
          hint={isSafety ? "Safety cases are always treated as urgent." : "For example, it's ongoing, it's affecting your safety or health, or you need help this week."}
        />
        <CheckboxRow
          id="case-anon"
          checked={anonymous}
          onChange={(v) => {
            setAnonymous(v);
            if (v) setContactPref("portal");
          }}
          label="Keep me anonymous"
          hint="HR won't see your name, but please name the person involved (in “People involved” above) so HR can act. HR will see “Anonymous employee” instead of you and can still reply to you here, but they can't call or email you."
        />

        {submitError && <p role="alert" style={{ color: "var(--danger)", fontWeight: 600, fontSize: "0.875rem" }}>{submitError}</p>}
        <div>
          <Button type="submit" disabled={submitting} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Lock size={16} aria-hidden="true" /> {submitting ? "Sending privately…" : "Send privately to HR"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function CheckboxRow({ id, checked, disabled, onChange, label, hint }: {
  id: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string; hint: string;
}) {
  return (
    <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-hint`}
        style={{ width: 22, height: 22, marginTop: 2, accentColor: "var(--accent-primary)", flexShrink: 0 }}
      />
      <div style={{ display: "grid", gap: 2 }}>
        <label htmlFor={id} style={labelStyle}>{label}</label>
        <span id={`${id}-hint`} style={hintStyle}>{hint}</span>
      </div>
    </div>
  );
}
