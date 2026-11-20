/** Per-role setup for the Ask the Assistant page. Every role talks to the same agent graph with the
 * same knowledge (see backend/app/agents/guard.py for the only role-based rule), but each role
 * gets its own colour, icon, welcome, grouped starter questions and side panel, so the page fits
 * the job the person is actually doing. Starter questions are matched to real knowledge-base
 * articles (backend/app/seed/generators/knowledge.py) so none of them dead-end. */
import {
  Baby, Banknote, BookOpen, CalendarDays, CalendarPlus, ClipboardList, FileSearch,
  HeartPulse, KeyRound, Laptop, LifeBuoy, Lock, Receipt, Repeat, ShieldCheck,
  Stethoscope, Wifi, Wrench, type LucideIcon,
} from "lucide-react";

import type { Role } from "../../api/types";

export type StarterQuestion = { q: string; icon: LucideIcon; /** short label shown above the question (admin test cases) */ tag?: string };
export type StarterGroup = { title: string; icon: LucideIcon; items: StarterQuestion[] };

export type RoleAssistantConfig = {
  /** "Employee view", shown as a badge next to the greeting */
  label: string;
  /** CSS colour token for this role (see design/tokens.css --role-*) */
  color: string;
  icon: LucideIcon;
  subtitle: string;
  banner: string;
  /** Second line under "Hi <name>" in the welcome block */
  intro: string;
  /** "tiles" = large simple tiles (employee); "groups" = topic cards with rows */
  layout: "tiles" | "groups";
  groups: StarterGroup[];
  /** Show a live "access requests waiting" card next to the topic groups. */
  showApprovalsCard: boolean;
  /** Admins see the full multi-agent routing chain on each answer; everyone else just sees who answered. */
  showRoutingChain: boolean;
};

export const ROLE_ASSISTANT: Record<Role, RoleAssistantConfig> = {
  employee: {
    label: "Employee view",
    color: "var(--role-employee)",
    icon: LifeBuoy,
    subtitle: "Get help with your laptop, accounts, leave or company policies.",
    banner:
      "Ask in your own words. The assistant will try to fix it right away and check whether it worked. If it didn't, it can raise a ticket so a person can help.",
    intro: "What do you need help with today? Tap a common problem or type your own.",
    layout: "tiles",
    groups: [
      {
        title: "Common requests",
        icon: LifeBuoy,
        items: [
          { q: "My laptop won't connect to the VPN, error 619", icon: Laptop },
          { q: "I'm having Wi-Fi problems on my laptop", icon: Wifi },
          { q: "How do I reset my password?", icon: KeyRound },
          { q: "How many sick days do I have left?", icon: HeartPulse },
          { q: "I'd like to take 2 days of annual leave next week", icon: CalendarPlus },
          { q: "I need write access to Jira for my project", icon: Lock },
        ],
      },
    ],
    showApprovalsCard: false,
    showRoutingChain: false,
  },
  // IT support has the same everyday needs as any employee: leave, pay, policies, HR.
  it_support: {
    label: "IT Support view",
    color: "var(--role-it-support)",
    icon: Wrench,
    subtitle: "Your own questions: leave, pay, policies and anything you need from HR.",
    banner:
      "This is for your own questions, like any employee. It can check your leave, apply for leave and answer policy questions. If it can't help, it raises a ticket for HR or an admin. For something private, use Talk to HR.",
    intro: "What do you need for yourself today?",
    layout: "groups",
    groups: [
      {
        title: "Leave",
        icon: CalendarDays,
        items: [
          { q: "How many leave days do I have left?", icon: CalendarDays },
          { q: "I'd like to take 2 days of annual leave next week", icon: CalendarPlus },
          { q: "How much annual leave can be carried forward?", icon: Repeat },
        ],
      },
      {
        title: "Pay and policies",
        icon: BookOpen,
        items: [
          { q: "When are the pay dates this month?", icon: Banknote },
          { q: "What's the work from home policy?", icon: Laptop },
          { q: "How do I claim travel expenses?", icon: Receipt },
        ],
      },
    ],
    showApprovalsCard: false,
    showRoutingChain: false,
  },
  hr: {
    label: "HR view",
    color: "var(--role-hr)",
    icon: HeartPulse,
    subtitle: "Look up policies and employee leave, and answer HR questions quickly.",
    banner:
      "As HR you can ask about a named employee's leave or personal records. Requests for many people's private data at once are still blocked.",
    intro: "Look up a policy or an employee's records.",
    layout: "groups",
    groups: [
      {
        title: "Policies",
        icon: BookOpen,
        items: [
          { q: "What's the parental leave policy?", icon: Baby },
          { q: "How is parental leave pay calculated?", icon: Banknote },
          { q: "Does sick or casual leave carry forward too?", icon: Repeat },
          { q: "What's the policy on extended sick leave?", icon: Stethoscope },
        ],
      },
      {
        title: "Employee records",
        icon: FileSearch,
        items: [
          { q: "What is Priya's leave balance?", icon: CalendarDays },
          { q: "How does an employee change their salary bank account?", icon: Banknote },
        ],
      },
    ],
    showApprovalsCard: false,
    showRoutingChain: false,
  },
  admin: {
    label: "Admin view",
    color: "var(--role-admin)",
    icon: ShieldCheck,
    subtitle: "Test the assistant end to end and watch every AI agent work in real time.",
    banner:
      "Admin view: the panel on the right shows each agent's live status and every step it takes. Answers also show the full chain of agents that handled them.",
    intro: "Ask a question below and watch each agent work in the panel on the right.",
    layout: "groups",
    groups: [],
    showApprovalsCard: false,
    showRoutingChain: true,
  },
};
