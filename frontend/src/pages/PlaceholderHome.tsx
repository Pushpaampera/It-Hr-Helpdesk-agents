import { useEffect, useState } from "react";

type HealthResponse = {
  status: string;
  mock_mode: boolean;
  database: { connected: boolean; detail: string };
  pgvector: { enabled: boolean; detail: string };
};

export default function PlaceholderHome() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-6)",
      }}
    >
      <div className="glass-panel" style={{ padding: "var(--space-6)", maxWidth: 560 }}>
        <h1 style={{ fontSize: 28, marginBottom: "var(--space-2)" }}>Helpdesk AI Agents</h1>
        <p style={{ marginBottom: "var(--space-5)" }}>
          Foundation scaffold online. This page will become the cinematic landing experience in
          Phase 6.
        </p>

        <div
          style={{
            display: "grid",
            gap: "var(--space-3)",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
          }}
        >
          <Row label="Backend" value={health ? health.status : error ? "unreachable" : "checking..."} />
          <Row
            label="Database"
            value={health ? (health.database.connected ? "connected" : health.database.detail) : "-"}
          />
          <Row
            label="pgvector"
            value={health ? (health.pgvector.enabled ? "enabled" : health.pgvector.detail) : "-"}
          />
          <Row label="Mock mode" value={health ? String(health.mock_mode) : "-"} />
        </div>
      </div>
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
