/** Reusable animated page header: a time-of-day greeting with the current user's first name, a
 * role-aware subtitle, and a small waving-then-idle AgentMascot — used at the top of every
 * dashboard page in place of a plain <h1>+<p>. */
import { useEffect, useState } from "react";

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
  const [mascotState, setMascotState] = useState<RoboState>("waving");

  useEffect(() => {
    const timeout = setTimeout(() => setMascotState("idle"), 1200);
    return () => clearTimeout(timeout);
  }, []);

  const firstName = user?.name?.split(" ")[0];

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
      <div>
        {firstName && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>
            {timeOfDayGreeting()}, {firstName}
          </div>
        )}
        <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>{title}</h1>
        <p style={{ margin: 0 }}>{subtitle}</p>
      </div>
      <AgentMascot agent="supervisor" state={mascotState} size={64} />
    </div>
  );
}
