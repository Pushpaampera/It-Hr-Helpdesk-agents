/** Labels and badge tones for confidential HR cases, shared by the employee "Talk to HR" page,
 * HR's "Private Cases" page and the chat's redirect card. */
import type { HrCase, HrCaseCategory, HrCaseStatus } from "../../api/types";

export const CATEGORY_OPTIONS: { value: HrCaseCategory; label: string; hint: string }[] = [
  { value: "colleague_conflict", label: "Conflict with a colleague", hint: "Arguments, fights, someone being rude or hostile" },
  { value: "manager_concern", label: "Concern about my manager", hint: "Goes to HR, never to your manager" },
  { value: "harassment", label: "Harassment or bullying", hint: "Including sexual harassment and intimidation" },
  { value: "discrimination", label: "Discrimination", hint: "Treated unfairly because of who you are" },
  { value: "misconduct", label: "Misconduct or wrongdoing", hint: "Fraud, theft, breaking the code of conduct" },
  { value: "personal_wellbeing", label: "Personal or wellbeing matter", hint: "Stress, health, family or personal difficulties" },
  { value: "safety", label: "My safety", hint: "Threats, violence or feeling unsafe. Always urgent" },
  { value: "other", label: "Something else", hint: "Anything you'd rather discuss with HR privately" },
];

export const CATEGORY_LABEL: Record<HrCaseCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<HrCaseCategory, string>;

export const STATUS_OPTIONS: { value: HrCaseStatus; label: string }[] = [
  { value: "received", label: "Received" },
  { value: "in_review", label: "Being looked into" },
  { value: "waiting_on_employee", label: "Waiting for employee" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export const CONTACT_LABEL: Record<HrCase["preferred_contact"], string> = {
  portal: "Reply here on the portal",
  email: "Email",
  phone: "Phone call",
  in_person: "Meet in person",
};

export function statusTone(status: HrCaseStatus): "success" | "warning" | "info" | "neutral" {
  if (status === "resolved" || status === "closed") return "success";
  if (status === "waiting_on_employee") return "warning";
  if (status === "in_review") return "info";
  return "neutral";
}

/** True when the employee wrote last and HR hasn't answered yet. */
export function needsHrReply(c: HrCase): boolean {
  return c.status !== "closed" && c.status !== "resolved" && (c.last_author_role === "employee" || c.status === "received");
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
