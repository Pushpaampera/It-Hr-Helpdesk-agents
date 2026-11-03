# 02 — Database

PostgreSQL + pgvector. UUID primary keys (`gen_random_uuid()`, via the `pgcrypto` extension),
`created_at timestamptz default now()` on every table. Schema lives in
`backend/migrations/*.sql`, applied in order by `poetry run migrate`, tracked in a
`schema_migrations(version text primary key, applied_at timestamptz)` table. This file must be
updated in the same step as any migration that changes the schema.

Current migration: `0001_init.sql` (Phase 1). Seed counts below are from Phase 2's `poetry run
seed` (verified against a real run — see `docs/phases/PHASE_02.md`).

## Identity and org
### `users`
id (uuid pk) · name · email (unique) · password_hash · role (`employee|manager|hr|admin`) ·
department · title · manager_id (fk users) · avatar_seed · is_active (bool) · created_at.
Indexes: `manager_id`, `role`. Seed count: **48** — 1 admin, 3 HR, 6 managers (one per
department), 38 employees across Engineering/Sales/Finance/Support/Operations, `Demo@1234` for
every demo account (bcrypt-hashed).

### `audit_log`
id · actor_id (fk users) · action · target_type · target_id · detail (jsonb) · ip · ts ·
created_at. Indexes: `actor_id`, `ts`.

## Knowledge
### `knowledge_articles`
id · dept (`IT|HR`) · category · title · body · error_codes (text[]) · source_name · version ·
updated_at · created_at. Index: `dept`. Seed count: **100** (60 IT across 12 categories, 40 HR
across 13 categories).

### `kb_chunks`
id · article_id (fk knowledge_articles, cascade) · chunk_index · text · embedding
(`vector(384)`) · tsv (`tsvector`, generated always as `to_tsvector('english', text)`, stored) ·
metadata (jsonb) · created_at. Indexes: GIN on `tsv`, btree on `article_id`, and
`hnsw (embedding vector_cosine_ops)` — `poetry run migrate` falls back to
`ivfflat (embedding vector_cosine_ops) WITH (lists = 100)` automatically if the server's
pgvector build doesn't support HNSW. Seed count: **130** chunks (averaging ~1.3 chunks/article —
most articles fit in a single ~300-500 token chunk; longer ones split on headings).

## Conversations and runs
### `conversations`
id · user_id (fk users) · title · status · created_at. Index: `user_id`.

### `messages`
id · conversation_id (fk conversations, cascade) · role (`user|assistant|system`) · content ·
routed_to · confidence (float) · sources (jsonb) · run_id · created_at. Indexes:
`conversation_id`, `run_id`.

### `agent_runs`
id · conversation_id (fk conversations, cascade, nullable) · user_id (fk users) · query · route
(`IT|HR|OTHER`) · strategy_arm_id · status
(`running|resolved|escalated|awaiting_approval|failed`) · total_latency_ms · tokens_in ·
tokens_out · cost_usd · outcome · created_at. Indexes: `user_id`, `conversation_id`, `created_at`.
Seed count: **300** historical runs (60-day spread; ~45% IT, ~40% HR, ~15% OTHER).

### `agent_events`
id · run_id (fk agent_runs, cascade) · seq (int) · agent · status
(`started|working|tool_call|retrieving|completed|handoff|error`) · action · caption · detail
(jsonb) · model · latency_ms · tokens_in · tokens_out · ts. Index: `(run_id, seq)`.
(`caption` is the plain-English narrator string — added in Phase 1 ahead of schedule since it's
part of the core event shape per the master prompt section 0.7/6.) Seed count: **1206**.

## Operations
### `tickets`
id · number (unique, e.g. `TCK-1042`, generated from `ticket_number_seq` starting at 1000) ·
user_id (fk users) · run_id (fk agent_runs) · category · priority
(`low|medium|high|urgent`) · status (`open|in_progress|waiting|resolved|closed`) · summary ·
context (jsonb) · assignee_id (fk users) · resolved_at · created_at. Indexes: `user_id`,
`status`. Seed count: **200** (60-day spread).

### `ticket_events`
id · ticket_id (fk tickets, cascade) · actor · type · note · created_at. Index: `ticket_id`.
Seed count: **352**.

### `approvals`
id · run_id (fk agent_runs) · requester_id (fk users) · approver_id (fk users) · type · payload
(jsonb) · status (`pending|approved|rejected`) · comment · decided_at · created_at. Indexes:
`approver_id`, `status`. Seed count: **80**.

### `access_requests`
id · user_id (fk users) · system · access_level · justification · status · approval_id (fk
approvals) · created_at. Index: `user_id`. Seed count: **80** (1:1 with `approvals`).

### `leave_balances`
id · user_id (fk users) · leave_type (`annual|sick|casual|parental`) · total_days · used_days ·
created_at. Unique `(user_id, leave_type)`. Index: `user_id`. Seed count: **192** (4 types × 48
users).

### `leave_requests`
id · user_id (fk users) · leave_type · start_date · end_date · days · reason · status ·
created_at. Index: `user_id`. Seed count: **150** historical requests (not specified by count
in the master prompt — added for a populated "My Requests" page; see docs/06_DECISIONS.md).

### `payslips`
id · user_id (fk users) · month · gross · net · deductions (jsonb) · created_at. Unique
`(user_id, month)`. Index: `user_id`. Used to demonstrate the Guard (Gus): an employee can only
ever fetch their own. Seed count: **144** (3 months × 48 users).

## Learning and evaluation
### `feedback`
id · run_id (fk agent_runs, cascade) · rating (int 1-5) · resolved (bool) · comment ·
created_at. Index: `run_id`. Seed count: **300** (1:1 with `agent_runs`).

### `bandit_arms`
id · name (unique) · config (jsonb — the 3 retrieval strategies from `app/rag/strategies.py`) ·
created_at. Seed count: **3** (`lexical_heavy`, `semantic_heavy`, `hybrid_rerank`).

### `bandit_state`
arm_id (pk, fk bandit_arms, cascade) · a_matrix (jsonb) · b_vector (jsonb) · pulls (int) ·
updated_at. (LinUCB's `A` and `b` per arm, 12×12 / 12, per `app/bandit/features.py`'s `DIM`.)
Seed count: **3**, pre-warmed from the 300 historical runs (see `app/bandit/linucb.py` and
`docs/06_DECISIONS.md`) so Reinforcement Lab charts (Phase 11) won't start from a flat line.

### `bandit_decisions`
id · run_id (fk agent_runs, cascade) · context (jsonb) · arm_id (fk bandit_arms) · ucb_scores
(jsonb) · created_at. Index: `run_id`. Seed count: **249** (one per IT/HR historical run; OTHER
routes don't retrieve, so they don't get a bandit decision).

### `bandit_rewards`
id · decision_id (fk bandit_decisions, cascade) · reward (float) · created_at. Seed count:
**249**, computed as `0.6*(rating-1)/4 + 0.4*resolved` via `app/bandit/linucb.py::compute_reward`.

### `golden_questions`
id · question · expected_route · expected_answer · expected_sources (text[]) · needs_action
(bool) · should_escalate (bool) · created_at. Seed count: **70** — 24 IT + 22 HR grounded
questions, 8 that need an action, 8 that should escalate, and 8 privacy traps (asking for
another employee's payslip/salary/personal data, incl. one prompt-injection attempt).

### `eval_runs`
id · summary (jsonb) · created_at.

### `eval_results`
id · eval_run_id (fk eval_runs, cascade) · question_id (fk golden_questions) · actual_route ·
correctness (float) · passed (bool) · details (jsonb) · created_at. Index: `eval_run_id`.
