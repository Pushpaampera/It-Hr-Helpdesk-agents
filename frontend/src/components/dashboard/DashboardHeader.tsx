/** Reusable page header: a back arrow (every page except Overview, the dashboard's home), a
 * time-of-day greeting with the current user's first name, the page title as the page's <h1>,
 * and a one-line description. Used at the top of every dashboard page. */
import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "../../store/authStore";

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

  const firstName = user?.name?.split(" ")[0];
  const showBack = location.pathname !== "/app/overview";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
      {showBack && (
        <button
          onClick={() => navigate("/app/overview")}
          aria-label="Back to Overview"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            width: 44, height: 44, borderRadius: "var(--radius-full)",
            border: "1px solid var(--border-strong)", background: "var(--bg-elevated)",
            color: "var(--text-primary)", cursor: "pointer",
          }}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      )}
      <div>
        {firstName && (
          <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: 2 }}>
            {timeOfDayGreeting()}, {firstName}
          </div>
        )}
        <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-1)" }}>{title}</h1>
        <p style={{ margin: 0 }}>{subtitle}</p>
      </div>
    </div>
  );
}
