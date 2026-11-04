import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ChevronDown, MessageCircle, TrendingUp, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import amperaLogo from "../assets/ampera-logo.png";
import Reveal from "../components/Reveal";
import ReduceMotionToggle from "../components/ReduceMotionToggle";
import Button from "../components/ui/Button";
import Panel from "../components/ui/Panel";
import { fadeUp, staggerContainer } from "../design/motion";
import { useUIStore } from "../store/uiStore";
import AgentOrb, { AGENT_COLORS } from "../three/AgentOrb";
import DataPulse from "../three/DataPulse";
import ParticleField from "../three/ParticleField";
import RoboCompanion from "../three/RoboCompanion";
import Scene from "../three/Scene";

// Mirrors backend/app/agents/events.py's FRIENDLY_NAMES/AGENT_JOBS — the 7 agents the audience
// actually meets in a demo (the shared retrieval module isn't one of them).
const TEAM = [
  { slug: "guard", name: "Gus", job: "the Privacy Guardian" },
  { slug: "supervisor", name: "Sage", job: "the Request Router" },
  { slug: "it_support", name: "Iris", job: "the IT Specialist" },
  { slug: "hr_policy", name: "Hana", job: "the HR Policy Expert" },
  { slug: "action", name: "Atlas", job: "the Task Doer" },
  { slug: "ticketing", name: "Tess", job: "the Case Handler" },
  { slug: "feedback", name: "Finn", job: "the Quality Keeper" },
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

  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => setPulseTrigger((n) => n + 1), 2600);
    return () => clearInterval(interval);
  }, [reduceMotion]);

  return (
    <div>
      <header
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 10,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "var(--space-4) var(--space-6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <img src={amperaLogo} alt="Ampera" style={{ height: 24, width: "auto" }} />
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 16, color: "var(--text-secondary)" }}>
            Helpdesk
          </span>
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          <ReduceMotionToggle />
          <Button variant="ghost" onClick={() => navigate("/login")}>
            Sign in
          </Button>
        </div>
      </header>

      <section style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <Scene cameraPosition={[0, 0, 11]} bloom>
            <ParticleField />
            <AgentOrb agent="supervisor" position={[0, -0.3, -9]} active radius={0.4} />
            <AgentOrb agent="it_support" position={[-10, 2.6, -9]} radius={0.5} />
            <AgentOrb agent="hr_policy" position={[10, 2.6, -9]} radius={0.5} />
            <AgentOrb agent="action" position={[-10.5, -3, -10]} radius={0.42} />
            <AgentOrb agent="ticketing" position={[10.5, -3, -10]} radius={0.42} />
            <AgentOrb agent="feedback" position={[-8, -3.8, -8]} radius={0.32} />
            <AgentOrb agent="guard" position={[8, 4, -8]} radius={0.32} />
            <DataPulse from={[0, -0.3, -9]} to={[-10, 2.6, -9]} trigger={pulseTrigger} color={AGENT_COLORS.it_support} />
            <DataPulse from={[0, -0.3, -9]} to={[10, 2.6, -9]} trigger={pulseTrigger} color={AGENT_COLORS.hr_policy} />
            <RoboCompanion position={[-4.2, -1.4, -3]} scale={1.4} color="#94a3b8" accentColor="#5da9c9" />
          </Scene>
        </div>

        {/* A dark radial scrim between the 3D scene and the text so the headline stays legible
            regardless of where an orb drifts, without needing the orbs to dodge the text column. */}
        <div
          style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse 70% 62% at 50% 46%, rgba(5,6,15,0.92) 0%, rgba(5,6,15,0.55) 55%, rgba(5,6,15,0) 100%)",
          }}
        />

        <div
          style={{
            position: "relative", zIndex: 1, height: "100%",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            textAlign: "center", padding: "0 var(--space-6)", gap: "var(--space-5)",
          }}
        >
          {reduceMotion ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-4)" }}>
              <h1 style={{ fontSize: "clamp(32px, 6vw, 64px)", maxWidth: 900, lineHeight: 1.05 }}>
                Your helpdesk, staffed by a team of AI agents.
              </h1>
              <p style={{ fontSize: 18, maxWidth: 640 }}>
                Real IT and HR answers, grounded in your own knowledge base — routed, resolved, and
                escalated by seven cooperating agents you can watch work in real time.
              </p>
              <Button variant="primary" onClick={() => navigate("/login")} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                Try the demo <ArrowRight size={16} />
              </Button>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer(0.12)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-4)" }}
            >
              <motion.h1
                variants={fadeUp}
                style={{ fontSize: "clamp(32px, 6vw, 64px)", maxWidth: 900, lineHeight: 1.05 }}
              >
                Your helpdesk, staffed by a team of AI agents.
              </motion.h1>
              <motion.p variants={fadeUp} style={{ fontSize: 18, maxWidth: 640 }}>
                Real IT and HR answers, grounded in your own knowledge base — routed, resolved, and
                escalated by seven cooperating agents you can watch work in real time.
              </motion.p>
              <motion.div variants={fadeUp}>
                <Button variant="primary" onClick={() => navigate("/login")} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  Try the demo <ArrowRight size={16} />
                </Button>
              </motion.div>
            </motion.div>
          )}
        </div>

        {!reduceMotion && (
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", bottom: "var(--space-6)", left: "50%", transform: "translateX(-50%)", color: "var(--text-muted)" }}
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
          {TEAM.map((agent) => (
            <Reveal key={agent.slug}>
              <Panel style={{ padding: "var(--space-5)", height: "100%" }}>
                <div
                  style={{
                    width: 48, height: 48, borderRadius: "50%", marginBottom: "var(--space-3)",
                    background: AGENT_COLORS[agent.slug],
                    boxShadow: `0 0 24px ${AGENT_COLORS[agent.slug]}66`,
                  }}
                />
                <h3 style={{ fontSize: 18, marginBottom: 2 }}>{agent.name}</h3>
                <p style={{ fontSize: 14 }}>{agent.job}</p>
              </Panel>
            </Reveal>
          ))}
        </div>
      </section>

      <section style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1100, margin: "0 auto" }}>
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
