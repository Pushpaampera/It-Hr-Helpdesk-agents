/** Role-aware sidebar navigation, per docs/00_PROJECT_OVERVIEW.md's role list. Every nav item
 * is now `implemented: true` as of Phase 11 (Control Room/Reinforcement Lab/Evaluation/Costs/
 * Audit Log, all admin-only). */
import {
  BookOpen, Brain, CheckSquare, ClipboardCheck, DollarSign, HeartHandshake,
  LayoutDashboard, LockKeyhole, MessageCircle, MessageCircleHeart, Radar, ScrollText, Ticket, Users,
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
  { label: "Ask the Assistant", path: "/app/assistant", icon: MessageCircle, roles: ALL_ROLES, implemented: true },
  { label: "Tickets", path: "/app/tickets", icon: Ticket, roles: ALL_ROLES, implemented: true },
  // Private channel to HR for complaints, conflicts and personal matters: employees and managers
  // only. HR handle these cases in "Private Cases"; admins don't use it.
  { label: "Talk to HR", path: "/app/hr-support", icon: MessageCircleHeart, roles: ["employee", "manager"], implemented: true },
  { label: "Approvals", path: "/app/approvals", icon: CheckSquare, roles: ["manager", "admin"], implemented: true },
  { label: "Team", path: "/app/team", icon: Users, roles: ["manager"], implemented: true },
  { label: "HR Dashboard", path: "/app/hr-insights", icon: HeartHandshake, roles: ["hr"], implemented: true },
  // Confidential cases: HR only. Deliberately NOT admin or manager.
  { label: "Private Cases", path: "/app/hr-cases", icon: LockKeyhole, roles: ["hr"], implemented: true },
  { label: "Company Policies", path: "/app/kb", icon: BookOpen, roles: ["hr", "admin"], implemented: true },
  { label: "Control Room", path: "/app/control-room", icon: Radar, roles: ["admin"], implemented: true },
  { label: "Reinforcement Lab", path: "/app/reinforcement-lab", icon: Brain, roles: ["admin"], implemented: true },
  { label: "Evaluation", path: "/app/evaluation", icon: ClipboardCheck, roles: ["admin"], implemented: true },
  { label: "Costs", path: "/app/costs", icon: DollarSign, roles: ["admin"], implemented: true },
  { label: "Audit Log", path: "/app/audit-log", icon: ScrollText, roles: ["admin"], implemented: true },
];
