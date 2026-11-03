/** Role-aware sidebar navigation, per docs/00_PROJECT_OVERVIEW.md's role list. Overview, AI
 * Assistant (Phase 9), and Tickets/Approvals/Team/HR Insights/Policy KB (Phase 10) are
 * `implemented`; Control Room/Reinforcement Lab/Evaluation/Costs/Audit Log stay disabled
 * "Soon" entries until Phase 10B/11 builds them. */
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
  { label: "Tickets", path: "/app/tickets", icon: Ticket, roles: ALL_ROLES, implemented: true },
  { label: "Approvals", path: "/app/approvals", icon: CheckSquare, roles: ["manager", "admin"], implemented: true },
  { label: "Team", path: "/app/team", icon: Users, roles: ["manager"], implemented: true },
  { label: "HR Insights", path: "/app/hr-insights", icon: HeartHandshake, roles: ["hr"], implemented: true },
  { label: "Policy Knowledge Base", path: "/app/kb", icon: BookOpen, roles: ["hr", "admin"], implemented: true },
  { label: "Control Room", path: "/app/control-room", icon: Radar, roles: ["admin"], implemented: false },
  { label: "Reinforcement Lab", path: "/app/reinforcement-lab", icon: Brain, roles: ["admin"], implemented: false },
  { label: "Evaluation", path: "/app/evaluation", icon: ClipboardCheck, roles: ["admin"], implemented: false },
  { label: "Costs", path: "/app/costs", icon: DollarSign, roles: ["admin"], implemented: false },
  { label: "Audit Log", path: "/app/audit-log", icon: ScrollText, roles: ["admin"], implemented: false },
];
