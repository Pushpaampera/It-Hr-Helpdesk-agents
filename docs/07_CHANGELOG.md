# 07 — Changelog

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
