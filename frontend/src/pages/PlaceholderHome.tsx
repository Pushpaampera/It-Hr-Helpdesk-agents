import { useEffect, useState } from "react";

import apiFetch from "../api/client";
import type { HealthResponse } from "../api/types";
import ReduceMotionToggle from "../components/ReduceMotionToggle";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Panel from "../components/ui/Panel";
import AgentOrb, { AGENT_COLORS } from "../three/AgentOrb";
import DataPulse from "../three/DataPulse";
import ParticleField from "../three/ParticleField";
import Scene from "../three/Scene";

/** Phase 1's health-check placeholder, extended in Phase 5 to also exercise every new design-
 * system / 3D building block (design tokens, Button/Badge/Panel, Scene + AgentOrb + DataPulse +
 * ParticleField, the Reduce motion toggle) before Phase 6 replaces this page outright with the
 * real cinematic landing page. */
export default function PlaceholderHome() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulseTrigger, setPulseTrigger] = useState(0);

  useEffect(() => {
    apiFetch<HealthResponse>("/health")
      .then(setHealth)
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setPulseTrigger((n) => n + 1), 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ minHeight: "100%", padding: "var(--space-7) var(--space-6)", display: "grid", gap: "var(--space-6)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: "var(--space-1)" }}>Helpdesk AI Agents</h1>
          <p>Design system + 3D building blocks online (Phase 5). Replaced by the landing page in Phase 6.</p>
        </div>
        <ReduceMotionToggle />
      </div>

      <Panel style={{ padding: "var(--space-5)" }}>
        <h2 style={{ fontSize: 16, marginBottom: "var(--space-4)", color: "var(--text-secondary)" }}>Backend status</h2>
        <div style={{ display: "grid", gap: "var(--space-3)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
          <Row label="Backend" value={health ? health.status : error ? "unreachable" : "checking..."} />
          <Row label="Database" value={health ? (health.database.connected ? "connected" : health.database.detail) : "-"} />
          <Row label="pgvector" value={health ? (health.pgvector.enabled ? "enabled" : health.pgvector.detail) : "-"} />
          <Row label="Mock mode" value={health ? String(health.mock_mode) : "-"} />
        </div>
      </Panel>

      <Panel style={{ padding: "var(--space-5)" }}>
        <h2 style={{ fontSize: 16, marginBottom: "var(--space-4)", color: "var(--text-secondary)" }}>UI atoms</h2>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="primary">Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Badge label="resolved" tone="success" />
          <Badge label="escalated" tone="warning" />
          <Badge label="blocked" tone="danger" />
          <Badge label="pending" tone="info" />
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginTop: "var(--space-4)" }}>
          {Object.entries(AGENT_COLORS).map(([agent, color]) => (
            <div key={agent} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: color }} />
              {agent}
            </div>
          ))}
        </div>
      </Panel>

      <Panel style={{ padding: 0, height: 360, overflow: "hidden" }}>
        <Scene cameraPosition={[0, 0, 7]}>
          <ParticleField />
          <AgentOrb agent="supervisor" position={[0, 0, 0]} active />
          <AgentOrb agent="it_support" position={[-2.4, 1.1, -1]} />
          <AgentOrb agent="hr_policy" position={[2.4, 1.1, -1]} />
          <AgentOrb agent="action" position={[-1.6, -1.4, -1.5]} />
          <AgentOrb agent="ticketing" position={[1.6, -1.4, -1.5]} />
          <DataPulse from={[0, 0, 0]} to={[-2.4, 1.1, -1]} trigger={pulseTrigger} color={AGENT_COLORS.it_support} />
          <DataPulse from={[0, 0, 0]} to={[2.4, 1.1, -1]} trigger={pulseTrigger} color={AGENT_COLORS.hr_policy} />
        </Scene>
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
