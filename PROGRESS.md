# PROGRESS.md

## RESUME HERE
- **All 12 planned phases are DONE** (Phase 10B explicitly skipped by operator instruction,
  2026-11-03). Since Phase 12 closed out the original checklist, the operator has been giving
  **live, direct UX/rebrand feedback on the running app**, worked on in real time rather than as
  numbered phases — see "Post-Phase-12 work" below. Treat this as an ongoing, feature-complete
  product being iterated on, not a finished/frozen build.
- Last updated: 2026-11-04
- Next step: none standing as a plan — this is now reactive, operator-directed work. If
  resuming, verify current state first (`poetry run pytest -q`, `npx tsc -b --noEmit`, a quick
  live login as each demo role) before assuming anything in this file is current, then check with
  the operator for what's next. **Update this file and `docs/07_CHANGELOG.md` in the same step
  as any further change** — a run of 3 commits after Phase 12 landed without doing this, caught
  when the operator asked "are you updating everything?"; don't repeat that gap.
- Blocker/dependency: none. `.env` is filled in and verified working end to end.
  `LLM_MOCK_MODE=true` so everything works without GROQ/GEMINI keys.
- Known pre-existing issue (unfixed, not blocking): `test_agents_graph.py::test_e_unanswerable_
  question_creates_ticket` fails intermittently — confirmed present on the clean Phase 9 tree,
  not yet root-caused. See `docs/phases/PHASE_10.md`.

## Post-Phase-12 work (2026-11-04, operator-directed live feedback, not a numbered phase)
Full detail in `docs/07_CHANGELOG.md`'s 2026-11-04 entries and `docs/06_DECISIONS.md`. Summary:
- **Rebrand**: "Helpdesk AI Agents" → "Ampera Helpdesk" everywhere. Real Ampera brand colors
  (purple `#7C70AF`, steel-blue `#BDCFD6`) and the real logo PNG, both pulled directly from the
  operator's actual company site (amperadei.com — `amperatech.ai` redirects there), replacing an
  initially-invented "robotics orange" palette the operator rejected.
- **New `RoboCompanion` 3D component**: a real animated robot (not an image) on the Landing hero
  and twice on the AI Assistant page.
- **Real bug fixed**: `knowledge_agent.py` was discarding real retrieved article content on
  low-confidence answers, showing only a generic "not confident" message — reported live as
  "agents never solve anything." Also fixed: a plain "hello" got the same confusing non-answer
  as any other vague message; `supervisor.py` was missing "computer" as an IT keyword.
- **New `ConfirmModal`**: Approvals/HR leave decisions now require an explicit confirm step
  (reported live as "we can mistakenly approve with one click").
- **AI Assistant**: suggested-question chips on the empty-chat state.
- **Tickets**: detail panel can expand to show the real conversation that created the ticket.
- All verified: `poetry run pytest -q` 24/24, `poetry run eval` 57/70 (no regression), `tsc`/
  `build` clean, live browser screenshots after each change.

## Phase checklist

