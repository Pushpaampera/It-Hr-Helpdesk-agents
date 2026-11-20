/** Public landing page — flat (no 3D), full screen width with only a small side margin, in the
 * Ampera navy + magenta colours of the Campus Hire portal.
 *
 * Layout, top to bottom:
 *   header (logo, section links, accessibility button, sign in)
 *   → navy hero banner: the promise on the left, the 3D orbit animation on the right
 *   → four stat cards (like the Campus Hire dashboard cards)
 *   → about (what HelpDesk is, who it serves, why it can be trusted; the header's "About" button,
 *     visible on every screen size, scrolls here)
 *   → how it works (4 steps) → what you can do (6 features) → meet the helpers (7 agents)
 *   → navy "ready to try it" banner → footer.
 *
 * Accessibility: semantic landmarks and headings, every section labelled, white focus ring on
 * navy; the 3D orbit is decoration (aria-hidden) and, like the fade-up on scroll, stops with
 * "Stop animations". */
import {
  ArrowRight, BookOpen, Briefcase, CheckCircle2, ClipboardCheck, FileText, Headset, Info, KeyRound, LockKeyhole, MessageCircle,
  ScrollText, ShieldCheck, Sparkles, Ticket, TrendingUp, UserCheck, Users, Workflow,
} from "lucide-react";
import { lazy, Suspense, useLayoutEffect, useRef, useState } from "react";
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
import type { OrbitAnchor } from "../three/HeroOrbit";

// The 3D orbit (Three.js) is loaded separately so the page's text appears instantly.
const HeroOrbit = lazy(() => import("../three/HeroOrbit"));

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
  { icon: Workflow, title: "It goes to the right AI agent", body: "Sage, the routing agent, decides whether it is an IT or an HR question and passes it to the specialist agent for that." },
  { icon: CheckCircle2, title: "Get an answer or an action", body: "Answers come from Ampera's own policies and guides, with the source shown. It can also reset a password or apply for leave, with an admin or HR approving where needed." },
  { icon: TrendingUp, title: "Gets better over time", body: "Your thumbs up or down on each answer helps it choose better answers next time." },
];

const CAPABILITIES = [
  { icon: BookOpen, title: "Answers you can trust", body: "Every IT and HR answer comes from your own knowledge base and shows where it came from." },
  { icon: KeyRound, title: "It can do things, not just chat", body: "Reset a password, apply for leave or request access — done directly, with an admin approving system access." },
  { icon: ShieldCheck, title: "Private by design", body: "Every message is checked for sensitive data before any specialist sees it." },
  { icon: Ticket, title: "A person steps in when needed", body: "If the assistant cannot solve something, a ticket is opened with the full details attached." },
  { icon: Workflow, title: "See what is happening", body: "A side panel lists each step as it happens, so nothing is hidden." },
  { icon: TrendingUp, title: "Improves with feedback", body: "Rating an answer teaches the system which answers help people most." },
];

const STATS = [
  { icon: Users, label: "AI agents", value: "7", note: "AI agents working together" },
  { icon: Sparkles, label: "Areas covered", value: "IT + HR", note: "One place for both" },
  { icon: FileText, label: "Sourced answers", value: "100%", note: "Every answer shows its source" },
  { icon: Workflow, label: "Transparency", value: "Live", note: "Watch each step as it happens" },
];

// About: what the product is, for a visitor who hasn't signed in.
const AUDIENCES = [
  { icon: Users, title: "Employees", body: "Get answers about laptops, accounts, leave and policies at any time, reset a password safely, apply for leave, and follow their tickets." },
  { icon: Briefcase, title: "HR team", body: "Approve or reject leave in one place, see who is on leave today, and handle private matters confidentially." },
  { icon: Headset, title: "IT support", body: "Receive only the issues the assistant could not solve, with the full conversation attached, and reset passwords after checking identity." },
  { icon: ClipboardCheck, title: "Administrators", body: "Approve system access, and review answer quality, running costs and a complete audit log." },
];

const TRUST = [
  { icon: UserCheck, title: "Verified", body: "Password resets need a code sent to the person's own email." },
  { icon: LockKeyhole, title: "Private", body: "Personal and confidential matters never go to other staff." },
  { icon: ScrollText, title: "Accountable", body: "Every action is recorded in an audit log." },
  { icon: ShieldCheck, title: "People decide", body: "Leave and system access are always approved by HR or an admin." },
];

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#helpers", label: "AI agents" },
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

