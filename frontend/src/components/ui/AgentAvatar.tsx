/** The badge for one of the seven AI agents, used on every page that shows an agent (landing
 * page, AI Assistant, the activity panel, Control Room, ticket history).
 *
 * Built so nobody can mistake an agent for a person:
 * - a rounded square (people's avatars are circles) in a navy→magenta gradient,
 * - the agent's own icon, which says what it does (Gus a shield, Sage a network, Iris a laptop
 *   with a cog, Hana a person with a book, Atlas a lightning bolt, Tess a ticket, Finn a thumbs-up),
 * - a small robot badge in the corner marking it as AI (shown from 28px up; below that the shape
 *   and icon carry it).
 * Agents are told apart by icon and name, never by colour alone. Decorative by default (the
 * agent's name is always written next to it), so it is hidden from screen readers unless `label`
 * is given. Colours come from the --agent-chip-* / --agent-badge-* tokens (themes + high contrast). */
import { Bot, BookUser, MonitorCog, Network, ShieldCheck, ThumbsUp, Ticket, Zap } from "lucide-react";
import type { CSSProperties } from "react";

import type { AgentKey } from "../../design/agents";

export const AGENT_ICONS: Record<AgentKey, typeof Bot> = {
  guard: ShieldCheck, // Gus — Privacy Guardian
  supervisor: Network, // Sage — Request Router
  it_support: MonitorCog, // Iris — IT Specialist
  hr_policy: BookUser, // Hana — HR Policy Expert
  action: Zap, // Atlas — Task Doer
  ticketing: Ticket, // Tess — Case Handler
  feedback: ThumbsUp, // Finn — Quality Keeper
};

type AgentAvatarProps = {
  agent: AgentKey;
  size?: number;
  label?: string;
  style?: CSSProperties;
};

export default function AgentAvatar({ agent, size = 40, label, style }: AgentAvatarProps) {
  const Icon = AGENT_ICONS[agent];
  const showBadge = size >= 28;
  const badge = Math.round(Math.max(size * 0.44, 14));

  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ position: "relative", display: "inline-flex", flexShrink: 0, width: size, height: size, ...style }}
    >
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: size, height: size, borderRadius: Math.round(size * 0.3),
          background: "var(--agent-chip-bg)", color: "var(--agent-chip-icon)",
        }}
      >
        <Icon size={Math.round(size * 0.54)} strokeWidth={2.1} />
      </span>
      {showBadge && (
        <span
          style={{
            position: "absolute", right: -Math.round(badge * 0.28), bottom: -Math.round(badge * 0.28),
            width: badge, height: badge, borderRadius: "50%",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "var(--agent-badge-bg)", color: "var(--agent-badge-icon)",
            boxShadow: "0 0 0 2px var(--agent-badge-ring)",
          }}
        >
          <Bot size={Math.round(badge * 0.72)} strokeWidth={2.2} />
        </span>
      )}
    </span>
  );
}
