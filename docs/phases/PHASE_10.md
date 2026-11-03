# Phase 10 — Remaining dashboard pages

## Scope delivered
Five `/app/*` pages that were "Soon" nav placeholders since Phase 8, each wired to real backend
data (no mock/placeholder content):

1. **Tickets** (`/app/tickets`, all roles) — `src/pages/dashboard/Tickets.tsx`. Employees see
   their own tickets; manager/hr/admin see every ticket (status-filter chips, already enforced
   server-side by the existing `GET /api/tickets`). Selecting a row opens a detail panel
   (`GET /api/tickets/{id}`) with the real event timeline; staff can change status/priority
   inline via `PATCH /api/tickets/{id}` (already existed — this phase only added the UI).
2. **Approvals** (`/app/approvals`, manager/admin) — `src/pages/dashboard/Approvals.tsx`. Lists
   approvals by status (pending/approved/rejected) via `GET /api/approvals?status=`, decides via
   `POST /api/approvals/{id}/decide` — the same endpoint Phase 9's approval test drove with
   direct `fetch()` calls, now with a real page. Deciding resumes the paused agent run
   server-side exactly as before; this page gives that pause/resume flow a UI a manager can
   actually use.
3. **Team** (`/app/team`, manager only) — `src/pages/dashboard/Team.tsx`, backed by a **new**
   `GET /api/team` endpoint (`backend/app/routers/team.py`, manager/admin only). No endpoint for
   "my direct reports" existed before this phase; it returns each report plus real signal
   (open/total ticket counts, pending leave requests, last AI Assistant activity) so a manager
   can spot who needs attention without opening Tickets/Approvals per person.
4. **HR Insights** (`/app/hr-insights`, hr only) — `src/pages/dashboard/HrInsights.tsx`, backed
   by **two new** endpoints (`backend/app/routers/hr_insights.py`, hr/admin only):
   - `GET /api/hr/overview` — headcount by department, leave-request counts by status, leave
     balance utilization by type, upcoming approved leave.
   - `GET /api/hr/leave-requests` (+ `PATCH /api/hr/leave-requests/{id}/decide`) — the real
     pending leave requests seeded at ~15% of 150 (`app/seed/generators/ops.py`), which had no
     decision mechanism anywhere before this phase. Deciding `approved` increments the matching
     `leave_balances.used_days` row, mirroring `mock_apis/hr_system.py::apply_leave`'s side
     effect.
5. **Policy Knowledge Base** (`/app/kb`, hr/admin) — `src/pages/dashboard/KnowledgeBase.tsx`.
   Search (`GET /api/kb/search`, dept filter), a "Compare strategies" side-by-side view
   (`GET /api/kb/compare` — the same lexical/semantic/hybrid comparison the bandit picks
   between), and an article reader (`GET /api/kb/articles/{id}`) — all three endpoints already
   existed from Phase 4; this phase only built the page.

`src/api/types.ts` grew `TicketDetail`/`TicketEvent`, `Approval`, `TeamMember`, `HrOverview`,
`LeaveRequest`, `KbResult`/`KbArticle`/`KbArticleDetail`/`KbChunk`. `src/routes.tsx` and
`src/layouts/navItems.ts` wired in all five routes and flipped their nav items to
`implemented: true`.

## Why two new backend endpoints
`CLAUDE.md`'s "no placeholders" rule meant Team and HR Insights couldn't ship as thin wrappers
around existing endpoints — no "my direct reports" or "company leave posture" endpoint existed
anywhere in the Phase 1-9 API surface (`docs/03_BACKEND.md`'s table through Phase 4 confirms
this). Both new routers follow the exact pattern of `backend/app/routers/{tickets,costs}.py`:
raw SQL via `sqlalchemy.text`, `require_roles`/`get_current_user` from `app/deps.py`, server-side
role enforcement (never UI-only, per the hard constraint). `GET /api/team` additionally accepts
an admin-only `?manager_id=` override since an admin has no `manager_id` of their own to default
to.

