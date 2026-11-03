# 03 — Backend

Updated through Phase 10 (endpoint table only — module list below is Phase 1-4, plus the Phase
10 routers noted inline).

## Modules (Phase 1 state)
- `app/config.py` — `Settings` (pydantic-settings), loads `.env` from the repo root. Every
  field documented in `.env.example`. `LLM_MOCK_MODE` defaults false but the shipped `.env`
  ships it `true` so the app runs with zero API keys out of the box.
- `app/db.py` — SQLAlchemy engine (`psycopg` v3 driver, `postgresql+psycopg://`), session
  factory, `ensure_pgvector_extension()` (runs `CREATE EXTENSION IF NOT EXISTS vector`, returns
  `(ok, message)` — never falls back to another DB on failure), `check_db_connection()`.
- `app/security.py` — bcrypt password hashing (`passlib`), JWT issuance/verification
  (`python-jose`, HS256, `JWT_SECRET`/`JWT_EXPIRE_MINUTES` from config).
- `app/deps.py` — `get_current_user` (decodes bearer JWT, loads `User`), `require_roles(*roles)`
  factory for server-side role enforcement on routers.
- `app/main.py` — FastAPI app, CORS restricted to `FRONTEND_ORIGIN`, `/api/health`.
- `app/cli.py` — Poetry script entry points (`migrate`, `seed`, `simulate-feedback`, `search`,
  `eval`, `dev`). `migrate` applies `backend/migrations/*.sql` in order inside a transaction per
  file, with an automatic HNSW→ivfflat fallback if the server's pgvector lacks HNSW support.
- `app/models/` — SQLAlchemy ORM models. Source of truth for the schema is the SQL migration;
  ORM models are added incrementally as routers/agents need them (only `User` exists so far).
- `app/rag/chunker.py` — splits an article body into ~300-500 token chunks (overlap 40 words),
  splitting on `## Heading` markdown first.
- `app/rag/embedder.py` — local `all-MiniLM-L6-v2` (384-dim) via `sentence-transformers`,
  `embed_texts()` / `embed_query()`.
- `app/rag/reranker.py` — cross-encoder `cross-encoder/ms-marco-MiniLM-L-6-v2`, `rerank(query,
  candidates, top_k)`.
- `app/rag/strategies.py` — the three retrieval strategies' configs (`lexical_heavy`,
  `semantic_heavy`, `hybrid_rerank`), stored in `bandit_arms.config` at seed time.
- `app/rag/retriever.py` — `retrieve(query, strategy, dept, top_k)`: hybrid lexical (Postgres
  `tsvector`) + vector (pgvector cosine) search, merged by weighted fusion or RRF+rerank
  depending on strategy, with an exact-match boost for error codes/titles.
- `app/bandit/features.py` — 12-dim context feature vector for the LinUCB bandit (pulled
  forward from Phase 4 — see `docs/06_DECISIONS.md`).
- `app/bandit/linucb.py` — `LinUCBArm`, `select_arm()`, `compute_reward()` (disjoint LinUCB;
  `reward = 0.6*(rating-1)/4 + 0.4*resolved`).
- `app/seed/generators/knowledge.py` — 60 IT + 40 HR knowledge article content.
- `app/seed/generators/users.py` — 48 seed users (roles, departments, manager links).
- `app/seed/generators/ops.py` — leave balances, payslips, tickets, approvals/access requests,
  leave requests, and 300 historical agent runs/events/feedback/bandit decisions.
- `app/seed/generators/golden.py` — the 70-question golden set (incl. 8 privacy traps).
- `app/seed/seed.py` — orchestrates all of the above inside one transaction; idempotent.
- `app/agents/llm.py` — single provider wrapper (Groq + Gemini), retries/fallback,
  `LLM_MOCK_MODE` support. See `docs/phases/PHASE_03.md` for the exact mock-vs-real contract.
- `app/agents/events.py` — SSE event builder (`build_caption`, `EventSink`), replay
  (`load_events_for_run`), live-queue registry for pause/resume streaming.
- `app/agents/guard.py`, `supervisor.py`, `knowledge_agent.py`, `it_support.py`, `hr_policy.py`,
  `action.py`, `ticketing.py`, `feedback.py` — the 7 agents (Gus, Sage, Iris, Hana, Atlas, Tess,
  Finn). See `docs/phases/PHASE_03.md` for what each one does.
