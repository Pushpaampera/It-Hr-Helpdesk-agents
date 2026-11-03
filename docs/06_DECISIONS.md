# 06 — Decision Log

### 2026-11-03 — Pulled `app/bandit/features.py` and `app/bandit/linucb.py` forward into Phase 2
**Decision**: built the 12-dim context feature vector and a small, self-contained disjoint
LinUCB implementation (`LinUCBArm.score`/`update`, `select_arm`, `compute_reward`) during Phase
2 instead of waiting for Phase 4 ("Implement LinUCB, the feedback endpoint, and the simulator").
**Reason**: the master prompt's section 11 seed-data spec wants "300 historical runs with
events and feedback so every chart looks alive from the first launch" — including implicitly,
the Reinforcement Lab (Phase 10). Seeding plausible `bandit_decisions`/`bandit_rewards` for
those 300 runs needs *some* arm-selection logic, and writing the real LinUCB math once (reused
later by Phase 4's live agents) is simpler and more honest than inventing throwaway random arm
picks in the seed script that Phase 4 would then have to replace anyway.
**Alternatives rejected**: random arm assignment in `seed.py` with no real selection logic —
would have to be thrown away in Phase 4, and wouldn't demonstrate the "lexical wins for
error-code queries, semantic wins for vague ones" pattern the master prompt explicitly wants
visible in the simulator/dashboard.

### 2026-11-03 — Added `leave_requests` seed data (150 rows) beyond the master prompt's spec
**Decision**: seeded 150 historical `leave_requests` even though master prompt section 11 only
explicitly calls for "leave balances for everyone" with no `leave_requests` count specified.
**Reason**: the `leave_requests` table exists in the Phase 1 schema and the Phase 10 "My
Requests" page needs populated history to avoid an empty-looking screen — consistent with the
"no empty screens (everything pre-seeded)" rule in master prompt section 0.7.
**Alternatives rejected**: leaving `leave_requests` empty until a later phase populates it —
would contradict "no empty screens" once that page is built.

### 2026-11-03 — Chunker prefixes each chunk with its article title (and section heading)
**Decision**: `app/rag/chunker.py` prepends `"{title} — {heading}"` to every chunk's stored
text, not just the raw body text.
**Reason**: chunks are retrieved and shown standalone (as citation sources in the UI, and as
cross-encoder rerank input) — a chunk that just says "Disconnect and reconnect the VPN client…"
with no title context is much weaker signal for both lexical/semantic retrieval and for a human
reading a cited source than one that says "VPN Error 619: causes and fix — Quick fixes…".
**Alternatives rejected**: storing raw body text only and relying on a UI-side join back to the
parent article's title — works for display, but weakens the chunk's own retrieval signal, which
matters more since ranking operates on `kb_chunks.text`/`tsv`/`embedding` directly.

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
