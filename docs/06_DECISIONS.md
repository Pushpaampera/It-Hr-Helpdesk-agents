# 06 — Decision Log

### 2026-11-03 — Manual SSE parsing must normalize `\r\n`, never assume `\n\n`
**Decision**: `frontend/src/api/sse.ts` decodes each chunk and replaces `\r\n` with `\n` before
splitting on the blank-line frame separator, rather than splitting on `\n\n` (or `\r\n\r\n`)
directly.
**Reason**: found live, by instrumenting chunk-by-chunk logging in Phase 9's first AI Assistant
implementation. sse-starlette (the backend's SSE library) terminates every line with `\r\n` —
the SSE spec's canonical line ending — not the bare `\n` the first version of this parser
assumed. The practical effect was total silent failure: `fetch`'s `ReadableStream` delivered
every byte correctly and the stream closed cleanly (confirmed via `reader.read()` logging
showing all chunks and a final `done: true`), but `buffer.indexOf("\n\n")` never matched a
single frame in the entire stream, so `onEvent` was never called once — no captions, no
streamed text, no final answer, no error, just silent nothing. Chrome's network panel reporting
`net::ERR_ABORTED` on the connection's eventual close was a complete red herring that cost real
debugging time before the actual cause (frame-separator mismatch) was found by bisecting from
"the fetch resolves and the bytes are all there" down to "the parser's own split logic never
fires." Any future hand-written text-protocol parser in this codebase should assume `\r\n` by
default and verify against raw bytes before assuming `\n`.
**Alternatives rejected**: splitting on `\r\n\r\n` instead of normalizing first — works for this
specific backend but is more fragile if a proxy or future backend change ever emits mixed line
endings within one stream; normalizing once up front is strictly safer for the same cost.

### 2026-11-03 — Reduced motion must branch the render tree, not neuter motion props in place
**Decision**: when a component needs to skip animation under `uiStore.reduceMotion`, it must
render a genuinely different tree — a plain `<div>` instead of `motion.div`, or reuse
`src/components/Reveal.tsx`, which already does this — rather than conditionally passing
`undefined` for a `motion.*` component's `initial`/`animate`/`variants` props while leaving
child components with their own unconditional `variants={...}`.
**Reason**: found live, by screenshotting Phase 6's landing-page hero with Reduce-motion toggled
on (see `docs/phases/PHASE_06.md`) — the entire hero headline, subtext, and CTA button were
invisible. Framer Motion child components that only carry a `variants` map, with no actively
resolving `initial`/`animate` state from a parent (because the parent's own `variants` had been
set to `undefined`), get stuck at their `"hidden"` variant's styles (`opacity: 0`) and never
recover. This is **not** an edge case specific to one page — the same pattern was used in three
separate places in the same file before being caught, and would have shipped visibly broken
(literally invisible page content) to anyone with reduced-motion preferences, undercutting the
entire point of the toggle.
**Alternatives rejected**: passing `initial={false}` instead of `undefined` — closer, but still
leaves per-child `variants={fadeUp}` able to apply hidden styles if the component is ever
re-mounted rather than re-rendered (e.g. inside a list with changing `key`s), and is a subtler
rule to remember correctly every time versus a tree-level branch that's impossible to get wrong
the same way. Keeping the conditional-props version and "fixing it in place" by chasing every
instance — rejected in favor of refactoring the two scroll-revealed grids to reuse `Reveal` per
item, which removes the parent/child variants-coupling pattern entirely rather than patching
each occurrence of it.

### 2026-11-03 — `POST /api/conversations` added beyond Phase 4's literal "list/get" spec
**Decision**: added a `POST /api/conversations` endpoint (and that's it — no update/delete)
alongside the `list`/`get` the master prompt's Phase 4 plan named.
**Reason**: `app/agents/runs_store.py::save_message` (Phase 3) inserts into `messages` with a
`NOT NULL` FK to `conversations.id`. There was no endpoint anywhere that could create that row —
`chat.py` only ever received a `conversation_id` it assumed already existed. Without a create
endpoint, the frontend has no way to start a persisted conversation thread, which breaks the
"list/get" endpoints too (there'd be nothing to list). This is the same kind of forward-pull as
Phase 2's bandit code: building the one piece an already-committed later piece depends on.
**Alternatives rejected**: having `chat.py` silently auto-create a conversation row when
`conversation_id` is omitted — rejected because it hides a meaningful user action (starting a
new thread) inside a side effect of an unrelated endpoint, and still wouldn't have let the
frontend show a conversation list before the first message.

### 2026-11-03 — `reset_and_reseed()` truncates every seeded table, not just a subset
**Decision**: the admin "reset demo" backend (`app/seed/seed.py::reset_and_reseed`) issues one
`TRUNCATE ... CASCADE` across every table `poetry run seed` populates (including `users`), then
re-runs the normal seed script.
**Reason**: a presenter resetting between demo runs wants the exact pristine state Phase 2's
seed script produces — partial resets (e.g. only `agent_runs`/`feedback`) would leave behind
whatever the previous run's live chat created (new tickets, approvals, access requests, leave
requests) while silently keeping stale bandit learning from the decayed state, which would make
the Reinforcement Lab dashboard tell an inconsistent story. `CASCADE` handles the FK ordering
correctly in one statement; `schema_migrations` is deliberately excluded since the schema itself
never changes on a reset.
**Alternatives rejected**: `DELETE FROM` row-by-row in dependency order — functionally
equivalent but slower and more failure-prone to get the ordering right by hand; `TRUNCATE
CASCADE` is the standard Postgres idiom for "wipe this data graph."

### 2026-11-03 — `NodeInterrupt` + a module-level `MemorySaver` for the approval pause/resume
**Decision**: `request_access` pauses the LangGraph flow by raising
`langgraph.errors.NodeInterrupt`, with a single process-wide `MemorySaver()` checkpointer
instance (keyed by `thread_id=run_id`) shared by every graph build.
**Reason**: verified directly (see `docs/phases/PHASE_03.md`) that `NodeInterrupt` + a shared
checkpointer across two separately-compiled `StateGraph` objects correctly resumes from the
interrupted node via `update_state()` + `ainvoke(None, config)`. The langgraph version pinned
(`0.2.34`) predates the newer functional `interrupt()`/`Command(resume=...)` API, so the static
`NodeInterrupt` exception is the correct mechanism for this version. `MemorySaver` is in-memory
only (not persisted to disk/Postgres), which is fine for a local demo where the backend process
stays up between a pause and its resume, but means a server restart loses any run that's
mid-approval — acceptable for this project's scope; a real deployment would swap in a
Postgres-backed checkpointer.
**Alternatives rejected**: implementing the pause/resume as fully custom application logic with
no LangGraph interrupt primitive at all — would satisfy the demo's behavior but contradicts the
master prompt's explicit instruction ("request_access must pause the graph (LangGraph
interrupt)").

### 2026-11-03 — Graph nodes are closures over a per-run context, not state-embedded
**Decision**: `app/agents/graph.py::build_graph(ctx)` builds all node functions as closures
capturing a `RunContext` (the user dict + an `EventSink`), rather than putting the `EventSink`
or a DB handle inside the LangGraph `AgentState` TypedDict.
**Reason**: `AgentState` needs to stay a plain, update-mergeable TypedDict (LangGraph requires
every node to return a dict of state updates); stuffing a non-trivial object like an
`asyncio.Queue`-backed `EventSink` into it works with `MemorySaver` (which holds Python objects
in memory, not JSON) but conflates "data that describes this conversation turn" with "plumbing
for event delivery," and `resume_after_approval` needs a *fresh* `EventSink` anyway (continuing
the `seq` counter from where it left off) — so the closure approach, rebuilding the graph with a
new context each time `start_chat`/`resume_after_approval` is called, is simpler and keeps the
state schema honest.
**Alternatives rejected**: embedding `EventSink` in state — works but means the state schema and
the event-delivery plumbing would be the same object, with no clean seam for resuming with a
fresh `EventSink`.

### 2026-11-03 — Added Priya Sharma as a specific named seed employee
**Decision**: `app/seed/generators/users.py` seeds one specific employee, Priya Sharma
(`priya.sharma@acme.test`, Finance), rather than leaving all 48 users randomly generated.
**Reason**: master prompt section 0.7's showcase scenario 5 is literally "Show me Priya's
payslip" (the privacy-guard "wow moment") — the Guard-block demo needs a real person by that
exact first name to exist in the seed, or the scenario can't be run as written.
**Alternatives rejected**: rewriting the showcase scenario text to use a randomly-generated
name — rejected, since the scenario wording comes directly from the master prompt and future
phases (10B) will hard-code this scenario's script.

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
