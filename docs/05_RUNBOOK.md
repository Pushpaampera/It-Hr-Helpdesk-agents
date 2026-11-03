# 05 — Runbook

## Setup (first time, no sudo required)
```bash
# Backend
cd backend
poetry config virtualenvs.in-project true --local   # already done in this repo
poetry install

# Fill in your own .env at the repo root (copy from .env.example if you need a fresh one).
# DATABASE_URL must point at a Postgres database you control. This machine runs Postgres 17
# locally on port 5433 (not the default 5432) — confirm with `pg_lsclusters`.

poetry run migrate     # creates the pgvector extension + all 22 tables
poetry run dev          # backend on http://localhost:8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev              # frontend on http://localhost:5173, proxies /api to :8000
```

Later phases add:
```bash
poetry run seed                          # Phase 2: generates and embeds all seed data
poetry run search "VPN error 619" --strategy hybrid_rerank   # Phase 2: CLI retrieval check
poetry run simulate-feedback --n 500      # Phase 4+: synthetic bandit feedback
poetry run eval                           # Phase 11: run the golden-set evaluation
```

## `.env` variables (names only — see `.env.example`; never put real values in this file)
`GROQ_API_KEY`, `GEMINI_API_KEY`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRE_MINUTES`,
`FRONTEND_ORIGIN`, `LLM_MOCK_MODE`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`.

## Troubleshooting
- **`DATABASE_URL is not set`** when running `migrate`/`dev`/`seed`: `.env` is missing or empty
  at the repo root. Copy `.env.example` to `.env` and fill in your Postgres connection string.
- **pgvector extension creation fails with a permissions error**: the connected role lacks
  CREATEDB/superuser. Ask whoever administers the Postgres server to run
  `CREATE EXTENSION vector;` once on the target database, then retry `poetry run migrate`. The
  app deliberately stops instead of silently using a different database.
- **Port 5173/8000 already in use**: a previous `npm run dev`/`poetry run dev` is still running;
  `pkill -f vite` / `pkill -f uvicorn` or let Vite auto-pick the next free port (5174, ...).
- **HNSW index creation fails**: the installed pgvector extension predates HNSW support (added
  in pgvector 0.5.0). `poetry run migrate` detects this and automatically creates an `ivfflat`
  index instead — no action needed.
- **GPU/WebGL problems in the browser** (added from Phase 5 onward): use the "Reduce motion"
  toggle; the 3D scenes fall back to a simplified static rendering path.

## Backups
`scripts/backup.sh` creates `backups/helpdesk-<timestamp>.tar.gz` of the whole project minus
`node_modules/`, `.venv/`, `backups/`, and `.env`. Run it at the end of every phase.
