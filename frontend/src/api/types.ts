/** Shapes mirrored from the backend's Pydantic response models (see docs/03_BACKEND.md's
 * endpoint table). Kept minimal — only the fields pages built so far actually read. */
export type Role = "employee" | "manager" | "hr" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  title: string;
  manager_id: string | null;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type HealthResponse = {
  status: string;
  service: string;
  mock_mode: boolean;
  database: { connected: boolean; detail: string };
  pgvector: { enabled: boolean; detail: string };
};

// GET /api/analytics/kpis (manager/hr/admin only)
export type Kpis = {
  total_runs: number;
  resolved_runs: number;
  escalated_runs: number;
  resolved_rate: number;
  escalation_rate: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  avg_rating: number;
  total_feedback: number;
  open_tickets: number;
  pending_approvals: number;
};

// GET /api/analytics/timeseries (manager/hr/admin only)
export type TimeseriesPoint = {
  day: string;
  total_runs: number;
  resolved_runs: number;
  escalated_runs: number;
  avg_rating: number | null;
};

// GET /api/tickets
export type TicketSummary = {
  id: string;
  number: string;
  user_id: string;
  user_name: string;
  category: string;
  priority: string;
  status: string;
  summary: string;
  assignee_id: string | null;
  assignee_name: string | null;
  resolved_at: string | null;
  created_at: string;
  run_id: string | null;
};

// GET /api/conversations
export type ConversationSummary = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  last_message: string | null;
  message_count: number;
};

// POST /api/conversations
export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  status: string;
  created_at: string;
};

// POST /api/chat/stream — SSE event schema, see docs/01_ARCHITECTURE.md.
export type ChatSource = { chunk_id: string; article_id: string; title: string; score: number };

export type AgentEventPayload = {
  type: "agent_event";
  run_id: string;
  seq: number;
  agent: string;
  status: "started" | "working" | "tool_call" | "retrieving" | "completed" | "handoff" | "error";
  action: string | null;
  caption: string;
  detail: Record<string, unknown>;
  model: string | null;
  latency_ms: number | null;
  tokens_in: number;
  tokens_out: number;
  ts: string;
};

export type HandoffEventPayload = {
  type: "handoff";
  run_id: string;
  seq: number;
  from: string;
  to: string;
  reason: string;
  caption: string;
  ts: string;
};

export type TokenEventPayload = { type: "token"; run_id: string; seq: number; text: string; ts: string };

export type ApprovalRequiredEventPayload = {
  type: "approval_required";
  run_id: string;
  seq: number;
  approval_id: string;
  approver_name: string;
  system: string;
  caption: string;
  ts: string;
};

export type FinalEventPayload = {
  type: "final";
  /** null for a private HR matter: those are answered without creating an agent run. */
  run_id: string | null;
  seq: number;
  answer: string;
  sources: ChatSource[];
  /** Which agent authored the answer — "it_support"/"hr_policy"/etc, or null for a guard block
   * or an unanswerable-question ticket with no specialist answer. Used to show that agent's
   * avatar/name on the chat bubble (the AI Assistant "Agent Workroom" redesign). */
  route: string | null;
  resolved: boolean;
  ticket_number: string | null;
  /** Set when the message was a private HR matter (complaint, conflict, personal issue): the
   * chat shows a "Talk to HR privately" card instead of handling it. */
  hr_redirect?: HrRedirect | null;
  ts: string | null;
};

export type ErrorEventPayload = { type: "error"; run_id: string; seq: number; message: string; ts: string };

export type ConfirmationRequiredEventPayload = {
  type: "confirmation_required";
  run_id: string;
  seq: number;
  prompt: string;
  gate: "resolution_confirm" | "ticket_offer";
  sources: ChatSource[];
  caption: string;
  ts: string;
};

export type ChatEvent =
  | AgentEventPayload
  | HandoffEventPayload
  | TokenEventPayload
  | ApprovalRequiredEventPayload
  | ConfirmationRequiredEventPayload
  | FinalEventPayload
  | ErrorEventPayload;

// POST /api/feedback
export type FeedbackResponse = { reward: number; updated_bandit: boolean };

// GET /api/tickets/{id}
export type TicketEvent = { id: string; actor: string; type: string; note: string | null; created_at: string };
export type TicketDetail = { ticket: TicketSummary; events: TicketEvent[] };

// GET /api/approvals
export type Approval = {
  id: string;
  run_id: string | null;
  requester_id: string;
  requester_name: string;
  approver_id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  comment: string | null;
  decided_at: string | null;
  created_at: string;
};

// GET /api/team (manager/admin)
export type TeamMember = {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string;
  open_tickets: number;
  total_tickets: number;
  pending_leave_requests: number;
  last_activity_at: string | null;
};

// GET /api/hr/overview (hr/admin)
export type HrOverview = {
  headcount_by_department: { department: string; count: number }[];
  leave_requests_by_status: { pending: number; approved: number; rejected: number };
  leave_balances_by_type: { leave_type: string; total_days: number; used_days: number; utilization: number }[];
  upcoming_approved_leave: {
    id: string; user_id: string; user_name: string; leave_type: string;
    start_date: string; end_date: string; days: number;
  }[];
};

