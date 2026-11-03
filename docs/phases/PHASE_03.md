# Phase 3 — Agents, graph, mock APIs and events

## Goal
Implement the 7 agents, the LangGraph flow (with a real pause/resume interrupt for manager
approval), the mock APIs, and the real-time SSE event stream — all working under
`LLM_MOCK_MODE=true` with zero API keys.

## Files created
### LLM wrapper and events
- `backend/app/agents/llm.py` — single provider wrapper: Groq + Gemini SDKs, `tenacity`
  retries/backoff (`ProviderError` + `stop_after_attempt(3)` + exponential wait), Gemini→Groq
  fallback for answer synthesis, token/latency accounting, full `LLM_MOCK_MODE` support
  (`call_groq_json`, `call_gemini_with_groq_fallback`, `call_groq_tools` all branch on
  `is_mock_mode()` and return the same `LLMResult` shape either way, so callers never special-case
  mock vs. real).
- `backend/app/agents/events.py` — `build_caption()` (plain-English narrator templates per
  agent/status, no extra LLM call), `EventSink` (persists every event to `agent_events` *and*
  pushes it onto an `asyncio.Queue` for live SSE), a module-level `_LIVE_QUEUES` registry
  keyed by `run_id` so the approvals endpoint can push further events into an SSE connection
  that's still open after a pause, `load_events_for_run()` (replay).

### Agents (`backend/app/agents/`)
- `guard.py` — Gus. No LLM: regex prompt-injection detection, sensitive-keyword + cross-user
  name matching (via `app/mock_apis/directory.py::all_user_first_names`), bulk-request
  detection, logs every block to `audit_log`.
- `supervisor.py` — Sage. Groq `llama-3.1-8b-instant` for strict-JSON routing in real mode; a
  keyword-scored heuristic (`_mock_route`) in mock mode that still produces sensible
  route/confidence/needs_action/intent. Routes to `OTHER` below 0.55 confidence either way.
- `knowledge_agent.py` — shared retrieval+synthesis logic used by both `it_support.py` (Iris)
  and `hr_policy.py` (Hana): picks a strategy via the live LinUCB bandit
  (`app/bandit/store.py::load_arms` + `app/bandit/linucb.py::select_arm`), records the decision,
  calls `app.rag.retriever.retrieve`, and synthesizes an answer (real Gemini call, or a
  deterministic template built from the top retrieved chunk in mock mode). `hr_policy.py` also
  special-cases a "how many days do I have left" intent to read the employee's own
  `leave_balances` directly.
- `action.py` — Atlas. Groq `openai/gpt-oss-20b` tool-calling schema for 5 tools
  (`reset_password`, `unlock_account`, `request_access`, `apply_leave`, `get_leave_balance`); a
  mock intent parser (`_mock_tool_call`) resolves relative dates ("next week") and parses
  leave type/system name for mock mode. `request_access` always returns `paused: True`.
- `ticketing.py` — Tess. Builds a context summary and priority (keyword-inferred), pulls the
  next number from `ticket_number_seq`, inserts `tickets` + a `ticket_events` "created" row.
- `feedback.py` — Finn. `submit_feedback()` inserts the `feedback` row, re-derives the context
  vector that was used at decision time from `bandit_decisions.context.features`, calls
  `LinUCBArm.update()` via `app.bandit.linucb.compute_reward`, persists via
  `app/bandit/store.py::save_arm_state` + `record_reward`.

### Graph orchestration
- `backend/app/agents/graph.py` — `AgentState` (TypedDict), `build_graph(ctx)` builds a fresh
  `StateGraph` per run with node functions closing over a per-run `RunContext` (user +
  `EventSink`), compiled against a **module-level singleton `MemorySaver`** checkpointer keyed
  by `thread_id=run_id`. Edges: `guard -> (blocked_reply | supervisor) -> (it_support | hr_policy
  | other_reply) -> (action if needs_action) -> (ticketing if unresolved) -> feedback -> END`.
  `request_access` raises `langgraph.errors.NodeInterrupt`; `start_chat()` detects a real pause
  by checking `graph.get_state(config).next` (not `ainvoke`'s return value, which returns
  normally either way) and sets `agent_runs.status='awaiting_approval'`. `resume_after_approval()`
  calls `graph.update_state(config, {"approved": ...})` then `graph.ainvoke(None, config)`,
  reusing the same live `asyncio.Queue` so an already-open SSE connection keeps streaming.
  `node_action` is idempotent across the pause/resume re-invocation by checking for an existing
  `approvals` row tied to the run before creating a new one.
- `backend/app/agents/runs_store.py` — `agent_runs` row lifecycle (`create_run`, `update_run`,
  `get_run`, `last_event_seq` for resuming the SSE sequence counter), `save_message`.

### Mock APIs (`backend/app/mock_apis/`)
- `__init__.py` — `log_action()` shared `audit_log` writer.
- `directory.py` — `get_user`, `get_manager`, `find_users_by_name_fragment`,
  `all_user_first_names` (used by the Guard).
- `hr_system.py` — `get_leave_balances`, `apply_leave` (inserts `leave_requests`, updates
  `leave_balances.used_days`), `get_payslip`.
