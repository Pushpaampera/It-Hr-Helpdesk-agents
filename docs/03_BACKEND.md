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

## API endpoints (Phase 1)
| Method | Path | Roles | Request | Response |
|--------|------|-------|---------|----------|
| GET | `/api/health` | public | — | `{status, service, mock_mode, database: {connected, detail}, pgvector: {enabled, detail}}` |

Further endpoints (auth, chat, tickets, approvals, kb, analytics, agents, bandit, eval, admin)
are added in Phases 3–4 and documented here as they land, with method/path/roles/request/
response shape and the prompts used by each agent.

## Agent prompts
None yet — agents are built in Phase 3. This section will list, per agent, the exact system
prompt template and the variables it's filled with.