| # | Phase | Status | Date | Result |
|---|-------|--------|------|--------|
| 1 | Foundation | done | 2026-11-03 | Repo layout, Poetry project, 22-table SQL migration (24 tables incl. bookkeeping), `/api/health` verified against a real DB with pgvector/HNSW enabled, Vite+React+TS scaffold verified serving and proxying to the backend. |
| 2 | Seed data and RAG | done | 2026-11-03 | 48 users, 100 KB articles (130 chunks), 200 tickets, 80 approvals, 150 leave requests, 300 historical runs, 70 golden questions. Hybrid retrieval verified: exact error codes rank #1, semantic search sensible, dept filter correct. |
| 3 | Agents, graph, mock APIs and events | done | 2026-11-03 | 7 agents + LangGraph flow with real NodeInterrupt pause/resume for manager approval. All 7 master-prompt verification scenarios (a)-(g) pass. SSE streaming confirmed end to end over real HTTP. |
| 4 | Auth, API surface, bandit and analytics | done | 2026-11-03 | JWT login/me/logout for all 4 demo roles; chat/approvals/feedback retrofitted to use the authenticated identity; 10 new routers (conversations, tickets, kb, analytics, agents incl. live SSE, bandit, eval, admin, costs); real golden-set eval runner; live-bandit feedback simulator; `/metrics`; optional Langfuse hook. |
| 5 | Frontend design system and 3D building blocks | done | 2026-11-03 | zustand stores (`uiStore`, `authStore`), API client, `Scene`/`AgentOrb`/`DataPulse`/`ParticleField` 3D primitives, hand-rolled `Button`/`Badge`/`Panel` UI atoms, `ReduceMotionToggle`; showcased in an extended `PlaceholderHome`. |
| 6 | Landing page | done | 2026-11-03 | Cinematic hero (Scene+bloom, 7 AgentOrbs, DataPulse, ParticleField), "Meet the team"/"How it works" sections, Reveal scroll animations, LoginPlaceholder stub. Found and fixed a real Reduce-motion bug via screenshot verification. |
| 7 | Login page | done | 2026-11-03 | Real email/password form + demo-account quick-picker calling `POST /api/auth/login`, RequireAuth route guard, role-aware "lands on" redirect, AppPlaceholder post-login stand-in. Verified end to end live against a running backend with a browser tool. |
| 8 | Dashboard shell and Overview | done | 2026-11-03 | DashboardLayout (responsive sidebar+topbar shell, first CSS module), role-aware navItems with "Soon" placeholders for future phases, Overview page (staff KPIs+chart via recharts; employee own-tickets view). Verified live across all 4 roles, mobile, reduced motion. |
| 9 | AI Assistant page (centerpiece) | done | 2026-11-03 | Real chat UI against POST /api/chat/stream (manual SSE client), 3D AgentOrb/DataPulse wired to live events, live caption log, feedback widget, full request_access pause/resume working end to end through the UI. Found/fixed 3 real bugs via live browser verification. |
| 10 | Remaining dashboard pages | done | 2026-11-03 | Tickets, Approvals, Team, HR Insights, Policy Knowledge Base pages, all wired to real data; two new backend routers (`team`, `hr_insights`) since no endpoint for direct-reports/company-leave-posture existed before. Found/fixed 1 real bug via live verification (Approvals decide used wrong HTTP method). |
| 10B | Demo experience layer (HR showcase) | skipped | 2026-11-03 | Skipped by explicit operator instruction — not needed for this project. |
| 11 | Evaluation and polish | done | 2026-11-03 | Control Room, Reinforcement Lab, Evaluation, Costs, Audit Log — the last 5 admin nav items. 3 new backend endpoints (recent runs, eval run detail, audit log read-back). Found/fixed 1 real bug via live verification (Costs' route-breakdown duplicate React key). |
| 12 | Documentation and final verification | done | 2026-11-04 | Fixed stale doc forward-references (Phase 10B, Phase 10-vs-11 mix-ups), rewrote the Phase-1-stub testing doc with real results, wrote the demo script, extended the runbook. Final full live sweep across all 4 roles: zero errors. No app code changed. |

## Verification output log
(Appended to at the end of each phase.)

### Phase 1 — DONE
- `npm install` in `frontend/`: succeeded, 193 packages. `npm run dev` verified to boot and
  serve `200` on `http://localhost:5173/`, and `GET /api/health` through the Vite proxy returned
  the full healthy payload.
- `poetry install` in `backend/`: succeeded (~16 min first install for torch/sentence-
  transformers). Verified imports of fastapi, sqlalchemy, psycopg, sentence_transformers, groq,
  langgraph.
- `poetry run pytest -q`: `1 passed` (`test_health.py`).
- `poetry run migrate`: succeeded — `[migrate] pgvector extension is enabled`,
  `[migrate] 0001_init OK`, `[migrate] all migrations applied`. 24 tables confirmed present;
  `idx_kb_chunks_embedding` confirmed using the `hnsw` access method (no ivfflat fallback
  needed on this server).
- `GET /api/health` on the real backend: `{"status":"ok", "mock_mode":true,
  "database":{"connected":true}, "pgvector":{"enabled":true}}`.
- Full details, exact commands and problems-fixed in `docs/phases/PHASE_01.md`.

### Phase 2 — DONE
- `poetry run seed`: all row counts match spec exactly (users=48, knowledge_articles=100,
  kb_chunks=130, leave_balances=192, payslips=144, tickets=200, ticket_events=352, approvals=80,
  access_requests=80, leave_requests=150, agent_runs=300, agent_events=1206, feedback=300,
  bandit_arms=3, bandit_state=3, bandit_decisions=249, bandit_rewards=249, golden_questions=70).
  Completed in 11.1s. Re-run confirmed idempotent (no duplication).
- `poetry run search "VPN error 619" --strategy lexical_heavy` and `--strategy hybrid_rerank`
  both rank "VPN Error 619: causes and fix" at #1.
- `poetry run search "my laptop is super slow" --strategy semantic_heavy` returns sensible
  laptop/Wi-Fi results (no exact keyword overlap possible — pure semantic match).
- `poetry run search "parental leave policy" --strategy hybrid_rerank --dept HR` returns only
  HR-dept parental-leave articles, confirming the dept filter.
- `poetry run pytest -q`: `5 passed` (health check + 4 retrieval regression tests).
- Full details, exact commands and problems-fixed in `docs/phases/PHASE_02.md`.

### Phase 3 — DONE
- `poetry run pytest -q`: **12 passed** (1 health + 4 retrieval + 7 agent-graph scenarios).
- Scenario (a) VPN 619 → IT route, cited "VPN Error 619" source, `status=resolved`.
- Scenario (b) sick days → HR route, answer uses the employee's own real leave balance.
- Scenario (c) reset password → `action` tool_call `reset_password`, resolved.
- Scenario (d) "I need access to the Finance system" → `approval_required` event,
  `status=awaiting_approval`; after a manager approves via `approvals_api.decide()` +
  `resume_after_approval()`, run becomes `resolved`.
- Scenario (e) unanswerable question → ticket created, `status=escalated`, ticket summary
  mentions the original question.
- Scenario (f) "Show me Priya's payslip" → Guard blocks it, logs `audit_log` action
  `guard_blocked` for the requester.
- Scenario (g) every run's `agent_events` have strictly increasing, unique `seq` numbers.
- Manual HTTP smoke test: `POST /api/chat/stream` streamed real SSE events (`agent_event`,
  `handoff`, `token`, `final`) end to end through a live `uvicorn` server.
- Two real bugs found and fixed via this scenario testing: a missing `Priya` seed user, and a
  ticket-number sequence that wasn't advanced past the hand-seeded ticket numbers (both in
  `docs/phases/PHASE_03.md` and `docs/06_DECISIONS.md`).
