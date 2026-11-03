/** Role-aware sidebar navigation, per docs/00_PROJECT_OVERVIEW.md's role list. `Overview`
 * (Phase 8) and `AI Assistant` (Phase 9) are `implemented`; the rest render as disabled "Soon"
 * entries so the shell shows the full intended structure without inventing page content ahead
 * of its own phase (Tickets/Approvals/Team/HR Insights/Policy KB are Phase 10; Control Room/
 * Reinforcement Lab/Evaluation/Costs/Audit Log are Phase 10/11). */
import {
  BookOpen, Brain, CheckSquare, ClipboardCheck, DollarSign, HeartHandshake,
  LayoutDashboard, MessageCircle, Radar, ScrollText, Ticket, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Role } from "../api/types";

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: Role[];
  implemented: boolean;
};

const ALL_ROLES: Role[] = ["employee", "manager", "hr", "admin"];

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", path: "/app/overview", icon: LayoutDashboard, roles: ALL_ROLES, implemented: true },
  { label: "AI Assistant", path: "/app/assistant", icon: MessageCircle, roles: ALL_ROLES, implemented: true },
  { label: "Tickets", path: "/app/tickets", icon: Ticket, roles: ALL_ROLES, implemented: false },
  { label: "Approvals", path: "/app/approvals", icon: CheckSquare, roles: ["manager", "admin"], implemented: false },
  { label: "Team", path: "/app/team", icon: Users, roles: ["manager"], implemented: false },
  { label: "HR Insights", path: "/app/hr-insights", icon: HeartHandshake, roles: ["hr"], implemented: false },
  { label: "Policy Knowledge Base", path: "/app/kb", icon: BookOpen, roles: ["hr", "admin"], implemented: false },
  { label: "Control Room", path: "/app/control-room", icon: Radar, roles: ["admin"], implemented: false },
  { label: "Reinforcement Lab", path: "/app/reinforcement-lab", icon: Brain, roles: ["admin"], implemented: false },
  { label: "Evaluation", path: "/app/evaluation", icon: ClipboardCheck, roles: ["admin"], implemented: false },
  { label: "Costs", path: "/app/costs", icon: DollarSign, roles: ["admin"], implemented: false },
  { label: "Audit Log", path: "/app/audit-log", icon: ScrollText, roles: ["admin"], implemented: false },
];