## A real bug found and fixed via live verification
The Approvals page's decide button initially called `apiPatch("/approvals/{id}/decide", ...)`,
matching the PATCH convention every *other* new page's decide/update action uses (`PATCH
/api/tickets/{id}`, the new `PATCH /api/hr/leave-requests/{id}/decide`). But
`backend/app/routers/approvals.py`'s `/decide` route — built back in Phase 4, before this phase
touched it — is a **POST**, not a PATCH. `npx tsc`/`npm run build` both passed cleanly (the
mismatch is only visible at the HTTP layer), and a static screenshot of the Approvals page looked
correct. It was only caught by actually clicking "Approve" in a live browser and watching the
page render `{"detail": "Method Not Allowed"}` instead of the approval moving to the Approved
tab. Fixed by switching the frontend call to `apiPost`. This is the same lesson Phase 9's
`HANDOFF.md` already flagged generally — "drive the actual flow with real actions... don't just
screenshot a static load" — now with a concrete instance of a bug a static load would have missed
entirely but one real click caught immediately.

## Files touched
- New (backend): `backend/app/routers/team.py`, `backend/app/routers/hr_insights.py`.
- New (frontend): `src/pages/dashboard/{Tickets,Approvals,Team,HrInsights,KnowledgeBase}.tsx`.
- Modified: `backend/app/main.py` (registered the two new routers), `frontend/src/api/types.ts`,
  `frontend/src/routes.tsx`, `frontend/src/layouts/navItems.ts`.

## Verification
- `poetry run pytest -q`: 24/25 pass. The one failure
  (`test_agents_graph.py::test_e_unanswerable_question_creates_ticket`) is confirmed **pre-
  existing and unrelated to this phase** — reproduced identically with this phase's entire diff
  `git stash`ed, i.e. on the exact Phase 9 tree `HANDOFF.md` described as "24 passed." Not
  investigated further since it's outside Phase 10's scope (no agent/graph/ticketing code was
  touched this phase); flagged below as a new known issue for whichever phase next touches
  `app/agents/graph.py` or `app/agents/ticketing.py`.
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- New backend endpoints smoke-tested directly against the live seeded DB before any frontend
  code existed: `GET /api/team` as `mark.manager@acme.test` returned his real 9 direct reports
  with correct per-person ticket/leave counts; `GET /api/hr/overview`/`GET
  /api/hr/leave-requests?status=pending` as `hannah.hr@acme.test` returned real company-wide
  numbers (48 headcount, 24 pending leave requests at the time); `PATCH
  /api/hr/leave-requests/{id}/decide` approved a real pending request, re-deciding it correctly
  returned `409`; all three new/touched endpoints correctly `403` for an employee token.
- Full live, functional browser verification (Chrome + playwright-core driving real actions, not
  static screenshots) across all 4 demo roles:
  - **Tickets**: employee sees only her own 19 tickets; manager/admin see every company ticket
    with a requester column; opening a row shows its real event timeline; changing a ticket's
    status via the dropdown issued a real `PATCH` (confirmed `200`) and the new status persisted
    after reload, including under Reduce-motion.
  - **Approvals**: the pending tab showed 5 real `access_request` approvals (the same kind Phase
    9's test created); clicking "Approve" issued the real `POST .../decide`, the approval moved
    to the Approved tab with a real `decided_at` timestamp, and the pending count dropped by
    one — this is where the POST-vs-PATCH bug above was caught and fixed.
  - **Team**: `mark.manager@acme.test` saw his real 9 direct reports with correct open-ticket
    and pending-leave badges (e.g. Emma Employee showing 18 open tickets, matching her real
    ticket list).
  - **HR Insights**: `hannah.hr@acme.test` saw real company-wide headcount (48, by department),
    leave-balance utilization bars, upcoming approved leave, and 20+ real pending leave requests;
    approving one issued a real `PATCH` (confirmed `200`); verified correctly at a 390px mobile
    viewport (sidebar collapses to a hamburger drawer, stat cards stack).
  - **Policy Knowledge Base**: searching "VPN error 619" returned the same top-ranked "VPN Error
    619: causes and fix" article Phase 2's retrieval regression test already verified at the CLI
    level; "Compare strategies" showed the three bandit-arm strategies side by side with visibly
    different scores (hybrid_rerank: 9.877, lexical_heavy: 1.461, semantic_heavy: 1.409 for the
    top hit) — the same comparison the bandit picks between; clicking a result opened the real
    article body with its markdown headings rendered.
  - **Security**: an employee navigating directly to `/app/team` (not shown in her nav since her
    role isn't in that item's `roles` list) correctly got the backend's real `403 Requires role
    in ('manager', 'admin')` message in the page's error panel — confirming role enforcement is
    genuinely server-side, not just a hidden nav item, per the hard constraint.
  - Console: zero app-level errors across every page/role; only the pre-existing favicon 404.

## Known issues / deferred
- `test_agents_graph.py::test_e_unanswerable_question_creates_ticket` fails intermittently
  (reproduced consistently in this session, confirmed pre-existing and present on the clean
  Phase 9 tree) — the mock "unanswerable → ticket" path for "I was told my bonus was wrongly
  calculated" sometimes returns `resolved` instead of escalating. Not investigated this phase;
  worth a look whenever `app/agents/knowledge_agent.py`/`ticketing.py` is next touched.
- `GET /api/team` always returns direct reports with `is_active` only; an admin viewing another
  manager's team via `?manager_id=` was not exercised in live verification (only the no-param
  "my own team" path was), though it's covered by the same role/ownership logic.
- The Tickets table has no pagination — fine at the current ~200-row seed scale, would need one
  before a much larger demo dataset.
