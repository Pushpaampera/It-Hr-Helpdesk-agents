# Phase 11 — Evaluation and polish

## Scope delivered
The last five admin-only `/app/*` pages, completing every nav item in `src/layouts/navItems.ts`:

1. **Control Room** (`/app/control-room`) — `src/pages/dashboard/ControlRoom.tsx`. Per-agent
   24h health cards (`GET /api/agents/status`), an always-on live feed of every user's agent
   activity across the whole company (`GET /api/agents/live`, SSE — existing endpoint, never
   consumed by any page before this), and a recent-runs table with a "Replay" control that opens
   a run's full event timeline (`GET /api/runs/{id}/events`, the endpoint
   `docs/01_ARCHITECTURE.md` already named "for the Replay control" back in Phase 3/4 but no page
   had used yet). Backed by a **new** `GET /api/agents/runs` endpoint (admin only) since no
   "recent runs across everyone" list existed.
2. **Reinforcement Lab** (`/app/reinforcement-lab`) — `src/pages/dashboard/ReinforcementLab.tsx`,
   backed entirely by the existing `GET /api/bandit/stats`: each retrieval strategy's pulls/
   average reward, cumulative regret vs. the leading arm, a reward-over-time line chart, and a
   per-context (dept × has-error-code) win-rate table.
3. **Evaluation** (`/app/evaluation`) — `src/pages/dashboard/Evaluation.tsx`. Triggers a real
   70-question golden-set run through the live agent graph (`POST /api/eval/run` — existing,
   same code path as `poetry run eval`), lists past runs (`GET /api/eval/runs`), and drills into
   one run's full per-question breakdown via a **new** `GET /api/eval/runs/{id}` endpoint (the
   old list endpoint only returned each run's rolled-up summary, not its individual
   `eval_results` rows).
4. **Costs** (`/app/costs`) — `src/pages/dashboard/Costs.tsx`, entirely backed by the existing
   `GET /api/costs`: totals, a 30-day daily cost chart, and breakdowns by route and by model.
5. **Audit Log** (`/app/audit-log`) — `src/pages/dashboard/AuditLog.tsx`, backed by **two new**
   endpoints (`backend/app/routers/admin.py`): `GET /api/admin/audit-log` (filterable by
   action/actor) and `GET /api/admin/audit-log/actions` (distinct action names for the filter
   dropdown). The `audit_log` table has been populated since Phase 1 by every
   `mock_apis/__init__.py::log_action` call, but nothing had ever read it back until this phase.

`src/api/types.ts` grew `AgentStatus`, `RunSummary`, `RunEventsResponse`, `LiveAgentEvent`,
`BanditArm`/`BanditStats`, `EvalSummary`/`EvalRun`/`EvalResult`/`EvalRunDetail`, `CostsResponse`,
`AuditLogEntry`. `src/api/sse.ts` grew `streamGetSSE` — a GET sibling of the existing
`streamSSE` (which is POST-only), since `GET /api/agents/live` needs the same manual
fetch-stream parsing but native `EventSource` still can't carry the bearer header.
`src/routes.tsx` and `src/layouts/navItems.ts` wired in all five routes; every nav item is now
`implemented: true`.

## Why three new backend endpoints
Same reasoning as Phase 10's Team/HR Insights additions: `CLAUDE.md`'s "no placeholders" rule
meant Control Room's recent-runs table and Audit Log couldn't ship without real backing data,
and neither "list recent runs across every user" nor "read back the audit_log table" had an
endpoint anywhere in the Phase 1-10 API surface. `GET /api/eval/runs/{id}` closes a narrower gap
— the list endpoint existed but only ever returned a run's rolled-up summary, never its 70
individual question results, which the drill-down view needs. All three follow the router
conventions already established (`require_roles`/`get_current_user` from `app/deps.py`, raw SQL
via `sqlalchemy.text`), admin-only.

## A real bug found and fixed via live verification
`Costs.tsx`'s "By route" breakdown originally keyed each row by `r.route`. `GET /api/costs`'s
`by_route` query (`backend/app/routers/costs.py`, untouched this phase) groups by the raw
`agent_runs.route` column, which can be `NULL` (never routed) as well as the literal string
`'OTHER'` — both get displayed as `"OTHER"` via `coalesce(route, 'OTHER')` in the `SELECT`, but
they're two distinct groups in the response array. With real seed data containing both, the
page rendered two rows with the identical `key="OTHER"`, producing React's duplicate-key
warning — caught live in the browser console, not by `tsc`/`npm run build`. Fixed by keying on
array index instead, the same fix class as Phase 9's resumed-run duplicate-key bug (don't trust
a backend-echoed value as a unique key unless the backend actually guarantees uniqueness).

## Files touched
- New (backend): none — all three new endpoints live in existing router files
  (`backend/app/routers/{agents,eval,admin}.py`).
