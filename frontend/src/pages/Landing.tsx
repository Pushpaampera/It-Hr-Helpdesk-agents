/** Public landing page — flat (no 3D), full screen width with only a small side margin, in the
 * Ampera navy + magenta colours of the Campus Hire portal.
 *
 * Layout, top to bottom:
 *   header (logo, section links, accessibility button, sign in)
 *   → navy hero banner: the promise on the left, a static preview of the assistant on the right
 *   → four stat cards (like the Campus Hire dashboard cards)
 *   → how it works (4 steps) → what you can do (6 features) → meet the helpers (7 agents)
 *   → navy "ready to try it" banner → footer.
 *
 * Accessibility: semantic landmarks and headings, every section labelled, the chat preview is a
 * real list (so screen readers read it as an example conversation), white focus ring on navy,
 * the only motion is a gentle fade-up on scroll which "Stop animations" switches off. */
import {
  ArrowRight, BookOpen, CheckCircle2, FileText, KeyRound, MessageCircle, ShieldCheck, Sparkles, Ticket, TrendingUp, Users, Workflow,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import AccessibilityPanel from "../components/AccessibilityPanel";
import Reveal from "../components/Reveal";
import SkipLink from "../components/SkipLink";
import AgentAvatar from "../components/ui/AgentAvatar";
import Button from "../components/ui/Button";
import Logo from "../components/ui/Logo";
import Panel from "../components/ui/Panel";
import { AGENTS } from "../design/agents";
import type { AgentKey } from "../design/agents";

// Mirrors backend/app/agents/events.py's FRIENDLY_NAMES/AGENT_JOBS — the 7 helpers a person
// actually meets (the shared retrieval module isn't one of them).
const TEAM: { slug: AgentKey; job: string }[] = [
  { slug: "guard", job: "Privacy Guardian — checks every message for private data first" },
  { slug: "supervisor", job: "Request Router — sends your question to the right specialist" },
  { slug: "it_support", job: "IT Specialist — fixes laptop, network and software problems" },
  { slug: "hr_policy", job: "HR Policy Expert — answers leave, benefits and policy questions" },
  { slug: "action", job: "Task Doer — resets passwords, applies for leave, requests access" },
  { slug: "ticketing", job: "Case Handler — opens a ticket when a person needs to step in" },
  { slug: "feedback", job: "Quality Keeper — learns from your ratings to improve answers" },
];

const STEPS = [
  { icon: MessageCircle, title: "Ask in your own words", body: "Type a question — a VPN error, your leave balance, a policy. No forms and no ticket category to pick." },
  { icon: Workflow, title: "It goes to the right helper", body: "The assistant decides whether it is an IT or an HR question and passes it to the specialist for that." },
  { icon: CheckCircle2, title: "Get an answer or an action", body: "Answers come from Ampera's own policies and guides, with the source shown. It can also reset a password or apply for leave, with a manager's approval where needed." },
  { icon: TrendingUp, title: "Gets better over time", body: "Your thumbs up or down on each answer helps it choose better answers next time." },
];

const CAPABILITIES = [
  { icon: BookOpen, title: "Answers you can trust", body: "Every IT and HR answer comes from your own knowledge base and shows where it came from." },
  { icon: KeyRound, title: "It can do things, not just chat", body: "Reset a password, apply for leave or request access — done directly, with manager approval where it matters." },
  { icon: ShieldCheck, title: "Private by design", body: "Every message is checked for sensitive data before any specialist sees it." },
  { icon: Ticket, title: "A person steps in when needed", body: "If the assistant cannot solve something, a ticket is opened with the full details attached." },
  { icon: Workflow, title: "See what is happening", body: "A side panel lists each step as it happens, so nothing is hidden." },
  { icon: TrendingUp, title: "Improves with feedback", body: "Rating an answer teaches the system which answers help people most." },
];

const STATS = [
  { icon: Users, label: "Helpers", value: "7", note: "AI helpers working together" },
  { icon: Sparkles, label: "Areas covered", value: "IT + HR", note: "One place for both" },
  { icon: FileText, label: "Sourced answers", value: "100%", note: "Every answer shows its source" },
  { icon: Workflow, label: "Transparency", value: "Live", note: "Watch each step as it happens" },
];

const PREVIEW: { from: "user" | AgentKey; text: string; source?: string }[] = [
  { from: "user", text: "My VPN keeps disconnecting every few minutes." },
  { from: "it_support", text: "Switch the VPN protocol to IKEv2 and update the client — that fixes most drop-outs.", source: "VPN Troubleshooting Guide §3" },
  { from: "user", text: "How many leave days do I have left?" },
  { from: "hr_policy", text: "You have 14 days of annual leave remaining this year.", source: "Leave Policy 2026" },
];

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#helpers", label: "Helpers" },
];

