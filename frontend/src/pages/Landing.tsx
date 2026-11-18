/** Public landing page: a normal, readable website — header, hero, how it works, what you can
 * do, who the helpers are, a sample conversation and a sign-in call to action. Plain semantic
 * HTML (header / main / section / footer) so keyboard and screen-reader users can move around it
 * easily; the only motion is a gentle fade-up on scroll, which the Accessibility panel's "Stop
 * animations" switches off. */
import { ArrowRight, BookOpen, CheckCircle2, KeyRound, MessageCircle, ShieldCheck, Ticket, TrendingUp, Workflow } from "lucide-react";
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
  {
    icon: MessageCircle,
    title: "Ask in your own words",
    body: "Type a question — a VPN error, your leave balance, a policy. No forms and no ticket category to pick.",
  },
  {
    icon: Workflow,
    title: "It goes to the right helper",
    body: "The assistant decides whether it is an IT or an HR question and passes it to the specialist for that.",
  },
  {
    icon: CheckCircle2,
    title: "Get an answer or an action",
    body: "Answers come from Ampera's own policies and guides, with the source shown. It can also reset a password or apply for leave, with a manager's approval where needed.",
  },
  {
    icon: TrendingUp,
    title: "Gets better over time",
    body: "Your thumbs up or down on each answer helps it choose better answers next time.",
  },
];

const CAPABILITIES = [
  { icon: BookOpen, title: "Answers you can trust", body: "Every IT and HR answer comes from your own knowledge base and shows where it came from." },
  { icon: KeyRound, title: "It can do things, not just chat", body: "Reset a password, apply for leave or request access — done directly, with manager approval where it matters." },
  { icon: ShieldCheck, title: "Private by design", body: "Every message is checked for sensitive data before any specialist sees it." },
  { icon: Ticket, title: "A person steps in when needed", body: "If the assistant cannot solve something, a ticket is opened with the full details attached." },
  { icon: Workflow, title: "See what is happening", body: "A side panel lists each step as it happens, so nothing is hidden." },
  { icon: TrendingUp, title: "Improves with feedback", body: "Rating an answer teaches the system which answers help people most." },
];

const SAMPLE_CHAT: { from: "user" | AgentKey; text: string }[] = [
  { from: "user", text: "My VPN keeps disconnecting every few minutes." },
  { from: "supervisor", text: "Routing to IT — this looks like a connectivity issue." },
  { from: "it_support", text: "Try switching the VPN protocol to IKEv2 and updating the client. Source: VPN Troubleshooting Guide §3." },
  { from: "user", text: "How many leave days do I have left?" },
  { from: "hr_policy", text: "You have 14 days of annual leave remaining. Source: Leave Policy 2026." },
];

