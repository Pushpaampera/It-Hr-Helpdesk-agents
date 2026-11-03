# 07 — Changelog

### 2026-11-03 — Phase 4: Auth, API surface, bandit and analytics
- Added: `backend/app/routers/auth.py` (`POST /api/auth/login`/`logout`, `GET /api/auth/me`).
- Added: `backend/app/deps.py::ensure_self_or_roles` — shared "own it, or have an elevated role"
  check.
- Added: `backend/app/routers/{conversations,tickets,kb,analytics,agents,bandit,eval,admin,
  costs}.py`, `backend/app/eval/run_eval.py` (real golden-set runner through the live agent
  graph), `backend/app/bandit/simulator.py` (`poetry run simulate-feedback`, drives the live
  bandit), `backend/app/observability.py` (optional Langfuse hook, no-op by default).
- Added: `backend/tests/test_auth_api.py` — 12 new tests (login for all 4 roles, 403 role/
  ownership enforcement, bandit update via feedback, simulator learning curve).
- Changed: `backend/app/routers/{chat,approvals,feedback}.py` — removed `user_id`/`approver_id`
  body fields in favor of the JWT-authenticated identity; added 403s for cross-user/cross-role
  access.
- Changed: `backend/app/main.py` — wired all 10 new routers, added a Prometheus middleware +
  `GET /metrics`.
- Changed: `backend/app/seed/seed.py` — added `reset_and_reseed()` (admin "reset demo" backend).
- Changed: `backend/app/agents/events.py`, `app/agents/graph.py` — added the optional Langfuse
  trace hook (`trace_event`/`trace_run_start`/`trace_run_end`), inert unless both Langfuse keys
  are set.
- Verified: `poetry run pytest -q` → 24 passed; `poetry run simulate-feedback --n 40` and
  `poetry run eval` both run successfully against the live seeded DB; live HTTP smoke test
  covering login for all 4 roles, the full chat SSE flow, and the full `request_access`
  approval flow with real approver-identity enforcement. Full detail in
  `docs/phases/PHASE_04.md`.
- Why: this is the phase that makes the backend's role boundaries real — every endpoint built in
  Phases 1-3 was intentionally open; Phase 4 closes that gap before any frontend ships against
  it, and adds the analytics/bandit/cost surfaces the Phase 8+ dashboard pages will read from.

### 2026-11-03 — Phase 3: Agents, graph, mock APIs and events
- Added: `backend/app/agents/llm.py` (provider wrapper, retries, fallback, mock mode),
  `events.py` (SSE event builder + live-queue registry), `guard.py`, `supervisor.py`,
  `knowledge_agent.py` + `it_support.py`/`hr_policy.py`, `action.py`, `ticketing.py`,
  `feedback.py`, `graph.py` (LangGraph wiring + pause/resume), `runs_store.py`.
- Added: `backend/app/mock_apis/` (`directory.py`, `hr_system.py`, `it_system.py`,
  `approvals.py`), `backend/app/bandit/store.py`.
- Added: `backend/app/routers/chat.py` (`POST /api/chat/stream` SSE, `GET /api/runs/{id}/events`),
  `approvals.py` (`POST /api/approvals/{id}/decide`), `feedback.py` (`POST /api/feedback`);
  wired into `app/main.py`.
- Added: `backend/tests/test_agents_graph.py` — the master prompt's 7 Phase 3 verification
  scenarios, all passing.
- Fixed: `app/seed/generators/users.py` now seeds a specific named employee (Priya Sharma) for
  the privacy-guard showcase scenario; `app/seed/seed.py` now advances `ticket_number_seq` past
  the hand-assigned seeded ticket numbers so live-created tickets don't collide. Database was
  truncated and re-seeded to pick up both fixes.
- Verified: `poetry run pytest -q` → 12 passed; manual HTTP/SSE smoke test confirmed real
  end-to-end streaming through `POST /api/chat/stream`. Full detail in
  `docs/phases/PHASE_03.md`.
