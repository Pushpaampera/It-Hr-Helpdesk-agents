/** A flat, round avatar for one of the seven agents: their first letter on their colour. Used
 * wherever the old 3D robot mascots used to appear. Decorative by default (the agent's name is
 * always written next to it), so it is hidden from screen readers unless `label` is given. */
import type { CSSProperties } from "react";

import { AGENTS, type AgentKey } from "../../design/agents";

type AgentAvatarProps = {
  agent: AgentKey;
  size?: number;
  label?: string;
  style?: CSSProperties;
};

export default function AgentAvatar({ agent, size = 40, label, style }: AgentAvatarProps) {
  const identity = AGENTS[agent];
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        width: size, height: size, borderRadius: "50%",
        background: `var(--agent-${agent})`, color: "var(--text-on-accent)",
        fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: size * 0.42, lineHeight: 1,
        ...style,
      }}
    >
      {identity.name.charAt(0)}
    </span>
  );
}
