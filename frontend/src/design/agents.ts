/** Single source of truth for the seven agents' identity — name, role, color, and robot look.
 * Backend route keys (left) never change; everything display-facing (name/color/robot shape)
 * lives here so it's one file to edit, not five (tokens.css's --agent-* still mirrors the hex
 * values by hand, since CSS custom properties can't be read into a Three.js/recharts color prop
 * directly — see HANDOFF.md's "Known issues" for why that duplication exists at all). */

export type AgentKey =
  | "supervisor"
  | "it_support"
  | "hr_policy"
  | "action"
  | "ticketing"
  | "feedback"
  | "guard";

export type RobotKind = "dome" | "boxy" | "rounded" | "sturdy" | "slim" | "petite" | "shielded";

export type AgentIdentity = {
  key: AgentKey;
  name: string;
  role: string;
  color: string;
  accent: string;
  robot: RobotKind;
  accessory: string;
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
    color: "#8b5cf6",
    accent: "#c4b5fd",
    robot: "dome",
    accessory: "command antenna",
    sampleLine: "Routing your question to the right specialist…",
  },
  it_support: {
    key: "it_support",
    name: "Iris",
    role: "IT Support",
    color: "#38bdf8",
    accent: "#bae6fd",
    robot: "boxy",
    accessory: "headset",
    sampleLine: "Checking that error code against known fixes…",
  },
  hr_policy: {
    key: "hr_policy",
    name: "Hana",
    role: "HR Policy",
    color: "#f472b6",
    accent: "#fbcfe8",
    robot: "rounded",
    accessory: "clipboard",
    sampleLine: "Looking up the leave policy for you…",
  },
  action: {
    key: "action",
    name: "Atlas",
    role: "Actions",
    color: "#fb923c",
    accent: "#fed7aa",
    robot: "sturdy",
    accessory: "tool arm",
    sampleLine: "Running that action now…",
  },
  ticketing: {
    key: "ticketing",
    name: "Tess",
    role: "Tickets",
    color: "#2dd4bf",
    accent: "#99f6e4",
    robot: "slim",
    accessory: "ticket badge",
    sampleLine: "Opening a ticket so this gets tracked…",
  },
  feedback: {
    key: "feedback",
    name: "Finn",
    role: "Feedback",
    color: "#fbbf24",
    accent: "#fde68a",
    robot: "petite",
    accessory: "star",
    sampleLine: "Thanks — logging your feedback…",
  },
  guard: {
    key: "guard",
    name: "Gus",
    role: "Privacy",
    color: "#fb7185",
    accent: "#fecdd3",
    robot: "shielded",
    accessory: "shield",
    sampleLine: "Making sure this request is allowed…",
  },
};

export const AGENT_COLORS: Record<string, string> = Object.fromEntries(
  Object.values(AGENTS).map((a) => [a.key, a.color]),
);

export const AGENT_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(AGENTS).map((a) => [a.key, a.name]),
);
