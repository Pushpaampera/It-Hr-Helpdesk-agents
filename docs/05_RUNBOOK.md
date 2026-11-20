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
poetry run seed          # generates + embeds all seed data (idempotent, ~10-15s after models
                          # are already downloaded once)
poetry run dev          # backend on http://localhost:8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev              # frontend on http://localhost:5173, proxies /api to :8000
```

Retrieval sanity check (Phase 2):
```bash
poetry run search "VPN error 619" --strategy hybrid_rerank
poetry run search "VPN error 619" --strategy lexical_heavy
poetry run search "my laptop is super slow" --strategy semantic_heavy
poetry run search "parental leave policy" --strategy hybrid_rerank --dept HR
```

Later phases add:
```bash
poetry run simulate-feedback --n 500      # Phase 4+: synthetic bandit feedback
poetry run eval                           # run the golden-set evaluation (also triggerable live
                                           # from the Evaluation page as admin, or
                                           # POST /api/eval/run)
```

## Verifying everything is working
```bash
cd backend && poetry run pytest -q        # 24/24 passing as of Phase 12
cd frontend && npx tsc -b --noEmit && npm run build
```
Then log in at `http://localhost:5173` as each of the four demo accounts below and confirm each
role's nav items load. `docs/08_TESTING_AND_EVAL.md` has the current golden-set pass rate and
known failing cases; `docs/09_DEMO_SCRIPT.md` has the full live walkthrough.

## Demo accounts (all password `Demo@1234`)
| Role | Email | Lands on |
|------|-------|----------|
| employee | `emma.employee@acme.test` | AI Assistant |
| it_support | `ivan.it@acme.test` | Overview (IT queue) |
| hr | `hannah.hr@acme.test` | Overview |
| admin | `alex.admin@acme.test` | Overview |

## Resetting demo data
**Before every demo:** `cd backend && poetry run reset-demo` (about a second). It puts back the
small hand-written demo set — 6 people (Emma Employee is the main one; Priya Sharma and Aiden
Ramirez; Ivan IT, Hannah HR, Alex Admin), ~27 past conversations, 11 tickets, 4 leave requests, 4
access requests and 1 private HR case — and removes anything created while clicking around. The
knowledge base and golden questions are kept. Running the backend tests also ends with this reset.
Start the backend with `poetry run dev` (not plain `uvicorn --reload`): it limits how long a
code-reload waits for open chat streams, so the server can't hang on a reload.

`POST /api/admin/reset-demo` (admin JWT required) truncates and re-seeds every table to the
pristine state `poetry run seed` produces — useful before a fresh demo run after live clicking
has changed ticket/approval/leave state. No frontend button exists for this (its UI was Phase
10B scope, which was explicitly skipped); call it directly:
```bash
TOKEN=$(curl -s -X POST localhost:8000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"alex.admin@acme.test","password":"Demo@1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s -X POST localhost:8000/api/admin/reset-demo -H "Authorization: Bearer $TOKEN"
```
This is a genuine, irreversible wipe of every seeded table — only run it against a local/demo
database, never anything containing real data.

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
- **`poetry run seed` is slow or needs internet the first time**: `sentence-transformers`
  (`all-MiniLM-L6-v2`) and the cross-encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`) download
  their weights from Hugging Face on first use and cache them locally afterward (under
  `~/.cache/huggingface`) — this needs internet once, not on every run.
- **`poetry run seed` says "users table is not empty — seed already applied, skipping"**: this
  is expected, intentional idempotency, not an error — the seed only runs once per empty
  database.
- **HNSW index creation fails**: the installed pgvector extension predates HNSW support (added
  in pgvector 0.5.0). `poetry run migrate` detects this and automatically creates an `ivfflat`
  index instead — no action needed.
- **GPU/WebGL problems in the browser** (added from Phase 5 onward): use the "Reduce motion"
  toggle; the 3D scenes fall back to a simplified static rendering path.

## Backups
`scripts/backup.sh` creates `backups/helpdesk-<timestamp>.tar.gz` of the whole project minus
`node_modules/`, `.venv/`, `backups/`, and `.env`. Run it at the end of every phase.