export default function Landing() {
  const navigate = useNavigate();
  const bannerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<OrbitAnchor | null>(null);

  // Tell the 3D orbit where its stage (the right-hand column) sits inside the banner — it moves
  // under the text on narrow screens — and keep it updated as the layout changes.
  useLayoutEffect(() => {
    const banner = bannerRef.current;
    const card = cardRef.current;
    if (!banner || !card) return;
    function measure() {
      if (!banner || !card) return;
      const b = banner.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      if (!b.width || !b.height) return;
      setAnchor({
        x: (c.left + c.width / 2 - b.left) / b.width,
        y: (c.top + c.height / 2 - b.top) / b.height,
        w: c.width / b.width,
        h: c.height / b.height,
      });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(banner);
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

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
            {/* Always visible, also on phones: jumps to the About section below the hero. */}
            <a
              href="#about"
              style={{
                ...PILL, padding: "0 var(--space-4)", minHeight: 44, fontWeight: 600, fontSize: "0.9375rem",
                color: "var(--accent-primary)", textDecoration: "none", border: "2px solid var(--accent-primary)",
              }}
            >
              <Info size={16} aria-hidden="true" /> About
            </a>
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
            ref={bannerRef}
            data-on-navy=""
            style={{
              position: "relative", overflow: "hidden",
              background: "var(--banner-bg)", color: "var(--banner-text)", borderRadius: "var(--radius-lg)",
              padding: "clamp(28px, 5vw, 72px) clamp(20px, 4vw, 64px)",
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: "clamp(28px, 4vw, 64px)", alignItems: "center",
            }}
          >
            {/* 3D orbit behind the content — decoration only. */}
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
              {anchor && (
                <Suspense fallback={null}>
                  <HeroOrbit anchor={anchor} />
                </Suspense>
              )}
            </div>
            <div style={{ position: "relative", zIndex: 1 }}>
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
            {/* Empty stage on the right: the 3D orbit is centred here. */}
            <div ref={cardRef} aria-hidden="true" style={{ position: "relative", zIndex: 1, minHeight: "clamp(240px, 32vw, 460px)" }} />
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

        <section id="about" aria-labelledby="about-heading" style={{ ...SECTION, scrollMarginTop: 72 }}>
          <SectionHeading
            id="about-heading"
            title="About Ampera HelpDesk"
            intro="One place where employees get help with IT and HR, from an assistant that answers, acts and knows when to bring in a person."
          />
          <Reveal>
            <Panel style={{ padding: "clamp(20px, 3vw, 36px)", marginBottom: "var(--space-5)" }}>
              <div style={{ ...GRID(320), gap: "clamp(20px, 3vw, 40px)" }}>
                <div>
                  <h3 style={{ fontSize: "1.125rem", marginBottom: "var(--space-2)" }}>What it is</h3>
                  <p style={{ fontSize: "0.9375rem" }}>
                    Ampera HelpDesk is an AI-powered service desk for IT and HR. Employees describe what they need in their
                    own words, in a single chat. A team of specialised AI agents finds the answer in Ampera's own guides and
                    policies, or completes the task directly, such as resetting a password or sending a leave request to HR.
                  </p>
                </div>
                <div>
                  <h3 style={{ fontSize: "1.125rem", marginBottom: "var(--space-2)" }}>Why it matters</h3>
                  <p style={{ fontSize: "0.9375rem" }}>
                    Instead of searching portals, filling in forms and waiting in a ticket queue, people get help in seconds.
                    Simple requests are resolved straight away, and anything that needs a decision or a human goes to the
                    right person with the full context, so nobody has to explain the problem twice.
                  </p>
                </div>
              </div>
            </Panel>
          </Reveal>

          <h3 style={{ fontSize: "1.25rem", textAlign: "center", marginBottom: "var(--space-4)" }}>Who it helps</h3>
          <ul style={{ ...GRID(250), listStyle: "none", margin: "0 0 var(--space-6)", padding: 0 }}>
            {AUDIENCES.map((a) => {
              const Icon = a.icon;
              return (
                <li key={a.title}>
                  <Reveal>
                    <Panel style={{ padding: "var(--space-5)", height: "100%" }}>
                      <span aria-hidden="true" style={{ ...ICON_CHIP, marginBottom: "var(--space-3)" }}><Icon size={20} /></span>
                      <h4 style={{ fontSize: "1.0625rem", marginBottom: "var(--space-2)" }}>{a.title}</h4>
                      <p style={{ fontSize: "0.9375rem" }}>{a.body}</p>
                    </Panel>
                  </Reveal>
                </li>
              );
            })}
          </ul>

          <h3 style={{ fontSize: "1.25rem", textAlign: "center", marginBottom: "var(--space-4)" }}>Built to be trusted</h3>
          <ul style={{ ...GRID(220), listStyle: "none", margin: 0, padding: 0 }}>
            {TRUST.map((t) => {
              const Icon = t.icon;
              return (
                <li key={t.title}>
                  <Reveal>
                    <Panel style={{ padding: "var(--space-4) var(--space-5)", height: "100%", display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
                      <span aria-hidden="true" style={{ ...ICON_CHIP, width: 36, height: 36 }}><Icon size={18} /></span>
                      <div>
                        <h4 style={{ fontSize: "1rem", marginBottom: 2 }}>{t.title}</h4>
                        <p style={{ fontSize: "0.875rem" }}>{t.body}</p>
                      </div>
                    </Panel>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="how-it-works" aria-labelledby="how-heading" style={{ ...SECTION, paddingTop: 0, scrollMarginTop: 72 }}>
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
          <SectionHeading id="team-heading" title="Meet the AI agents" intro="Seven AI agents work behind every request — each one has a single job, and you can see which one is helping you." />
          <ul style={{ ...GRID(300), listStyle: "none", margin: 0, padding: 0 }}>
            {TEAM.map((agent) => {
              const identity = AGENTS[agent.slug];
              return (
                <li key={agent.slug}>
                  <Reveal>
                    <Panel style={{ padding: "var(--space-4) var(--space-5)", display: "flex", gap: "var(--space-4)", alignItems: "center", height: "100%" }}>
                      <AgentAvatar agent={agent.slug} size={56} />
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: 2 }}>
                          <h3 style={{ fontSize: "1rem", color: `var(--agent-${identity.key})` }}>{identity.name}</h3>
                          <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--brand-tint)", color: "var(--accent-primary)" }}>
                            AI agent
                          </span>
                        </div>
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
