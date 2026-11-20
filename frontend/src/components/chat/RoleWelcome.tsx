/** The empty-state welcome on the Ask the Assistant page, styled per role: a coloured role icon
 * and "<Role> view" badge, then the role's starter questions, either as large tiles (employee)
 * or as topic cards (HR, admin). A role can also get a live card showing how many access
 * requests are waiting. The --role-colour custom property drives every accent below,
 * so the look follows the role without per-role CSS. */
import { ArrowRight, CheckSquare } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { apiGet } from "../../api/client";
import type { Approval } from "../../api/types";
import type { RoleAssistantConfig, StarterQuestion } from "./roleAssistant";

type Props = {
  config: RoleAssistantConfig;
  firstName?: string;
  disabled: boolean;
  onAsk: (question: string) => void;
};

export default function RoleWelcome({ config, firstName, disabled, onAsk }: Props) {
  const RoleIcon = config.icon;
  return (
    <div className="role-welcome" style={{ "--role-colour": config.color } as CSSProperties}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
        <div className="role-welcome__icon" aria-hidden="true">
          <RoleIcon size={28} />
        </div>
        <div style={{ minWidth: 0 }}>
          <span className="role-welcome__badge">{config.label}</span>
          <h2 style={{ fontSize: "1.25rem", margin: "4px 0 2px" }}>{firstName ? `Hi ${firstName}!` : "Hi there!"}</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{config.intro}</p>
        </div>
      </div>

      {config.layout === "tiles" ? (
        <div className="role-welcome__tiles">
          {config.groups.flatMap((g) => g.items).map((item) => (
            <StarterButton key={item.q} item={item} variant="tile" disabled={disabled} onAsk={onAsk} />
          ))}
        </div>
      ) : config.groups.length === 0 && !config.showApprovalsCard ? null : (
        <div className="role-welcome__groups">
          {config.groups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section key={group.title} className="role-welcome__group">
                <h3 className="role-welcome__group-title">
                  <GroupIcon size={16} aria-hidden="true" /> {group.title}
                </h3>
                <div style={{ display: "grid", gap: "var(--space-2)" }}>
                  {group.items.map((item) => (
                    <StarterButton key={item.q} item={item} variant="row" disabled={disabled} onAsk={onAsk} />
                  ))}
                </div>
              </section>
            );
          })}
          {config.showApprovalsCard && <ApprovalsCard />}
        </div>
      )}
    </div>
  );
}

function StarterButton({ item, variant, disabled, onAsk }: { item: StarterQuestion; variant: "tile" | "row"; disabled: boolean; onAsk: (q: string) => void }) {
  const Icon = item.icon;
  return (
    <button type="button" className={`role-welcome__starter role-welcome__starter--${variant}`} onClick={() => onAsk(item.q)} disabled={disabled}>
      <span className="role-welcome__starter-icon" aria-hidden="true">
        <Icon size={variant === "tile" ? 20 : 16} />
      </span>
      <span style={{ display: "grid", gap: 2, textAlign: "left" }}>
        {item.tag && <span className="role-welcome__tag">{item.tag}</span>}
        <span>{item.q}</span>
      </span>
    </button>
  );
}

function ApprovalsCard() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    apiGet<Approval[]>("/approvals?status=pending").then((a) => setCount(a.length)).catch(() => setCount(null));
  }, []);
  return (
    <section className="role-welcome__group role-welcome__group--highlight">
      <h3 className="role-welcome__group-title">
        <CheckSquare size={16} aria-hidden="true" /> Approvals
      </h3>
      <p style={{ fontSize: "2rem", fontWeight: 700, lineHeight: 1.1, color: "var(--role-colour)" }}>{count ?? "–"}</p>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "var(--space-3)" }}>
        access {count === 1 ? "request is" : "requests are"} waiting
      </p>
      <Link to="/app/approvals" style={{ fontSize: "0.875rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
        Review now <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
