# 03 — Backend

Updated as of Phase 1. Module-by-module description grows through Phase 3/4.

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

## API endpoints (Phase 1)
| Method | Path | Roles | Request | Response |
|--------|------|-------|---------|----------|
| GET | `/api/health` | public | — | `{status, service, mock_mode, database: {connected, detail}, pgvector: {enabled, detail}}` |
| POST | `/api/chat/stream` | **none yet (Phase 4 adds JWT)** | `{user_id, message, conversation_id?}` | SSE stream of the event schema in `docs/01_ARCHITECTURE.md` |
| GET | `/api/runs/{run_id}/events` | none yet | — | `{run_id, status, events: [...]}` (replay) |
| POST | `/api/approvals/{id}/decide` | none yet (Phase 4 adds: must be the approver) | `{decision: "approved"\|"rejected", comment?, approver_id}` | `{approval_id, status}` |
| POST | `/api/feedback` | none yet | `{run_id, rating (1-5), resolved, comment?}` | `{reward, updated_bandit}` |

Phase 3 deliberately ships these without auth/role enforcement — `user_id`/`approver_id` are
passed directly in the request body. Phase 4 wraps each with the real JWT dependency
(`app/deps.py::get_current_user`/`require_roles`) and removes the body fields in favor of the
authenticated identity.

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
