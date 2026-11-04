import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ChevronDown, MessageCircle, TrendingUp, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Reveal from "../components/Reveal";
import ReduceMotionToggle from "../components/ReduceMotionToggle";
import Button from "../components/ui/Button";
import Logo from "../components/ui/Logo";
import Panel from "../components/ui/Panel";
import { AGENT_ORDER, AGENTS } from "../design/agents";
import { fadeUp, staggerContainer } from "../design/motion";
import { useUIStore } from "../store/uiStore";
import AgentDesk from "../three/AgentDesk";
import AgentMascot from "../three/AgentMascot";
import DataPulse from "../three/DataPulse";
import ParticleField from "../three/ParticleField";
import Scene from "../three/Scene";

// The 6 non-router agents sit around Sage in a hexagon; Sage is the glowing core.
const DESK_AGENTS = AGENT_ORDER.filter((key) => key !== "supervisor");
// Mirrors backend/app/agents/events.py's FRIENDLY_NAMES/AGENT_JOBS — the 7 agents the audience
// actually meets in a demo (the shared retrieval module isn't one of them).
const TEAM = [
  { slug: "guard", job: "the Privacy Guardian" },
  { slug: "supervisor", job: "the Request Router" },
  { slug: "it_support", job: "the IT Specialist" },
  { slug: "hr_policy", job: "the HR Policy Expert" },
  { slug: "action", job: "the Task Doer" },
  { slug: "ticketing", job: "the Case Handler" },
  { slug: "feedback", job: "the Quality Keeper" },
] as const;

