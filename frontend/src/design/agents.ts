/** Single source of truth for the seven agents' identity — name, role and colour. Backend route
 * keys (left) never change; everything display-facing lives here. The colours mirror the
 * --agent-* custom properties in tokens.css (CSS variables can't be read into recharts/SVG props
 * directly, so the hex values live in both places — update them together). All are readable as
 * text on white (>= 4.5:1). */

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
    color: "#5e5490",
    accent: "#e4e1ee",
    sampleLine: "Routing your question to the right specialist…",
  },
  it_support: {
    key: "it_support",
    name: "Iris",
    role: "IT Support",
    color: "#1d6fa5",
    accent: "#dbeafe",
    sampleLine: "Checking that error code against known fixes…",
  },
  hr_policy: {
    key: "hr_policy",
    name: "Hana",
    role: "HR Policy",
    color: "#b0306f",
    accent: "#fce7f3",
    sampleLine: "Looking up the leave policy for you…",
  },
  action: {
    key: "action",
    name: "Atlas",
    role: "Actions",
    color: "#b45309",
    accent: "#ffedd5",
    sampleLine: "Running that action now…",
  },
  ticketing: {
    key: "ticketing",
    name: "Tess",
    role: "Tickets",
    color: "#0f766e",
    accent: "#ccfbf1",
    sampleLine: "Opening a ticket so this gets tracked…",
  },
  feedback: {
    key: "feedback",
    name: "Finn",
    role: "Feedback",
    color: "#946200",
    accent: "#fef3c7",
    sampleLine: "Thanks — logging your feedback…",
  },
  guard: {
    key: "guard",
    name: "Gus",
    role: "Privacy",
    color: "#be3a4a",
    accent: "#ffe4e6",
    sampleLine: "Making sure this request is allowed…",
  },
};

export const AGENT_COLORS: Record<string, string> = Object.fromEntries(
  Object.values(AGENTS).map((a) => [a.key, a.color]),
);

export const AGENT_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(AGENTS).map((a) => [a.key, a.name]),
);