- Why: this is the functional core of the product — a real multi-agent graph with a genuine
  human-in-the-loop approval pause, producing the exact event stream the Phase 5+ frontend will
  animate against.

### 2026-11-03 — Phase 2: Seed data and RAG
- Added: `backend/app/rag/` — `chunker.py`, `embedder.py` (local all-MiniLM-L6-v2),
  `reranker.py` (cross-encoder/ms-marco-MiniLM-L-6-v2), `strategies.py` (3 bandit arms),
  `retriever.py` (hybrid lexical+vector retrieval, RRF, exact-match boost).
- Added: `backend/app/bandit/features.py`, `backend/app/bandit/linucb.py` — pulled forward from
  Phase 4 (see `docs/06_DECISIONS.md`) so historical seed data has real bandit decisions/rewards.
- Added: `backend/app/seed/generators/knowledge.py` (100 articles), `users.py` (48 users),
  `ops.py` (leave/payslips/tickets/approvals/leave_requests/300 historical runs), `golden.py`
  (70-question golden set).
- Added: `backend/app/seed/seed.py` — idempotent orchestrator wired to `poetry run seed`.
- Added: `backend/tests/test_retrieval.py` — 4 regression tests for the retrieval acceptance
  criteria (exact error code rank-1 under lexical_heavy/hybrid_rerank, sensible semantic_heavy
  results for a vague query, dept filter correctness).
- Verified: `poetry run seed` populates all tables with exactly the spec's row counts; re-run is
  idempotent; `poetry run search` confirms the required ranking behavior; `poetry run pytest -q`
  → 5 passed. Full detail in `docs/phases/PHASE_02.md`.
- Why: establishes real, searchable knowledge content and a working hybrid RAG pipeline that
  Phase 3's agents will call directly.

### 2026-11-03 — Phase 1: Foundation
- Added: full repo layout (`backend/`, `frontend/`, `docs/`, `scripts/`) per
  `docs/01_ARCHITECTURE.md`.
- Added: `backend/pyproject.toml` (Poetry project, scripts: `migrate`, `seed`,
  `simulate-feedback`, `search`, `eval`, `dev`).
- Added: `backend/app/config.py`, `app/db.py`, `app/security.py`, `app/deps.py`, `app/main.py`
  (`/api/health`), `app/cli.py`.
- Added: `backend/app/models/base.py`, `app/models/user.py` (first ORM model).
- Added: `backend/migrations/0001_init.sql` — all 22 logical tables, pgvector + pgcrypto
  extensions, HNSW index on `kb_chunks.embedding` with automatic ivfflat fallback.
- Added: `frontend/` Vite + React 18 + TypeScript scaffold (`package.json`, `vite.config.ts`,
  `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/routes.tsx`,
  `src/design/tokens.css`, `src/design/global.css`, `src/design/motion.ts`,
  `src/pages/PlaceholderHome.tsx`).
- Added: `.env.example`, blank `.env` (operator-filled), `.gitignore`.
- Added: `CLAUDE.md`, `HANDOFF.md`, `PROGRESS.md`, `docs/00_PROJECT_OVERVIEW.md` through
  `docs/09_DEMO_SCRIPT.md` skeletons, `docs/phases/PHASE_01.md`.
- Why: establishes the foundation every later phase builds on, exactly as Phase 1 of the master
  build prompt specifies.
- Fixed: `pyproject.toml` switched from `package-mode = false` to `packages = [{include = "app"}]`
  so `poetry run <script>` entry points actually work.
- Fixed: `tenacity` relaxed to `>=8.1.0,<9.0.0` to satisfy `langchain-core`'s constraint.
- Verified: `poetry run migrate` applies cleanly against the operator's real Postgres 17
  instance (port 5433), `/api/health` reports a connected database with pgvector/HNSW enabled,
  both dev servers boot and the frontend reaches the backend through the Vite proxy. Phase 1
  marked **done** in `PROGRESS.md`.