/** Full screen width with only a small side margin. */
const GUTTER = "clamp(12px, 2vw, 28px)";
const SECTION: CSSProperties = { width: "100%", padding: `var(--space-7) ${GUTTER}` };
const GRID = (min: number): CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: "var(--space-4)" });
const ICON_CHIP: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 40, height: 40, borderRadius: "var(--radius-md)", background: "var(--brand-tint)", color: "var(--accent-primary)",
};
const PILL: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, borderRadius: "var(--radius-full)" };
const ON_NAVY_OUTLINE: CSSProperties = { ...PILL, background: "transparent", color: "var(--banner-text)", border: "2px solid var(--banner-text)" };

function SectionHeading({ id, title, intro }: { id: string; title: string; intro?: string }) {
  return (
    <Reveal>
      <h2 id={id} style={{ fontSize: "1.75rem", textAlign: "center", marginBottom: intro ? "var(--space-2)" : "var(--space-6)" }}>{title}</h2>
      {intro && <p style={{ textAlign: "center", maxWidth: 620, margin: "0 auto var(--space-6)" }}>{intro}</p>}
    </Reveal>
  );
}

/** A still picture of the assistant (styled like the Campus Hire "HR assistant" panel): navy
 * header, the person's questions in magenta bubbles, answers in white bubbles with their source. */
