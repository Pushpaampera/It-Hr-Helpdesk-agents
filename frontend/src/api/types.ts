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
  run_id: string;
  seq: number;
  answer: string;
  sources: ChatSource[];
  route: string | null;
  resolved: boolean;
  ticket_number: string | null;
  ts: string;
};

export type ErrorEventPayload = { type: "error"; run_id: string; seq: number; message: string; ts: string };

export type ChatEvent =
  | AgentEventPayload
  | HandoffEventPayload
  | TokenEventPayload
  | ApprovalRequiredEventPayload
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
