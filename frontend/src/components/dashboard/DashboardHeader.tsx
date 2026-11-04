/** Reusable animated page header: a back arrow (every page except Overview, the dashboard's
 * home), a time-of-day greeting with the current user's first name, a role-aware subtitle, and
 * a small waving-then-idle AgentMascot — used at the top of every dashboard page in place of a
 * plain <h1>+<p>. */
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "../../store/authStore";
import AgentMascot from "../../three/AgentMascot";
import type { RoboState } from "../../three/RoboCompanion";

type DashboardHeaderProps = {
  title: string;
  subtitle: string;
};

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardHeader({ title, subtitle }: DashboardHeaderProps) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const [mascotState, setMascotState] = useState<RoboState>("waving");

  useEffect(() => {
    const timeout = setTimeout(() => setMascotState("idle"), 1200);
    return () => clearTimeout(timeout);
  }, []);

  const firstName = user?.name?.split(" ")[0];
  const showBack = location.pathname !== "/app/overview";

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {showBack && (
          <button
            onClick={() => navigate("/app/overview")}
            aria-label="Back to Overview"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              width: 36, height: 36, borderRadius: "var(--radius-full)",
              border: "1px solid var(--border-subtle)", background: "var(--bg-panel)",
              color: "var(--text-secondary)", cursor: "pointer",
            }}
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div>
          {firstName && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>
              {timeOfDayGreeting()}, {firstName}
            </div>
          )}
          <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>{title}</h1>
          <p style={{ margin: 0 }}>{subtitle}</p>
        </div>
      </div>
      <AgentMascot agent="supervisor" state={mascotState} size={64} />
    </div>
  );
}