- Full details, exact commands and problems-fixed in `docs/phases/PHASE_03.md`.

### Phase 4 — DONE
- `poetry run pytest -q`: **24 passed** (12 from Phases 1-3 + 12 new in `tests/test_auth_api.py`):
  login works for all 4 demo roles; wrong password and missing token are both rejected;
  `employee` gets `403` on `/api/analytics/kpis` and `POST /api/eval/run`; `hr` gets `200` on
  analytics; `employee` gets `403` reading another user's run events; `POST /api/feedback`
  visibly increments `bandit_state.pulls`; `run_simulation(60)` produces a defined learning
  curve.
- `poetry run simulate-feedback --n 40` against the live seeded DB: all three bandit arms'
  pulls and average reward moved (e.g. `hybrid_rerank: pulls 137 -> 151, avg_reward 0.786 ->
  0.802`).
- `poetry run eval` against the live seeded DB, through the real agent graph: `57/70 passed
  (pass_rate=0.8143, avg_correctness=0.8476)`.
- Live HTTP smoke test on port 8077: all 4 demo logins; conversation create; KB search (VPN 619
  still ranks #1); employee's own-tickets list; `/api/agents/status`; analytics 403 for employee
  / 200 for hr; a full authenticated chat SSE turn end to end; the full `request_access`
  approval flow (employee's chat pauses, the real manager sees it pending, a non-approver gets
  `403` trying to decide it, the real approver's `200` resumes the run to `resolved`).
- Full details in `docs/phases/PHASE_04.md`.

### Phase 5 — DONE
- `npx tsc -b --noEmit`: no type errors.
- `npm run build`: succeeds (only the expected "three.js is a large chunk" bundler note).
- `npm run dev`: boots cleanly on port 5173; Vite's dependency optimizer picked up the new
  `@react-three/fiber`/`three`/`zustand`/`zustand/middleware` usage with no transform errors.
- Live full-stack check: backend on port 8000 + `npm run dev` on 5173 simultaneously; `GET
  http://localhost:5173/api/health` through the Vite proxy returned the real healthy payload.
- Not verified: actual visual rendering / frame rate / the Reduce-motion toggle's visible effect
  in a real browser — no browser/screenshot tool is available in this session. Flagged in
  `docs/phases/PHASE_05.md` for the operator to confirm directly.
- Full details in `docs/phases/PHASE_05.md`.

### Phase 6 — DONE
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- A browser tool was available this phase (Chrome + playwright-core, installed ad hoc for
  verification, not added to `package.json`): screenshotted the hero, team, steps, and login
  placeholder sections, and toggled Reduce-motion live via the on-page control.
- Caught a real bug this way: the hero's headline/subtext/CTA were fully invisible with
  Reduce-motion on. Root cause and fix in `docs/06_DECISIONS.md`; re-screenshotted after the fix
  to confirm all three affected sections (hero, team grid, steps grid) now render correctly in
  both states.
- Console check: zero app errors; the only logged message is the browser's default
  `/favicon.ico` 404 (pre-existing since Phase 1, no `<link rel="icon">` was ever added).
- Full details in `docs/phases/PHASE_06.md`.

### Phase 7 — DONE
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- Full end-to-end live test (real backend on port 8000 + `npm run dev` on 5173, driven by Chrome
  + playwright-core, not just static screenshots): `/app` redirects to `/login` when logged out;
  manual login as `emma.employee@acme.test` succeeds against the real API and redirects to
  `/app` showing "AI Assistant" as its landing page; sign-out returns to `/`; the demo quick-
  picker logs in as `alex.admin@acme.test` in one click and correctly shows "Control Room";
  wrong password shows "Invalid email or password" inline; Reduce-motion toggled on the login
  page keeps the form fully visible (no repeat of Phase 6's bug).
- Full details in `docs/phases/PHASE_07.md`.

### Phase 8 — DONE
- `npx tsc -b --noEmit` and `npm run build`: both succeed (one real type error caught and fixed:
  `navItems.ts`'s hand-rolled icon prop type didn't structurally match lucide-react's actual
  `LucideIcon` type — fixed by importing that type directly).
- Full end-to-end live test across all 4 demo roles, mobile viewport, and reduced motion (real
  backend + frontend dev server, Chrome + playwright-core): admin sees the full nav set and real
  KPI/chart data; employee sees only Overview/AI Assistant/Tickets and their own real open-
  ticket list (not another employee's); manager sees Overview/AI Assistant/Tickets/Approvals/
  Team; clicking a disabled "Soon" nav item does nothing (confirmed via unchanged URL); mobile
  (420px) sidebar correctly collapses to a hamburger-triggered drawer; HR dashboard renders
  correctly under Reduce-motion.
- Full details in `docs/phases/PHASE_08.md`.

### Phase 9 — DONE
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- Live end-to-end tests against a real backend + frontend dev server (Chrome + playwright-core):
  a grounded VPN-619 IT answer with cited sources, full caption sequence, live handoff beam, and
  a submitted 5-star rating; the complete `request_access` approval pause/resume across two
  separate logged-in sessions (employee's chat pauses with a visible banner, a real manager
  decides it via the real API, the employee's still-open connection resolves automatically); an
  HR leave-balance question under Reduce-motion.
- Found and fixed 3 real bugs this way: SSE parsing silently never fired a single event because
  of a `\r\n` vs `\n` mismatch (see `docs/06_DECISIONS.md`); two of seven 3D orbs were clipped
  outside the activity panel's narrow camera frustum; a duplicate-React-key warning on resumed
  runs (backend behavior was correct — Atlas genuinely re-emits on resume — frontend key choice
  was the bug).
- Full details in `docs/phases/PHASE_09.md`.

### Phase 10 — DONE
- `poetry run pytest -q`: 24/25 pass; the one failure
  (`test_e_unanswerable_question_creates_ticket`) reproduced identically with this phase's diff
  `git stash`ed, confirming it's pre-existing on the Phase 9 tree and unrelated to this phase's
  changes.
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- New `GET /api/team` and `GET /api/hr/overview`/`GET`+`PATCH /api/hr/leave-requests` endpoints
  smoke-tested directly against the live seeded DB before any frontend existed: correct real
  per-manager team data, correct company-wide HR numbers, correct `409` on re-deciding an
  already-decided leave request, correct `403` for an employee token on all three.
- Full live, functional end-to-end tests across all 4 demo roles (Chrome + playwright-core
  driving real clicks, not static screenshots): Tickets (role-scoped lists, detail timeline,
  live status/priority PATCH persisting after reload); Approvals (live decide moving an approval
  from Pending to Approved with a real timestamp — this is where a real POST-vs-PATCH bug was
  caught and fixed, see `docs/phases/PHASE_10.md`); Team (a real manager's 9 direct reports with
  correct per-person ticket/leave counts); HR Insights (real company headcount/leave data, a
  live leave-request approval, correct at 390px mobile); Policy Knowledge Base (search matching
  Phase 2's CLI retrieval results exactly, side-by-side strategy comparison, article reader);
  and confirmed an employee hitting `/app/team` directly gets the backend's real `403`, not a
  silently-broken page — role enforcement is genuinely server-side.
- Full details in `docs/phases/PHASE_10.md`.

### Phase 11 — DONE
- `poetry run pytest -q`: 24/24 pass this run (the pre-existing intermittent flake noted in
  Phase 10's log did not trigger).
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- New `GET /api/agents/runs`, `GET /api/eval/runs/{id}`, `GET /api/admin/audit-log` (+
  `.../actions`) smoke-tested directly against the live seeded DB before any frontend existed:
  correct real recent-runs/eval-breakdown/audit-log data, correct `403` for a manager token on
  all three.
- Full live, functional end-to-end tests as `alex.admin@acme.test` (Chrome + playwright-core):
  Control Room's live feed genuinely streamed a second, concurrently-logged-in employee
  session's real chat turn in real time with correct attribution (verified across two browser
  tabs); Reinforcement Lab's real bandit stats and reward-over-time chart (confirmed via raw SVG
  path data when a full-page screenshot's downscaling initially made the chart lines hard to
  see — not a bug); Evaluation triggered a real synchronous 70-question run through the live
  agent graph and showed its full per-question breakdown; Costs showed real 30-day totals and
  breakdowns — this is where a real duplicate-React-key bug was caught and fixed (two distinct
  backend route groups both display as "OTHER"); Audit Log showed real entries with working
  action filtering. Confirmed a manager hitting `/app/control-room`, `/app/evaluation`, or
  `/app/audit-log` directly gets the backend's real `403` (genuinely server-side enforcement),
  while `/app/reinforcement-lab`/`/app/costs` correctly show real data for a manager — those two
  backend endpoints have been manager/hr/admin-scoped since Phase 4, nav-hiding them from
  managers is IA, not security.
- Full details in `docs/phases/PHASE_11.md`.

### Phase 12 — DONE
- `poetry run pytest -q`: **24/24 passed** (final run).
- `poetry run eval`: **57/70 passed (81.43%, avg correctness 0.8381)** — IT 26/30, HR 31/40,
  matching every prior run in this project's history; all 13 failures individually diagnosed and
  logged in `docs/08_TESTING_AND_EVAL.md` (route-classification misses under mock mode, 1
  retrieval near-miss, 1 pure eval-harness limitation).
- `npx tsc -b --noEmit` and `npm run build`: both succeed.
- Full live sweep across all 4 demo roles (Chrome + playwright-core): every nav item each role
  can see loads without a role-denied message or fetch error (3 pages for employee, 5 for
  manager, 5 for hr, 9 for admin); sign-out correctly returns to the landing page for every role;
  zero console errors except the pre-existing favicon 404.
- Verified the demo script's numeric claims directly: a live `POST /api/eval/run` timed at
  49.8s ("under a minute" — true).
- Documentation audit: fixed stale forward-references in `docs/01_ARCHITECTURE.md` (a dead link
  to the never-built `PHASE_10B.md`, a Phase-10-vs-11 mix-up on `GET /api/agents/live`, an
  overstated event-mapping summary) and `docs/02_DATABASE.md` (Reinforcement Lab phase number);
  rewrote `docs/08_TESTING_AND_EVAL.md` from its untouched-since-Phase-1 stub; wrote
  `docs/09_DEMO_SCRIPT.md`; extended `docs/05_RUNBOOK.md`; added a decision-log entry recording
  the Phase 10B skip; rewrote `README.md`'s stale "Phase 1 quickstart" pointer.
- `POST /api/admin/reset-demo` was not re-run live this phase — correctly blocked by the
  sandbox's irreversible-local-destruction safeguard; relied on its unchanged code and Phase 4's
  original verification instead.
- Full details in `docs/phases/PHASE_12.md`.

**Every phase on the original checklist is now complete.**