const SECTION: React.CSSProperties = { width: "100%", maxWidth: 1200, margin: "0 auto", padding: "var(--space-8) var(--space-5)" };
const GRID = (min: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: "var(--space-4)" });

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div>
      <SkipLink />

      <header
        style={{
          position: "sticky", top: 0, zIndex: 20, background: "var(--bg-elevated)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            maxWidth: 1200, margin: "0 auto", padding: "var(--space-3) var(--space-5)",
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap",
          }}
        >
          <Logo to={null} size={28} />
          <nav aria-label="Main" style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
            <AccessibilityPanel />
            <Button variant="primary" onClick={() => navigate("/login")}>
              Sign in
            </Button>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section style={{ background: "var(--brand-tint)", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ ...SECTION, paddingTop: "var(--space-8)", paddingBottom: "var(--space-8)", textAlign: "center" }}>
            <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", lineHeight: 1.2, maxWidth: 820, margin: "0 auto var(--space-4)" }}>
              Your IT and HR helpdesk, in one place.
            </h1>
            <p style={{ fontSize: "1.0625rem", maxWidth: 680, margin: "0 auto var(--space-6)", color: "var(--text-secondary)" }}>
              Ask a question in plain English and get a clear answer from Ampera's own policies and guides — or have
              it handle the task for you, like resetting a password or applying for leave.
            </p>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", justifyContent: "center" }}>
              <Button variant="primary" onClick={() => navigate("/login")} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                Sign in to HelpDesk <ArrowRight size={18} aria-hidden="true" />
              </Button>
              <Button variant="ghost" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
                See how it works
              </Button>
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-heading" style={SECTION}>
          <Reveal>
            <h2 id="how-heading" style={{ fontSize: "1.75rem", textAlign: "center", marginBottom: "var(--space-6)" }}>How it works</h2>
          </Reveal>
          <ol style={{ ...GRID(250), listStyle: "none", margin: 0, padding: 0 }}>
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <li key={step.title}>
                  <Reveal>
                    <Panel style={{ padding: "var(--space-5)", height: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
                        <span
                          aria-hidden="true"
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 40, height: 40, borderRadius: "var(--radius-md)",
                            background: "var(--brand-tint)", color: "var(--accent-primary)",
                          }}
                        >
                          <Icon size={20} />
                        </span>
                        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-muted)" }}>Step {i + 1}</span>
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

        <section aria-labelledby="features-heading" style={{ background: "var(--bg-elevated)", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={SECTION}>
            <Reveal>
              <h2 id="features-heading" style={{ fontSize: "1.75rem", textAlign: "center", marginBottom: "var(--space-2)" }}>What you can do</h2>
              <p style={{ textAlign: "center", maxWidth: 620, margin: "0 auto var(--space-6)" }}>
                One chat window replaces the portal, the ticket queue and the hunt through policy PDFs.
              </p>
            </Reveal>
            <ul style={{ ...GRID(300), listStyle: "none", margin: 0, padding: 0 }}>
              {CAPABILITIES.map((c) => {
                const Icon = c.icon;
                return (
                  <li key={c.title}>
                    <Reveal>
                      <Panel style={{ padding: "var(--space-5)", height: "100%" }}>
                        <Icon size={24} aria-hidden="true" style={{ color: "var(--accent-primary)", marginBottom: "var(--space-3)" }} />
                        <h3 style={{ fontSize: "1.0625rem", marginBottom: "var(--space-2)" }}>{c.title}</h3>
                        <p style={{ fontSize: "0.9375rem" }}>{c.body}</p>
                      </Panel>
                    </Reveal>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section aria-labelledby="team-heading" style={SECTION}>
          <Reveal>
            <h2 id="team-heading" style={{ fontSize: "1.75rem", textAlign: "center", marginBottom: "var(--space-2)" }}>Meet the helpers</h2>
            <p style={{ textAlign: "center", maxWidth: 560, margin: "0 auto var(--space-6)" }}>
              Every request is handled by a small crew, each with one job.
            </p>
          </Reveal>
          <ul style={{ ...GRID(300), listStyle: "none", margin: 0, padding: 0 }}>
            {TEAM.map((agent) => {
              const identity = AGENTS[agent.slug];
              return (
                <li key={agent.slug}>
                  <Reveal>
                    <Panel style={{ padding: "var(--space-4) var(--space-5)", display: "flex", gap: "var(--space-4)", alignItems: "center", height: "100%" }}>
                      <AgentAvatar agent={agent.slug} size={48} />
                      <div>
                        <h3 style={{ fontSize: "1rem", color: identity.color }}>{identity.name}</h3>
                        <p style={{ fontSize: "0.875rem" }}>{agent.job}</p>
                      </div>
                    </Panel>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="chat-heading" style={{ background: "var(--bg-elevated)", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={SECTION}>
            <Reveal>
              <h2 id="chat-heading" style={{ fontSize: "1.75rem", textAlign: "center", marginBottom: "var(--space-6)" }}>A conversation, in practice</h2>
              <Panel style={{ padding: "var(--space-5)", maxWidth: 820, margin: "0 auto" }}>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {SAMPLE_CHAT.map((m, i) => {
                    const isUser = m.from === "user";
                    const identity = isUser ? null : AGENTS[m.from as AgentKey];
                    return (
                      <li key={i} style={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                        <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: 2, color: identity ? identity.color : "var(--text-secondary)" }}>
                          {identity ? `${identity.name} (${identity.role})` : "You"}
                        </div>
                        <div
                          style={{
                            padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)", fontSize: "0.9375rem",
                            background: isUser ? "var(--accent-primary)" : "var(--bg-elevated)",
                            color: isUser ? "var(--text-on-accent)" : "var(--text-primary)",
                            border: `1px solid ${isUser ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                          }}
                        >
                          {m.text}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </Reveal>
          </div>
        </section>

        <section aria-labelledby="cta-heading" style={{ ...SECTION, textAlign: "center" }}>
          <Reveal>
            <h2 id="cta-heading" style={{ fontSize: "1.5rem", marginBottom: "var(--space-3)" }}>Ready to try it?</h2>
            <p style={{ maxWidth: 480, margin: "0 auto var(--space-5)" }}>
              Sign in with one of the demo accounts and ask it something.
            </p>
            <Button variant="primary" onClick={() => navigate("/login")} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              Sign in <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </Reveal>
        </section>
      </main>

      <footer style={{ padding: "var(--space-5)", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
        Ampera HelpDesk — runs on this machine only. No data leaves it.
      </footer>
    </div>
  );
}
