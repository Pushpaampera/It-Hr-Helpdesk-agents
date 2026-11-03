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
