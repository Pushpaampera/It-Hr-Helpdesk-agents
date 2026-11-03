# Phase 4 — Auth, API surface, bandit and analytics

## Scope delivered
1. **JWT auth** (`app/routers/auth.py`): `POST /api/auth/login` (bcrypt verify, issues a JWT via
   `app/security.py::create_access_token`), `POST /api/auth/logout` (stateless no-op
   acknowledgement — JWTs aren't server-tracked), `GET /api/auth/me`. `app/deps.py` already had
   `get_current_user`/`require_roles` scaffolded since Phase 1; this phase is the first to wire
   them onto real routers. Added `app/deps.py::ensure_self_or_roles(user, resource_user_id,
   *roles)` — the recurring "own it, or have an elevated role" check used by chat, feedback,
   conversations and tickets.
2. **Retrofitted Phase 3 routers**: `chat.py`, `approvals.py`, `feedback.py` no longer take
   `user_id`/`approver_id` in the request body — the authenticated identity is used instead.
   `GET /api/runs/{id}/events` and `POST /api/feedback` now 403 if the caller isn't the run's
   own user (or manager/hr/admin for runs; admin for feedback). `POST /api/approvals/{id}/decide`
   403s unless the caller is the approval's actual `approver_id` (or an admin).
3. **New routers**:
   - `conversations.py` — `POST/GET /api/conversations`, `GET /api/conversations/{id}`. Added
     `POST` beyond the original spec ("list/get") because `app/agents/runs_store.py::save_message`
     requires an existing `conversations` row (FK, `NOT NULL`) before it can attach a message —
     without a create endpoint the frontend would have no way to start a persisted thread.
   - `tickets.py` — list (employees see only their own; manager/hr/admin see all, with
     `status`/`category` filters), detail (+ `ticket_events`), `PATCH` (staff-only: status,
     priority, assignee, with an automatic `ticket_events` note).
   - `kb.py` — `search` (one strategy), `compare` (all three strategies side by side, for the
     "why did the bandit pick this" demo view), `articles/{id}` (article + its chunks).
   - `analytics.py` — `kpis`, `timeseries`, `departments`, over `agent_runs`/`feedback`/
     `tickets`/`approvals`. manager/hr/admin only.
   - `agents.py` — `status` (per-agent 24h event counts/latency/errors) and `live`, the
     always-on aggregated SSE stream from `docs/01_ARCHITECTURE.md`'s "not yet built" note —
     implemented as a 1s poll of `agent_events` by `ts`, anonymised (no requester name/id)
     unless the caller is an admin.
   - `bandit.py` — `stats`: arm pulls, average reward, a cumulative-regret estimate relative to
     the best-performing arm, per-day reward trend, and per-context (dept × has-error-code) win
     counts.
   - `eval.py` — `POST /run` (admin-triggered golden-set run, synchronous — mock mode makes 70
     questions fast enough), `GET /runs` (history). Backed by the new `app/eval/run_eval.py`.
   - `admin.py` — `POST /reset-demo` (admin-only; wipes every seeded table via
     `app/seed/seed.py::reset_and_reseed` and reseeds from scratch). The full showcase control
     (confirmation modal, progress animation) is Phase 10B's job — this is its backend.
   - `costs.py` — token/cost breakdown by day, route, and model. manager/hr/admin only.
4. **`app/eval/run_eval.py`**: runs all 70 golden questions through the *real* agent graph
   (`start_chat`, same code path as live chat) as a fixed demo employee, scores route accuracy,
   source-citation accuracy (did the cited sources include an expected one), and escalation
   behaviour (did it create a ticket iff `should_escalate`); persists to `eval_runs`/
   `eval_results`. `poetry run eval` prints a pass-rate summary; `POST /api/eval/run` is the same
   logic as an async request.
5. **`app/bandit/simulator.py`**: `poetry run simulate-feedback --n 500` generates synthetic
   feedback against the *live* `bandit_state` (reloading arms from the DB every iteration, the
   same tables the real agents read/write) — not a disposable copy. Reward is weighted so
   `lexical_heavy`/`hybrid_rerank` win on error-code queries and `semantic_heavy`/
   `hybrid_rerank` win on vague ones, demonstrating the intended learning pattern while updating
   `bandit_state` incrementally, exactly like `app/seed/generators/ops.py::generate_historical_runs`
   already does for the 300 seeded runs (see `docs/06_DECISIONS.md`).
6. **`GET /metrics`** (Prometheus, `prometheus-client` — already a Phase 1 dependency, unused
   until now): request count and latency histograms by method/path/status, via a FastAPI
   middleware in `app/main.py`.
7. **Optional Langfuse hook** (`app/observability.py`): a true no-op unless both
   `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set (they're empty in this environment);
   even then it degrades to a one-time warning if the `langfuse` package isn't installed
   (`poetry add langfuse` is left to whoever actually enables it, to keep the base install light
   for an offline demo). Wired into `app/agents/events.py::EventSink.emit` and
   `app/agents/graph.py`'s run start/end so every agent event and run outcome would mirror to
   Langfuse if enabled. Every call is wrapped so a Langfuse failure can never break a demo.

## Files touched
- New: `app/routers/{auth,conversations,tickets,kb,analytics,agents,bandit,eval,admin,costs}.py`,
  `app/eval/run_eval.py`, `app/bandit/simulator.py`, `app/observability.py`,
  `tests/test_auth_api.py`.
- Modified: `app/deps.py` (`ensure_self_or_roles`), `app/routers/{chat,approvals,feedback}.py`
  (JWT retrofit), `app/main.py` (router wiring, CORS unchanged, `/metrics`), `app/seed/seed.py`
  (`reset_and_reseed`), `app/agents/events.py` + `app/agents/graph.py` (observability hook).

## Verification
- `poetry run pytest -q`: **24 passed** (12 from Phases 1-3 + 12 new Phase 4 tests in
  `tests/test_auth_api.py`): login succeeds for all 4 demo roles (`emma.employee`/
  `mark.manager`/`hannah.hr`/`alex.admin`, password `Demo@1234`) and fails on a wrong password;
  an unauthenticated request to `/api/auth/me` is rejected; an `employee` calling
  `/api/analytics/kpis` or `POST /api/eval/run` gets `403`; `hr` can access analytics; an
  `employee` cannot read another user's `/api/runs/{id}/events` (`403`); `POST /api/feedback`
  visibly increments the matching `bandit_state.pulls`; `run_simulation(60)` leaves every arm's
  `pulls` count at or above where it started with a defined `avg_reward`.
- `poetry run simulate-feedback --n 40` against the live seeded DB: all three arms' pulls and
  average reward moved (e.g. `hybrid_rerank: pulls 137 -> 151, avg_reward 0.786 -> 0.802`).
- `poetry run eval` against the live seeded DB: `57/70 passed (pass_rate=0.8143,
  avg_correctness=0.8476)`, IT `26/30`, HR `31/40` — a real run through the live agent graph,
  not a canned number.
- Live HTTP smoke test (`uvicorn` on port 8077, since 8000/8001 are occupied by unrelated
  sandbox services): logged in as all 4 demo accounts; created a conversation; searched the KB
  (`VPN error 619` → "VPN Error 619: causes and fix" at #1, same as Phase 2); listed an
  employee's own tickets (13); fetched `/api/agents/status`; confirmed `/api/analytics/kpis`
  403s for `employee` and 200s for `hr`; ran a full authenticated chat SSE turn end to end
  (VPN 619 → resolved with cited source); ran the full `request_access` approval flow —
  employee's chat paused with `approval_required`, the real manager (`mark.manager`) saw it via
  `GET /api/approvals?status=pending`, a *different* user (`emma.employee`, not the approver)
  got `403` trying to decide it, the real approver's decision returned `200` and the paused run
  resumed to `status: resolved`.

## Known issues / deferred
- `app/eval/run_eval.py` doesn't attempt to resume paused (`request_access`) golden questions —
  they're scored as a correctness penalty via `paused_for_approval`, not handled end to end.
  Fine for Phase 4; Phase 11 (Evaluation and polish) can extend this if the golden set grows
  access-request cases.
- `GET /api/agents/live` polls `agent_events` every second rather than using a real pub/sub —
  acceptable for a local single-process demo (matches the existing per-run `asyncio.Queue`
  approach in `app/agents/events.py`), revisit only if this ever runs multi-process.
- `app/observability.py` requires `poetry add langfuse` to actually do anything even with keys
  set — intentional, not a placeholder: the keys are empty in this environment, so this never
  needed to be exercised, and keeping it out of the default dependency set matches the "no
  Docker/sudo, everything runs locally with zero API keys" hard constraint.