- New (frontend): `src/pages/dashboard/{ControlRoom,ReinforcementLab,Evaluation,Costs,
  AuditLog}.tsx`.
- Modified: `backend/app/routers/{agents,eval,admin}.py` (new endpoints), `frontend/src/api/
  {types,sse}.ts`, `frontend/src/routes.tsx`, `frontend/src/layouts/navItems.ts`.

## Verification
- `poetry run pytest -q`: 24/24 pass this run (the intermittent pre-existing flake noted in
  `docs/phases/PHASE_10.md` did not trigger this time — still unfixed, still out of scope, see
  that doc).
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- New backend endpoints smoke-tested directly against the live seeded DB before any frontend
  code existed: `GET /api/agents/runs` returned real recent runs with correct user attribution;
  `GET /api/eval/runs/{id}` returned a real run's 70 individual question results with correct
  `question`/`expected_route`/`actual_route`/`correctness`; `GET /api/admin/audit-log` and
  `.../actions` returned real `audit_log` rows and a real distinct-action list (`apply_leave`,
  `approval_approved`, `guard_blocked`, `leave_request_approved`, `request_access`,
  `reset_password`, `unlock_account`); all three correctly `403` for a manager token.
- Full live, functional browser verification (Chrome + playwright-core driving real actions):
  - **Control Room**: all 7 agent health cards showed real 24h event/latency counts; the
    always-on live feed genuinely streamed a second, concurrently-logged-in employee session's
    real chat turn in real time, with correct user attribution per event (verified by opening
    Control Room as admin in one tab, sending a real chat message as `emma.employee@acme.test`
    in a second tab, and watching the exact event sequence — Sage routing, Iris retrieving,
    Atlas resetting the password — appear in the admin's live feed within ~2 seconds); clicking
    a recent-run row opened a real Replay panel with that run's full event timeline.
  - **Reinforcement Lab**: real arm stats (779 total pulls, `hybrid_rerank` leading at 0.896 avg
    reward), a populated reward-over-time chart (confirmed via raw SVG path data after the
    full-page screenshot's downscaling initially made the lines hard to see — not a bug, just a
    screenshot resolution artifact, confirmed by a cropped close-up render), and a real 13-row
    context win-rate table.
  - **Evaluation**: clicking "Run evaluation" triggered a real, synchronous 70-question run
    through the live agent graph (`POST /api/eval/run` → `200`), the new run appeared in the
    list (57/70, 81%), and drilling into it showed all 70 real individual question
    pass/fail/correctness rows with expected-vs-actual route.
  - **Costs**: real 30-day totals ($0.6527, 936+ runs), a populated daily cost chart, and
    by-route/by-model breakdowns — this is where the duplicate-`"OTHER"`-key bug above was
    caught and fixed; re-verified afterward with zero console errors.
  - **Audit Log**: real entries across every action type seeded/generated so far, correct actor
    names, and a working action-filter dropdown (verified filtering down to only `apply_leave`
    entries).
  - **Security**: a manager hitting `/app/reinforcement-lab` or `/app/costs` directly correctly
    saw real data rather than a 403 — this is *correct*, not a bug: `GET /api/bandit/stats` and
    `GET /api/costs` have been scoped to manager/hr/admin since Phase 4
    (`docs/03_BACKEND.md`'s endpoint table), and `navItems.ts` restricting those two nav links
    to admin is an information-architecture choice (keep the admin dashboard focused), not a
    security boundary. A manager hitting `/app/control-room`, `/app/evaluation`, or
    `/app/audit-log` directly correctly got the backend's real `403`, confirming those three
    endpoints' admin-only enforcement is genuinely server-side.
  - Console: zero app-level errors across every page (after the Costs fix); only the
    pre-existing favicon 404.

## Known issues / deferred
- The Costs/Reinforcement Lab pages are reachable (and functional) by a manager/hr user even
  though their nav links are admin-only — see "Security" above. Intentional, not a bug, but
  worth knowing if a future phase wants nav visibility and backend scope to match exactly.
- `test_agents_graph.py::test_e_unanswerable_question_creates_ticket` — still the same
  pre-existing, unrelated intermittent failure noted in `docs/phases/PHASE_10.md`. Did not
  trigger during this phase's final full-suite run, but hasn't been root-caused.
- `src/pages/dashboard/ControlRoom.tsx`'s agent status cards and `ReinforcementLab.tsx`'s
  `ARM_COLORS` are two more hand-duplicated hardcoded-value spots, same tradeoff already noted
  for `AgentOrb.tsx`'s `AGENT_COLORS` and `Overview.tsx`'s chart colors in `docs/04_FRONTEND.md`.
- `POST /api/admin/reset-demo` remains unused by the frontend — its UI was explicitly scoped to
  Phase 10B, which the operator skipped. The endpoint still works (`poetry run seed` / curl), it
  just has no button anywhere in the app.