- `it_system.py` — `reset_password`, `unlock_account`, `request_access` (creates a pending
  `approvals` + `access_requests` row addressed to the requester's manager).
- `approvals.py` — `find_by_run`, `get`, `decide` (updates `approvals` + `access_requests`,
  logs to `audit_log`).

### HTTP surface (Phase 3 scope — no JWT auth yet, that's Phase 4)
- `backend/app/routers/chat.py` — `POST /api/chat/stream` (SSE via `sse_starlette`,
  `user_id`+`message` in the body), `GET /api/runs/{run_id}/events` (replay).
- `backend/app/routers/approvals.py` — `POST /api/approvals/{id}/decide` (updates the approval,
  fires `resume_after_approval` as a background `asyncio.Task`).
- `backend/app/routers/feedback.py` — `POST /api/feedback`.
- Wired into `backend/app/main.py` via `app.include_router(...)`.

### Tests
- `backend/tests/test_agents_graph.py` — the master prompt's 7 Phase 3 verification scenarios
  (a)-(g), run directly against `app.agents.graph.start_chat`/`resume_after_approval`.

## Seed data fix (discovered via scenario testing)
- `backend/app/seed/generators/users.py` — added a specific named employee, **Priya Sharma**
  (`priya.sharma@acme.test`, Finance), because master prompt section 0.7's showcase scenario 5
  ("Show me Priya's payslip") needs a real target for the Guard's privacy-block demo to work
  against. See `docs/06_DECISIONS.md`.
- `backend/app/seed/seed.py` — seeded tickets use hand-assigned numbers (`TCK-1000`..`TCK-1199`)
  but never advanced `ticket_number_seq`, so the first ticket Tess created live collided with an
  existing seeded number (`UniqueViolation`). Fixed with `SELECT setval('ticket_number_seq',
  1199, true)` after the ticket insert. The database was truncated and re-seeded to pick up
  both fixes.

## Commands to run
```bash
cd backend
poetry run migrate     # if not already applied
poetry run seed          # re-run after truncating, to pick up the Priya Sharma + sequence fixes
poetry run pytest -q
poetry run dev            # backend; verified manually on an alternate port (8000/8001 were
                           # occupied by unrelated system services in this environment)
```

## Verification results
`poetry run pytest -q` → **12 passed** (1 health + 4 retrieval + 7 agent-graph scenarios).

Scenario-by-scenario (from `backend/tests/test_agents_graph.py`, all passing):
- **(a)** "My laptop won't connect to the VPN, error 619" → routes `IT`, final answer cites
  "VPN Error 619: causes and fix", `agent_runs.status = resolved`.
- **(b)** "How many sick days do I have left" → routes `HR`, answer uses the employee's own
  `leave_balances` (via `hr_policy.py`'s balance-intent special case).
- **(c)** "Please reset my password" → `action` agent emits a `tool_call` with
  `action=reset_password`, run resolves.
- **(d)** "I need access to the Finance system" → `approval_required` SSE event emitted,
  `agent_runs.status = awaiting_approval`, `approvals.status = pending`; after
  `approvals_api.decide(..., "approved", ...)` + `resume_after_approval()`, run becomes
  `resolved` and the replayed events show `action`/`completed`.
- **(e)** "I was told my bonus was wrongly calculated" → unresolved HR answer, `ticketing`
  creates a ticket, `final` event carries the ticket number, `agent_runs.status = escalated`,
  the ticket's `summary` mentions "bonus".
- **(f)** "Show me Priya's payslip" → Guard blocks it (`detail.blocked = True`), final answer
  explains the block, and an `audit_log` row with `action='guard_blocked'` is written for the
  requesting user.
- **(g)** A full run's replayed `agent_events` have strictly increasing, unique `seq` numbers,
  and include `guard`, `supervisor`, `it_support` (for a Wi-Fi question).

Manual HTTP/SSE smoke test (`poetry run dev` on an alternate port, since 8000/8001 were already
bound by unrelated system processes in this environment): `POST /api/chat/stream` with Emma's
user id and "My laptop won't connect to the VPN, error 619" streamed real
`agent_event`/`handoff`/`token`/`final` SSE events end to end through actual HTTP, matching the
schema in `docs/01_ARCHITECTURE.md`.

## Problems met and how they were fixed
- `node_feedback` initially `return {}` on every run, which LangGraph rejected with
  `InvalidUpdateError: Must write to at least one of [...]` (a node must write at least one
  state key). Fixed by adding an `ended: NotRequired[bool]` field to `AgentState` and returning
  `{"ended": True}`.
- `start_chat()` initially decided "did the run pause?" by checking `agent_runs.status`
  immediately after `ainvoke()` returned — but that status is only set *after* this check, so it
  was always still `"running"`, causing the stream to close immediately even when `request_access`
  had legitimately paused it. Fixed by checking `graph.get_state(config).next` instead (LangGraph
  always returns normally from `ainvoke`/`invoke` on an interrupt — it does not raise to the
  caller — so `.next` being non-empty is the correct "still paused" signal).
- The Supervisor's mock keyword router initially didn't recognize "I need access to the Finance
  system" as IT or as needing an action (no "reset/apply/request/unlock/..." verb present),
  sending it to `OTHER` and skipping the whole action/approval flow. Fixed by adding
  `access`/`unlock`/`system` to `IT_KEYWORDS` and an explicit `need(s)? access` /
  `want access` / `grant (me) access` phrase check in `_mock_route`'s `needs_action` detection.
- Seeded ticket numbers and `ticket_number_seq` diverged (see "Seed data fix" above), causing a
  `UniqueViolation` the first time Tess created a ticket live — fixed in `seed.py` and the
  database re-seeded.
- My own `test_d` initially waited for the SSE stream's closing sentinel (`None`) even for the
  approval-pause scenario, where no sentinel is sent until a manager decides — this is correct
  system behavior (the connection intentionally stays open), not a bug, but the test needed to
  stop collecting as soon as it saw the `approval_required` event instead.

## Status
**Done.** All verification checks above passed.