// GET /api/hr/leave-requests
export type LeaveRequest = {
  id: string;
  user_id: string;
  user_name: string;
  department: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  created_at: string;
};

// GET /api/kb/search, /api/kb/compare
export type KbResult = {
  chunk_id: string;
  article_id: string;
  title: string;
  dept: string;
  category: string;
  text: string;
  score: number;
};

// GET /api/kb/articles/{id}
export type KbChunk = { id: string; chunk_index: number; text: string; metadata: Record<string, unknown> };
export type KbArticle = {
  id: string;
  dept: string;
  category: string;
  title: string;
  body: string;
  error_codes: string[] | null;
  source_name: string | null;
  version: number;
  updated_at: string;
  created_at: string;
};
export type KbArticleDetail = { article: KbArticle; chunks: KbChunk[] };

// GET /api/agents/status
export type AgentStatus = { agent: string; name: string; job: string; events_24h: number; avg_latency_ms: number; errors_24h: number };

// GET /api/agents/runs (admin)
export type RunSummary = {
  id: string;
  user_id: string;
  user_name: string;
  query: string;
  route: string | null;
  status: string;
  total_latency_ms: number | null;
  cost_usd: number;
  created_at: string;
};

// GET /api/runs/{id}/events (replay)
export type RunEventsResponse = { run_id: string; status: string; events: AgentEventPayload[] };

// GET /api/agents/live (SSE payload shape; user_id/user_name only present for admin viewers)
export type LiveAgentEvent = {
  run_id: string;
  seq: number;
  agent: string;
  status: string;
  action: string | null;
  caption: string;
  detail: Record<string, unknown>;
  model: string | null;
  latency_ms: number | null;
  ts: string;
  user_id?: string;
  user_name?: string;
};

// GET /api/bandit/stats (manager/hr/admin)
export type BanditArm = { arm_id: string; name: string; config: Record<string, unknown>; pulls: number; avg_reward: number | null };
export type BanditStats = {
  arms: BanditArm[];
  total_pulls: number;
  best_arm: string | null;
  cumulative_regret: number | null;
  reward_over_time: { day: string; arm: string; avg_reward: number; pulls: number }[];
  context_win_rates: { dept: string | null; has_error_code: boolean; arm: string; n: number }[];
};

// GET /api/eval/runs, GET /api/eval/runs/{id}, POST /api/eval/run (admin)
export type EvalSummary = {
  total: number;
  passed: number;
  pass_rate: number;
  avg_correctness: number;
  by_route: Record<string, { total: number; passed: number }>;
};
export type EvalRun = { id: string; summary: EvalSummary; created_at: string };
export type EvalResult = {
  id: string;
  question_id: string;
  question: string;
  expected_route: string;
  actual_route: string | null;
  correctness: number;
  passed: boolean;
  details: Record<string, unknown>;
};
export type EvalRunDetail = EvalRun & { results: EvalResult[] };

// GET /api/costs (manager/hr/admin)
export type CostsResponse = {
  total_cost_usd: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_runs: number;
  by_day: { day: string; cost_usd: number; tokens_in: number; tokens_out: number }[];
  by_route: { route: string; cost_usd: number; tokens_in: number; tokens_out: number; runs: number }[];
  by_model: { model: string; tokens: number; calls: number }[];
};

// GET /api/admin/audit-log, /api/admin/audit-log/actions (admin)
export type AuditLogEntry = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: Record<string, unknown>;
  ts: string;
};

// ---------- Confidential HR cases (/api/hr-cases) ----------
// Visible only to the employee who raised the case and to HR. Never to managers or admins.
export type HrCaseCategory =
  | "harassment" | "discrimination" | "colleague_conflict" | "manager_concern"
  | "misconduct" | "personal_wellbeing" | "safety" | "other";
export type HrCaseStatus = "received" | "in_review" | "waiting_on_employee" | "resolved" | "closed";

export type HrRedirect = {
  category: HrCaseCategory;
  category_label: string;
  urgent: boolean;
  crisis: boolean;
  hr_email: string;
};

export type HrContact = { email: string; phone: string | null; hours: string };

export type HrCase = {
  id: string;
  number: string;
  anonymous: boolean;
  category: HrCaseCategory;
  subject: string;
  description: string;
  people_involved: string | null;
  incident_date: string | null;
  urgency: "normal" | "urgent";
  preferred_contact: "portal" | "email" | "phone" | "in_person";
  status: HrCaseStatus;
  status_label: string;
  assigned_hr_id: string | null;
  assigned_hr_name: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reporter_name: string;
  reporter_email: string | null;
  reporter_department: string | null;
  last_activity_at: string | null;
  last_author_role: "employee" | "hr" | null;
  is_mine: boolean;
};

export type HrCaseMessage = {
  id: string;
  author_role: "employee" | "hr" | "system";
  author_name: string;
  body: string;
  created_at: string;
  is_mine: boolean;
};

export type HrCaseDetail = { case: HrCase; messages: HrCaseMessage[] };

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  email_status: "sent" | "failed" | "not_configured" | "not_requested" | "skipped";
  read: boolean;
  created_at: string;
};

export type NotificationList = { unread_count: number; items: AppNotification[] };

export type EmailPreference = "important" | "all" | "off";
export type NotificationPreferences = { email: EmailPreference; email_available: boolean };