const STEPS = [
  {
    icon: MessageCircle,
    title: "Ask anything",
    body: "Type a question in plain English — a VPN error, a leave balance, a policy question. No forms, no ticket queue to pick from.",
  },
  {
    icon: Workflow,
    title: "Routed instantly",
    body: "Sage reads the message and hands it to the right specialist in real time — IT, HR, or a clarifying question if it's unclear.",
  },
  {
    icon: CheckCircle2,
    title: "A grounded answer, or a real action",
    body: "Iris and Hana answer from the real knowledge base with a cited source. Atlas can reset a password or apply for leave directly — with a manager's approval when access is involved.",
  },
  {
    icon: TrendingUp,
    title: "Gets smarter over time",
    body: "Finn tracks how every answer landed and feeds it back into a live learning system, so the right retrieval strategy wins more often.",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const [pulseTrigger, setPulseTrigger] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => {
      setPulseTrigger((n) => n + 1);
      setActiveIndex((n) => (n + 1) % DESK_AGENTS.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [reduceMotion]);

  const activeAgentKey = DESK_AGENTS[activeIndex];
  const deskRadius = 11;

  return (
    <div>
      <header
        className="glass-panel"
        style={{
          position: "fixed", top: "var(--space-4)", left: "var(--space-6)", right: "var(--space-6)", zIndex: 10,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "var(--space-3) var(--space-5)", borderRadius: "var(--radius-full)",
        }}
      >
        <Logo to={null} size={28} />
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          <ReduceMotionToggle />
          <Button variant="ghost" onClick={() => navigate("/login")}>
            Sign in
          </Button>
        </div>
      </header>

      <section style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <Scene cameraPosition={[0, 1.5, 21]} fov={44} bloom>
            <ParticleField />
            <AgentDesk agentKey="supervisor" position={[0, 4.2, -10]} isCore state="working" bubble="Routing requests to the right specialist…" />
            {DESK_AGENTS.map((key, i) => {
              const angle = (i / DESK_AGENTS.length) * Math.PI * 2 + Math.PI / 6;
              const pos: [number, number, number] = [
                Math.sin(angle) * deskRadius,
                1.4 + Math.cos(angle) * 3.6,
                -11 - Math.abs(Math.cos(angle)) * 2.5,
              ];
              const isActive = key === activeAgentKey;
              return (
                <group key={key}>
                  <AgentDesk
                    agentKey={key}
                    position={pos}
                    scale={1.05}
                    state={isActive ? "working" : "idle"}
                    bubble={isActive ? AGENTS[key].sampleLine : null}
                  />
                  <DataPulse from={[0, 3.8, -10]} to={pos} trigger={isActive ? pulseTrigger : -1} color={AGENTS[key].color} />
                </group>
              );
            })}
          </Scene>
        </div>

        {/* A compact glass strip pinned near the bottom, not a centered card — the agent world
            (robots, desks, holograms) must be the first fully-unblocked thing a visitor sees,
            per the operator's brief. */}
        <div
          style={{
            position: "absolute", left: 0, right: 0, bottom: "var(--space-8)", zIndex: 1,
            display: "flex", justifyContent: "center", padding: "0 var(--space-6)", pointerEvents: "none",
          }}
        >
          <Panel style={{ padding: "var(--space-4) var(--space-6)", maxWidth: 640, pointerEvents: "auto" }}>
            {reduceMotion ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-3)", textAlign: "center" }}>
                <h1 style={{ fontSize: "clamp(22px, 3.4vw, 32px)", lineHeight: 1.12 }}>
                  Your HR and IT helpdesk, run by AI agents.
                </h1>
                <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  Real IT and HR answers, grounded in your own knowledge base — routed, resolved, and
                  escalated by seven cooperating agents you can watch work in real time.
                </p>
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", justifyContent: "center" }}>
                  <Button variant="primary" onClick={() => navigate("/login")} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    Enter Ampera HelpDesk <ArrowRight size={16} />
                  </Button>
                  <Button variant="ghost" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
                    Watch agents work
                  </Button>
                </div>
              </div>
            ) : (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={staggerContainer(0.12)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-3)", textAlign: "center" }}
              >
                <motion.h1 variants={fadeUp} style={{ fontSize: "clamp(22px, 3.4vw, 32px)", lineHeight: 1.12 }}>
                  Your HR and IT helpdesk, run by AI agents.
                </motion.h1>
                <motion.p variants={fadeUp} style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  Real IT and HR answers, grounded in your own knowledge base — routed, resolved, and
                  escalated by seven cooperating agents you can watch work in real time.
                </motion.p>
                <motion.div variants={fadeUp} style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", justifyContent: "center" }}>
                  <Button variant="primary" onClick={() => navigate("/login")} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    Enter Ampera HelpDesk <ArrowRight size={16} />
                  </Button>
                  <Button variant="ghost" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
                    Watch agents work
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </Panel>
        </div>

        {!reduceMotion && (
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", bottom: "var(--space-2)", left: "50%", transform: "translateX(-50%)", color: "var(--text-muted)" }}
          >
            <ChevronDown size={24} />
          </motion.div>
        )}
      </section>

      <section style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1100, margin: "0 auto" }}>
        <Reveal>
          <h2 style={{ fontSize: 32, textAlign: "center", marginBottom: "var(--space-2)" }}>Meet the team</h2>
          <p style={{ textAlign: "center", maxWidth: 560, margin: "0 auto var(--space-7)" }}>
            Every request is handled by a small crew of specialists, each with one job.
          </p>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
          {TEAM.map((agent) => {
            const identity = AGENTS[agent.slug];
            return (
              <Reveal key={agent.slug}>
                <Panel style={{ padding: "var(--space-5)", height: "100%" }}>
                  <AgentMascot agent={agent.slug} size={72} state="idle" style={{ marginBottom: "var(--space-2)", marginLeft: -8 }} />
                  <h3 style={{ fontSize: 18, marginBottom: 2 }}>{identity.name}</h3>
                  <p style={{ fontSize: 14 }}>{agent.job}</p>
                </Panel>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section id="how-it-works" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1100, margin: "0 auto" }}>
        <Reveal>
          <h2 style={{ fontSize: 32, textAlign: "center", marginBottom: "var(--space-7)" }}>How it works</h2>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <Reveal key={step.title}>
                <Panel style={{ padding: "var(--space-5)", height: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
                    <span
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 36, height: 36, borderRadius: "var(--radius-md)",
                        background: "var(--bg-elevated)", color: "var(--agent-supervisor)",
                      }}
                    >
                      <Icon size={18} />
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 17, marginBottom: "var(--space-2)" }}>{step.title}</h3>
                  <p style={{ fontSize: 14 }}>{step.body}</p>
                </Panel>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center" }}>
        <Reveal>
          <h2 style={{ fontSize: 28, marginBottom: "var(--space-4)" }}>See it live</h2>
          <p style={{ maxWidth: 480, margin: "0 auto var(--space-5)" }}>
            Sign in with any of the four demo accounts and ask it something.
          </p>
          <Button variant="primary" onClick={() => navigate("/login")} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Sign in <ArrowRight size={16} />
          </Button>
        </Reveal>
      </section>

      <footer style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        Local demo environment — no data leaves this machine.
      </footer>
    </div>
  );
}
