/** Single source of truth for the seven agents' identity — name, role and colour. Backend route
 * keys (left) never change; everything display-facing lives here. `color` mirrors the --agent-*
 * tokens in tokens.css (light theme; all seven share Ampera magenta) for the rare place a CSS
 * variable can't be used. On screen, use the theme-aware var(--agent-*) instead. Who is speaking is
 * shown by name and initial, never by colour alone. */

export type AgentKey =
  | "supervisor"
  | "it_support"
  | "hr_policy"
  | "action"
  | "ticketing"
  | "feedback"
  | "guard";

export type AgentIdentity = {
  key: AgentKey;
  name: string;
  role: string;
  color: string;
  accent: string;
  sampleLine: string;
};

export const AGENT_ORDER: AgentKey[] = [
  "supervisor",
  "it_support",
  "hr_policy",
  "action",
  "ticketing",
  "feedback",
  "guard",
];

export const AGENTS: Record<AgentKey, AgentIdentity> = {
  supervisor: {
    key: "supervisor",
    name: "Sage",
    role: "Router",
    color: "#9c369a",
    accent: "#f7edf7",
    sampleLine: "Routing your question to the right specialist…",
  },
  it_support: {
    key: "it_support",
    name: "Iris",
    role: "IT Support",
    color: "#9c369a",
    accent: "#f7edf7",
    sampleLine: "Checking that error code against known fixes…",
  },
  hr_policy: {
    key: "hr_policy",
    name: "Hana",
    role: "HR Policy",
    color: "#9c369a",
    accent: "#f7edf7",
    sampleLine: "Looking up the leave policy for you…",
  },
  action: {
    key: "action",
    name: "Atlas",
    role: "Actions",
    color: "#9c369a",
    accent: "#f7edf7",
    sampleLine: "Running that action now…",
  },
  ticketing: {
    key: "ticketing",
    name: "Tess",
    role: "Tickets",
    color: "#9c369a",
    accent: "#f7edf7",
    sampleLine: "Opening a ticket so this gets tracked…",
  },
  feedback: {
    key: "feedback",
    name: "Finn",
    role: "Feedback",
    color: "#9c369a",
    accent: "#f7edf7",
    sampleLine: "Thanks — logging your feedback…",
  },
  guard: {
    key: "guard",
    name: "Gus",
    role: "Privacy",
    color: "#9c369a",
    accent: "#f7edf7",
    sampleLine: "Making sure this request is allowed…",
  },
};

export const AGENT_COLORS: Record<string, string> = Object.fromEntries(
  Object.values(AGENTS).map((a) => [a.key, a.color]),
);

export const AGENT_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(AGENTS).map((a) => [a.key, a.name]),
);
