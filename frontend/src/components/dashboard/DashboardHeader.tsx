/** Reusable page header: a back arrow (every page except Overview, the dashboard's home), a
 * time-of-day greeting with the current user's first name, the page title as the page's <h1>,
 * and a one-line description. Used at the top of every dashboard page.
 *
 * On Overview (the dashboard's home) it is drawn as the navy welcome banner from the Ampera
 * Campus Hire portal: a small date line, the greeting as the <h1>, the description and a magenta
 * "Ask the Assistant" button. */
import { ArrowLeft, MessageCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "../../store/authStore";

type DashboardHeaderProps = {
  title: string;
  subtitle: string;
  /** Overview only: false draws the plain header instead of the navy welcome banner. */
  hero?: boolean;
};

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardHeader({ title, subtitle, hero = true }: DashboardHeaderProps) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();

  const firstName = user?.name?.split(" ")[0];
  const isHome = location.pathname === "/app/overview";
  const showBack = !isHome;

  if (isHome && hero) {
    const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    return (
      <section
        aria-labelledby="page-title"
        data-on-navy=""
        style={{
          background: "var(--banner-bg)", color: "var(--banner-text)", borderRadius: "var(--radius-lg)",
          padding: "var(--space-6) var(--space-6)", marginBottom: "var(--space-5)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-5)", flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--banner-text-muted)", marginBottom: "var(--space-2)" }}>
            Ampera HelpDesk · {today}
          </div>
          <h1 id="page-title" style={{ fontSize: "clamp(1.5rem, 2.6vw, 2rem)", fontWeight: 500, color: "var(--banner-text)", marginBottom: "var(--space-2)" }}>
            {firstName ? `${timeOfDayGreeting()}, ${firstName}` : title}
          </h1>
          <p style={{ margin: 0, color: "var(--banner-text-muted)" }}>{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/assistant")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "var(--space-2)", minHeight: 48,
            padding: "0 var(--space-5)", borderRadius: "var(--radius-full)", border: "2px solid var(--accent-primary)",
            background: "var(--accent-primary)", color: "var(--text-on-accent)", fontWeight: 600, fontSize: "0.9375rem",
          }}
        >
          <MessageCircle size={18} aria-hidden="true" />
          Ask the Assistant
        </button>
      </section>
    );
  }

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