- `app/agents/graph.py` — LangGraph wiring (`guard -> supervisor -> (it_support|hr_policy|
  other_reply) -> action? -> ticketing? -> feedback`), the `request_access` pause/resume
  (`NodeInterrupt` + a module-level `MemorySaver` checkpointer), `start_chat()`,
  `resume_after_approval()`.
- `app/agents/runs_store.py` — `agent_runs` row lifecycle + `messages` persistence.
- `app/mock_apis/` — `directory.py`, `hr_system.py`, `it_system.py`, `approvals.py`. Every call
  writes to the real tables and logs to `audit_log` via `mock_apis/__init__.py::log_action`.
- `app/bandit/store.py` — loads/saves `LinUCBArm` state from `bandit_arms`/`bandit_state`,
  records `bandit_decisions`/`bandit_rewards`.
- `app/bandit/simulator.py` (Phase 4) — `run_simulation(n)`: generates synthetic feedback
  against the *live* bandit state (reloads arms from the DB each iteration), weighted so
  `lexical_heavy`/`hybrid_rerank` win error-code queries and `semantic_heavy`/`hybrid_rerank`
  win vague ones. Wired to `poetry run simulate-feedback --n <n>`.
- `app/eval/run_eval.py` (Phase 4) — `run_eval()` / `run_eval_async()`: runs every
  `golden_questions` row through the real agent graph (`app.agents.graph.start_chat`) as a fixed
  demo employee, scores route accuracy / source-citation accuracy / escalation-match, persists
  to `eval_runs`/`eval_results`. Wired to `poetry run eval` and `POST /api/eval/run`.
- `app/observability.py` (Phase 4) — optional Langfuse hook. A true no-op unless both
  `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` are set in `.env` and the `langfuse` package is
  installed (`poetry add langfuse` — not a default dependency). Every call is wrapped so a
  Langfuse failure can never affect a live request. Called from `app/agents/events.py`'s
  `EventSink.emit` (per agent event) and `app/agents/graph.py`'s `start_chat`/`node_feedback`
  (run start/end).
- `app/routers/auth.py` (Phase 4) — `POST /api/auth/login`/`logout`, `GET /api/auth/me`.
- `app/routers/{conversations,tickets,kb,analytics,agents,bandit,eval,admin,costs}.py`
  (Phase 4) — see the endpoint table below.
- `app/routers/team.py` (Phase 10) — `GET /api/team`, a manager's direct reports plus real
  per-person signal. Manager/admin only.
- `app/routers/hr_insights.py` (Phase 10) — `GET /api/hr/overview`,
  `GET`/`PATCH /api/hr/leave-requests` — company-wide headcount/leave posture and the real
  pending leave requests HR has to act on. HR/admin only.

## API endpoints (through Phase 4)
Every endpoint below (except `/api/health` and `/metrics`) requires a bearer JWT
(`Authorization: Bearer <token>` from `POST /api/auth/login`). "Roles" lists who may call it
beyond the default (any authenticated user); "Ownership" notes self-vs-staff access rules
enforced via `app/deps.py::ensure_self_or_roles`.