function AssistantPreview() {
  return (
    <figure style={{ margin: 0 }}>
      <Panel style={{ padding: 0, overflow: "hidden", boxShadow: "var(--shadow-panel-lift)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
          <span aria-hidden="true" style={{ ...ICON_CHIP, width: 36, height: 36, borderRadius: "50%" }}>
            <MessageCircle size={18} />
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-primary)" }}>HelpDesk assistant</div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>IT and HR answers, with sources</div>
          </div>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {PREVIEW.map((m, i) => {
            const isUser = m.from === "user";
            const identity = isUser ? null : AGENTS[m.from as AgentKey];
            return (
              <li key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                {identity && <AgentAvatar agent={identity.key} size={28} />}
                <div style={{ maxWidth: "82%" }}>
                  <span className="sr-only">{identity ? `${identity.name}, ${identity.role}:` : "You:"}</span>
                  {identity && (
                    <div aria-hidden="true" style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: 2, color: `var(--agent-${identity.key})` }}>
                      {identity.name} · {identity.role}
                    </div>
                  )}
                  <div
                    style={{
                      padding: "var(--space-2) var(--space-3)", fontSize: "0.875rem", lineHeight: 1.5,
                      borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      background: isUser ? "var(--accent-primary)" : "var(--bg-elevated)",
                      color: isUser ? "var(--text-on-accent)" : "var(--text-primary)",
                      border: `1px solid ${isUser ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    }}
                  >
                    {m.text}
                    {m.source && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: "0.75rem", fontWeight: 600, color: "var(--accent-primary)" }}>
                        <FileText size={12} aria-hidden="true" /> Source: {m.source}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div aria-hidden="true" style={{ display: "flex", gap: "var(--space-2)", padding: "0 var(--space-4) var(--space-4)" }}>
          <div style={{ flex: 1, minHeight: 40, borderRadius: "var(--radius-full)", border: "2px solid var(--accent-primary)", padding: "0 var(--space-4)", display: "flex", alignItems: "center", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Ask how to do something…
          </div>
          <span style={{ ...ICON_CHIP, width: 40, height: 40, borderRadius: "50%", background: "var(--accent-primary)", color: "var(--text-on-accent)" }}>
            <ArrowRight size={18} />
          </span>
        </div>
      </Panel>
      <figcaption className="sr-only">An example conversation with the HelpDesk assistant.</figcaption>
    </figure>
  );
}

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div>
      <SkipLink />

      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ padding: `var(--space-2) ${GUTTER}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <Logo to={null} size={28} />
          <nav aria-label="Main" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            {/* Section links: hidden on narrow screens (global.css) so the sticky header stays short. */}
            <span className="landing-navlinks">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  style={{ padding: "var(--space-2) var(--space-3)", minHeight: 44, display: "inline-flex", alignItems: "center", fontWeight: 600, fontSize: "0.9375rem", color: "var(--text-primary)", textDecoration: "none", borderRadius: "var(--radius-md)" }}
                >
                  {l.label}
                </a>
              ))}
            </span>
            <AccessibilityPanel />
            <Button variant="primary" onClick={() => navigate("/login")} style={PILL}>
              Sign in
            </Button>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {/* Hero — the navy banner from Campus Hire, full width. */}
        <section aria-labelledby="hero-heading" style={{ padding: `var(--space-5) ${GUTTER} 0` }}>
          <div
            data-on-navy=""
            style={{
              background: "var(--banner-bg)", color: "var(--banner-text)", borderRadius: "var(--radius-lg)",
              padding: "clamp(28px, 5vw, 72px) clamp(20px, 4vw, 64px)",
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: "clamp(28px, 4vw, 64px)", alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--banner-text-muted)", marginBottom: "var(--space-3)" }}>
                Ampera HelpDesk · IT and HR support
              </div>
              <h1 id="hero-heading" style={{ fontSize: "clamp(2rem, 4.2vw, 3.4rem)", lineHeight: 1.12, fontWeight: 600, color: "var(--banner-text)", marginBottom: "var(--space-4)" }}>
                Your IT and HR helpdesk, in one place.
              </h1>
              <p style={{ fontSize: "1.125rem", color: "var(--banner-text-muted)", maxWidth: 620, marginBottom: "var(--space-6)" }}>
                Ask a question in plain English and get a clear answer from Ampera's own policies and guides — or have it
                handle the task for you, like resetting a password or applying for leave.
              </p>
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <Button variant="primary" onClick={() => navigate("/login")} style={{ ...PILL, minHeight: 50, padding: "0 var(--space-6)", fontSize: "1rem" }}>
                  Sign in to HelpDesk <ArrowRight size={18} aria-hidden="true" />
                </Button>
                <Button variant="ghost" onClick={() => document.getElementById("how-it-works")?.scrollIntoView()} style={{ ...ON_NAVY_OUTLINE, minHeight: 50, padding: "0 var(--space-6)", fontSize: "1rem" }}>
                  See how it works
                </Button>
              </div>
            </div>
            <AssistantPreview />
          </div>
        </section>

        {/* Stat cards, like the Campus Hire dashboard cards. */}
        <section aria-label="At a glance" style={{ padding: `var(--space-4) ${GUTTER} 0` }}>
          <ul style={{ ...GRID(220), listStyle: "none", margin: 0, padding: 0 }}>
            {STATS.map((st) => {
              const Icon = st.icon;
              return (
                <li key={st.label}>
                  <Panel style={{ padding: "var(--space-5)", height: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)" }}>{st.label}</span>
                      <span aria-hidden="true" style={{ ...ICON_CHIP, width: 32, height: 32 }}><Icon size={16} /></span>
                    </div>
                    <div style={{ fontSize: "2rem", fontWeight: 500, color: "var(--text-primary)", margin: "var(--space-2) 0 var(--space-1)" }}>{st.value}</div>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{st.note}</div>
                  </Panel>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="how-it-works" aria-labelledby="how-heading" style={{ ...SECTION, scrollMarginTop: 72 }}>
          <SectionHeading id="how-heading" title="How it works" />
          <ol style={{ ...GRID(260), listStyle: "none", margin: 0, padding: 0 }}>
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <li key={step.title}>
                  <Reveal>
                    <Panel style={{ padding: "var(--space-5)", height: "100%", borderTop: "4px solid var(--accent-primary)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
                        <span aria-hidden="true" style={ICON_CHIP}><Icon size={20} /></span>
                        <span style={{ fontSize: "0.8125rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>Step {i + 1}</span>
                      </div>
                      <h3 style={{ fontSize: "1.0625rem", marginBottom: "var(--space-2)" }}>{step.title}</h3>
                      <p style={{ fontSize: "0.9375rem" }}>{step.body}</p>
                    </Panel>
                  </Reveal>
                </li>
              );
            })}
          </ol>
        </section>

        <section id="features" aria-labelledby="features-heading" style={{ ...SECTION, paddingTop: 0, scrollMarginTop: 72 }}>
          <SectionHeading id="features-heading" title="What you can do" intro="One chat window replaces the portal, the ticket queue and the hunt through policy PDFs." />
          <ul style={{ ...GRID(300), listStyle: "none", margin: 0, padding: 0 }}>
            {CAPABILITIES.map((c) => {
              const Icon = c.icon;
              return (
                <li key={c.title}>
                  <Reveal>
                    <Panel style={{ padding: "var(--space-5)", height: "100%", display: "flex", gap: "var(--space-4)", alignItems: "flex-start" }}>
                      <span aria-hidden="true" style={ICON_CHIP}><Icon size={20} /></span>
                      <div>
                        <h3 style={{ fontSize: "1.0625rem", marginBottom: "var(--space-2)" }}>{c.title}</h3>
                        <p style={{ fontSize: "0.9375rem" }}>{c.body}</p>
                      </div>
                    </Panel>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="helpers" aria-labelledby="team-heading" style={{ ...SECTION, paddingTop: 0, scrollMarginTop: 72 }}>
          <SectionHeading id="team-heading" title="Meet the helpers" intro="Every request is handled by a small crew, each with one job." />
          <ul style={{ ...GRID(300), listStyle: "none", margin: 0, padding: 0 }}>
            {TEAM.map((agent) => {
              const identity = AGENTS[agent.slug];
              return (
                <li key={agent.slug}>
                  <Reveal>
                    <Panel style={{ padding: "var(--space-4) var(--space-5)", display: "flex", gap: "var(--space-4)", alignItems: "center", height: "100%" }}>
                      <AgentAvatar agent={agent.slug} size={48} />
                      <div>
                        <h3 style={{ fontSize: "1rem", color: `var(--agent-${identity.key})` }}>{identity.name}</h3>
                        <p style={{ fontSize: "0.875rem" }}>{agent.job}</p>
                      </div>
                    </Panel>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="cta-heading" style={{ ...SECTION, paddingTop: 0 }}>
          <Reveal>
            <div
              data-on-navy=""
              style={{
                background: "var(--banner-bg)", color: "var(--banner-text)", borderRadius: "var(--radius-lg)",
                padding: "var(--space-7) clamp(20px, 4vw, 64px)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-5)", flexWrap: "wrap",
              }}
            >
              <div>
                <h2 id="cta-heading" style={{ fontSize: "1.75rem", color: "var(--banner-text)", marginBottom: "var(--space-2)" }}>Ready to try it?</h2>
                <p style={{ color: "var(--banner-text-muted)" }}>Sign in with one of the demo accounts and ask it something.</p>
              </div>
              <Button variant="primary" onClick={() => navigate("/login")} style={{ ...PILL, minHeight: 50, padding: "0 var(--space-6)", fontSize: "1rem" }}>
                Sign in <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer style={{ padding: `var(--space-5) ${GUTTER}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", color: "var(--text-muted)", fontSize: "0.875rem", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
        <Logo to={null} size={22} showPill={false} />
        <span>Ampera HelpDesk — runs on this machine only. No data leaves it.</span>
      </footer>
    </div>
  );
}
