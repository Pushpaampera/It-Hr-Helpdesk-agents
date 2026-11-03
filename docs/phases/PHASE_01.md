# Phase 1 — Foundation

## Goal
Repo layout, Poetry backend project, config/DB/security scaffolding, all 22 tables via
migrations, pgvector setup, `/api/health`, and a Vite + React + TypeScript frontend scaffold.

## Files created
### Backend
- `backend/pyproject.toml` — Poetry project; dependency versions pinned (see
  `docs/06_DECISIONS.md` for the one deliberate range, `tenacity`); scripts: `migrate`, `seed`,
  `simulate-feedback`, `search`, `eval`, `dev`.
- `backend/app/config.py` — `Settings` (pydantic-settings) loading `.env` from the repo root.
- `backend/app/db.py` — SQLAlchemy engine/session (psycopg3 driver), `ensure_pgvector_extension`,
  `check_db_connection`.
- `backend/app/security.py` — bcrypt hashing + JWT issue/verify.
- `backend/app/deps.py` — `get_current_user`, `require_roles(*roles)`.
- `backend/app/main.py` — FastAPI app, CORS, `GET /api/health`.
- `backend/app/cli.py` — all Poetry script entry points, including the `migrate` runner with
  HNSW→ivfflat fallback.
- `backend/app/models/base.py`, `backend/app/models/user.py` — first SQLAlchemy ORM model.
- `backend/migrations/0001_init.sql` — all 22 logical tables (see `docs/02_DATABASE.md`).
- `backend/tests/test_health.py` — asserts the health endpoint's response shape.
- Empty `__init__.py` in every `app/` subpackage (`schemas`, `routers`, `agents`, `rag`,
  `bandit`, `mock_apis`, `eval`, `seed`) so later phases can add modules without re-plumbing
  imports.

### Frontend
- `frontend/package.json`, `vite.config.ts` (dev server on 5173, proxies `/api` to `:8000`),
  `tsconfig.json`, `index.html`.
- `frontend/src/main.tsx`, `App.tsx`, `routes.tsx`.
- `frontend/src/design/tokens.css`, `global.css`, `motion.ts` — design system foundation,
  including the final agent color palette ahead of Phase 5.
- `frontend/src/pages/PlaceholderHome.tsx` — live-pings `/api/health`.

### Root
- `.env.example`, blank `.env` (filled in by the operator directly — see
  `docs/06_DECISIONS.md`), `.gitignore`, `README.md`, `CLAUDE.md`, `HANDOFF.md`, `PROGRESS.md`,
  `docs/00_PROJECT_OVERVIEW.md` .. `docs/09_DEMO_SCRIPT.md`, `scripts/backup.sh`.

## Commands to run
```bash
cd backend
poetry install
poetry run migrate
poetry run pytest
poetry run dev        # :8000

cd frontend
npm install
npm run dev             # :5173 (or next free port)
```

## Verification results
- `npm install` in `frontend/`: 193 packages installed; `npm run dev` confirmed to boot (Vite
  5.4.21, ready in 166ms) and serve HTTP 200.
- `poetry install` in `backend/`: completed (first install pulls sentence-transformers/torch,
  which took ~16 minutes — expected, not an error). Verified with
  `poetry run python -c "import fastapi, sqlalchemy, psycopg, sentence_transformers, groq, langgraph"`.
- `poetry run pytest -q`: `1 passed`.
- `poetry run migrate`: operator filled in `DATABASE_URL` in `.env` (Postgres 17 on port 5433).
  Output:
  ```
  [migrate] pgvector extension is enabled
  [migrate] applying 0001_init ...
  [migrate] 0001_init OK
  [migrate] all migrations applied
  ```
  Confirmed 24 tables created (22 logical tables + `schema_migrations` bookkeeping table, with
  `tickets` backed by a `ticket_number_seq` sequence) and that `idx_kb_chunks_embedding` used
  the `hnsw` access method (no ivfflat fallback needed — this server's pgvector supports HNSW).
- `GET /api/health` (backend on :8000):
  ```json
  {"status":"ok","service":"helpdesk-ai-agents-backend","mock_mode":true,
   "database":{"connected":true,"detail":"connected"},
   "pgvector":{"enabled":true,"detail":"enabled"}}
  ```
- `GET http://localhost:5173/api/health` (frontend dev server, same response via the Vite
  proxy) and `GET http://localhost:5173/` → `200`: confirmed the full stack is wired together.

## First-answer time
Not yet applicable — no LLM agent exists until Phase 3. Will be logged here once the Phase 3
agents and `LLM_MOCK_MODE` warm-up path exist.

## Problems met and how they were fixed
- Poetry's resolver rejected `tenacity==9.0.0` because `langchain-core==0.3.10` requires
  `tenacity<9.0.0`. Fixed by relaxing the pin to `>=8.1.0,<9.0.0` (see `docs/06_DECISIONS.md`).
- `npm create vite@latest` refused to scaffold into the already-created (non-empty)
  `frontend/` directory in a non-interactive shell. Fixed by writing the Vite/React/TS scaffold
  files directly instead of relying on the interactive generator.
- No sudo and no known Postgres superuser password in this environment, and no existing role
  for the Linux user `siyyadripushpa`. Resolved by handing DB setup to the operator: the
  assistant ships `.env.example`/a blank `.env` and documents the exact `DATABASE_URL` format,
  but never asks for or reads the real credentials (explicit operator instruction).
- `poetry run migrate` initially failed: `pyproject.toml` had `package-mode = false`, which
  prevents Poetry from building/installing the project itself — and without that, the
  `[tool.poetry.scripts]` entry points (`migrate`, `seed`, etc.) never get wired up, so
  `poetry run migrate` errored with "No file/folder found for package helpdesk-ai-agents".
  Fixed by switching to `packages = [{ include = "app" }]` and re-running `poetry install`
  (fast — dependencies were already cached).
- The operator's first `DATABASE_URL` was missing the `@` separator between credentials and
  host (e.g. `postgresql://user:pass:host:port/dbname` instead of
  `postgresql://user:pass@host:port/dbname`), which SQLAlchemy's URL parser reported as
  `ValueError: invalid literal for int() with base 10`. Diagnosed without reading the
  credentials themselves — only counted `@`/`:` occurrences in the line — then asked the
  operator to add the `@`, which fixed it.

## Status
**Done.** All verification checks above passed.