| Method | Path | Roles / ownership | Request | Response |
|--------|------|--------------------|---------|----------|
| GET | `/api/health` | public | — | `{status, service, mock_mode, database, pgvector}` |
| GET | `/metrics` | public (Prometheus) | — | text exposition format |
| POST | `/api/auth/login` | public | `{email, password}` | `{access_token, token_type, user}` |
| POST | `/api/auth/logout` | any | — | `{success}` |
| GET | `/api/auth/me` | any | — | `{id, name, email, role, department, title, manager_id}` |
| POST | `/api/chat/stream` | any | `{message, conversation_id?}` | SSE event stream (`docs/01_ARCHITECTURE.md`) |
| GET | `/api/runs/{id}/events` | own run, or manager/hr/admin | — | `{run_id, status, events}` |
| GET | `/api/approvals` | own (as approver), admin sees all | `?status=` | list of approvals |
| POST | `/api/approvals/{id}/decide` | must be the approval's `approver_id`, or admin | `{decision, comment?}` | `{approval_id, status}` |
| POST | `/api/feedback` | own run, or admin | `{run_id, rating, resolved, comment?}` | `{reward, updated_bandit}` |
| POST | `/api/conversations` | any | `{title?}` | created conversation row |
| GET | `/api/conversations` | own | — | list of own conversations |
| GET | `/api/conversations/{id}` | own, or manager/hr/admin | — | `{conversation, messages}` |
| GET | `/api/tickets` | own; manager/hr/admin see all | `?status=&category=` | list of tickets |
| GET | `/api/tickets/{id}` | own, or manager/hr/admin | — | `{ticket, events}` |
| PATCH | `/api/tickets/{id}` | manager/hr/admin | `{status?, priority?, assignee_id?, note?}` | updated `{ticket, events}` |
| GET | `/api/kb/search` | any | `?q=&dept=&strategy=&top_k=` | `{query, strategy, results}` |
| GET | `/api/kb/compare` | any | `?q=&dept=` | `{query, strategies: {name: results}}` |
| GET | `/api/kb/articles/{id}` | any | — | `{article, chunks}` |
| GET | `/api/analytics/kpis` | manager/hr/admin | — | run/feedback/ticket/approval KPIs |
| GET | `/api/analytics/timeseries` | manager/hr/admin | `?days=` | daily run/rating series |
| GET | `/api/analytics/departments` | manager/hr/admin | — | per-route (IT/HR) breakdown |
| GET | `/api/agents/status` | any | — | per-agent 24h event/latency/error counts |
| GET | `/api/agents/live` | any (anonymised unless admin) | — | always-on aggregated SSE of all `agent_events` |
| GET | `/api/bandit/stats` | manager/hr/admin | — | arm pulls, avg reward, regret, context win rates |
| POST | `/api/eval/run` | admin | — | `{eval_run_id, summary}` |
| GET | `/api/eval/runs` | admin | — | list of past `eval_runs` |
| POST | `/api/admin/reset-demo` | admin | — | `{success, message}` (wipes + reseeds all data) |
| GET | `/api/costs` | manager/hr/admin | `?days=` | token/$ breakdown by day/route/model |
| GET | `/api/team` | manager; admin (self or `?manager_id=`) | `?manager_id=` (admin only) | list of direct reports + ticket/leave/activity signal |
| GET | `/api/hr/overview` | hr/admin | — | headcount by dept, leave-request counts, leave-balance utilization, upcoming approved leave |
| GET | `/api/hr/leave-requests` | hr/admin | `?status=` | list of leave requests |
| PATCH | `/api/hr/leave-requests/{id}/decide` | hr/admin | `{decision}` | `{id, status}` — approving increments the matching `leave_balances.used_days` |

Phase 10 added `team`/`hr_insights` (above). Note `POST /api/approvals/{id}/decide` is a POST,
not PATCH, despite every Phase 10 decide/update action otherwise being a PATCH — a real bug
found during Phase 10 live verification came from assuming otherwise (see
`docs/phases/PHASE_10.md`).

Phase 3 shipped `chat`/`approvals`/`feedback` without auth — `user_id`/`approver_id` were passed
directly in the request body. Phase 4 retrofitted all three onto the real JWT dependency
(`app/deps.py::get_current_user`/`require_roles`/`ensure_self_or_roles`) and removed those body
fields in favor of the authenticated identity.

## Agent prompts (verbatim system prompts, Phase 3)
- **Sage** (`app/agents/supervisor.py::SYSTEM_PROMPT`): routing classifier instructions, strict
  JSON output `{route, confidence, needs_action, intent}`, IT vs. HR vs. OTHER routing guide.
- **Iris** (`app/agents/it_support.py::SYSTEM_PROMPT`) / **Hana**
  (`app/agents/hr_policy.py::SYSTEM_PROMPT`): "answer using only the knowledge base excerpts
  provided", numbered steps where relevant, under 150 words, never invent unsupported info. The
  user prompt (built in `app/agents/knowledge_agent.py::answer_from_knowledge`) is the question
  plus the top 3 retrieved chunks, separated by `---`.
- **Atlas** (`app/agents/action.py::SYSTEM_PROMPT`): "call exactly one tool", resolve relative
  dates, always explain that `request_access` needs manager approval. Tool schemas: `TOOLS` in
  the same file.
- **Gus** and **Tess** have no LLM prompts (rules-based / template-based respectively).
- **Finn** has no LLM prompt (pure computation: `compute_reward` + LinUCB update).
