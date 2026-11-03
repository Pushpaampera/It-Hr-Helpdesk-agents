# 06 — Decision Log

### 2026-11-03 — Plain SQL migration files instead of Alembic
**Decision**: schema changes live in `backend/migrations/*.sql`, applied in order by a small
Python runner (`app/cli.py::migrate`) that tracks applied versions in a `schema_migrations`
table.
**Reason**: the master prompt explicitly allows "SQLAlchemy 2 + Alembic (or plain SQL migration
files)". Plain SQL is simpler to review, has zero extra dependency surface, and makes the
`vector(384)`/HNSW-specific DDL (which Alembic's autogenerate handles poorly) trivial to write
by hand.
**Alternatives rejected**: Alembic — adds a second source of migration truth and autogenerate
diffing that fights custom pgvector DDL for little benefit at this project's scale.

### 2026-11-03 — HNSW index with automatic ivfflat fallback
**Decision**: `kb_chunks.embedding` gets an `hnsw (embedding vector_cosine_ops)` index; if the
server's pgvector build doesn't support the `hnsw` access method, the migration runner catches
that specific error and retries with `ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`.
**Reason**: HNSW is the faster, more accurate default (pgvector ≥0.5.0), but we don't control
which pgvector version is installed on the operator's Postgres server and must not fail the
whole Phase 1 setup over it.
**Alternatives rejected**: requiring HNSW unconditionally — too fragile across environments for
a demo that "must never fail on stage" (master prompt §0.7).

### 2026-11-03 — `.env` is filled in by the operator directly, never by the assistant
**Decision**: the assistant creates `.env.example` and a blank `.env` with placeholder values,
but never asks the user to paste credentials into chat and never reads `.env`'s contents back
into a response.
**Reason**: explicit operator instruction — database credentials are confidential and should not
pass through the chat transcript. This is stricter than, but compatible with, the master
prompt's "never write secrets into any MD file or the repo" rule.
**Alternatives rejected**: asking for credentials in chat to type them into `.env` directly —
rejected by the operator.

### 2026-11-03 — Pause for confirmation between phases
**Decision**: unlike the master prompt's default ("do not stop to ask for confirmation between
phases"), this session asks the operator before starting each new phase.
**Reason**: explicit operator instruction in the first message of the session, which takes
precedence per the master prompt's own meta-rule that explicit user instructions can override
its defaults.
**Alternatives rejected**: running all 12 phases unattended — would contradict a direct,
unambiguous operator request.

### 2026-11-03 — Poetry `packages = [{ include = "app" }]` instead of `package-mode = false`
**Decision**: `backend/pyproject.toml` declares the project as a real installable package
(`packages = [{ include = "app" }]`) rather than `package-mode = false`.
**Reason**: `package-mode = false` tells Poetry there is nothing to build/install for this
project, which silently disables `[tool.poetry.scripts]` entry points — `poetry run migrate`
failed with "No file/folder found for package helpdesk-ai-agents" until this was fixed. The
master prompt requires `poetry run migrate`/`seed`/`simulate-feedback`/`eval`/`dev` to work as
named commands, which needs the project packaged normally.
**Alternatives rejected**: invoking everything as `poetry run python -m app.cli <cmd>` —
works, but doesn't match the exact command names the master prompt and `docs/05_RUNBOOK.md`
specify.

### 2026-11-03 — `tenacity` pinned as `>=8.1.0,<9.0.0` instead of `9.0.0`
**Decision**: loosened from the master prompt's implicit "pin exact versions" preference.
**Reason**: `langchain-core==0.3.10` requires `tenacity<9.0.0`; pinning `tenacity==9.0.0` made
Poetry's resolver report the dependency set unsatisfiable. `>=8.1.0,<9.0.0` is still a narrow,
pinned range, just not a single exact version.
**Alternatives rejected**: pinning `tenacity==9.0.0` and dropping `langchain-core` — rejected,
`langchain-core` is required by the tech stack spec for LangGraph's typed state/graph primitives.
