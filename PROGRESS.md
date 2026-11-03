# PROGRESS.md

## RESUME HERE
- Current phase: **Phase 8 — Dashboard shell and Overview: DONE.** Next up: **Phase 9 — AI
  Assistant page (centerpiece)** (not started; awaiting operator go-ahead, since this session
  pauses between phases on request).
- Last updated: 2026-11-03
- Next step: start Phase 9 — the AI Assistant page, the project's centerpiece: the real chat UI
  against `POST /api/chat/stream`, wired to the Phase 5 3D building blocks
  (`AgentOrb`/`DataPulse`/etc.) per the event→animation mapping documented in
  `docs/04_FRONTEND.md`. Replaces the "AI Assistant" nav item's `implemented: false` in
  `src/layouts/navItems.ts`.
- Blocker/dependency: none currently. `.env` is filled in and verified working end to end. Phase
  8 built the real dashboard shell (`DashboardLayout` + role-aware `navItems`) and the first
  real dashboard page (`Overview`, with staff/employee variants and the project's first
  `recharts` chart), verified end to end live (real backend + frontend, Chrome +
  playwright-core) across admin/manager/hr/employee roles, mobile viewport, and reduced motion.
  `LLM_MOCK_MODE=true` is set so everything built so far works without GROQ/GEMINI keys.
  Langfuse tracing (`app/observability.py`) stays a no-op until both keys are set and
  `poetry add langfuse` has been run — neither is needed for the demo.

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
| 9 | AI Assistant page (centerpiece) | not started | | |
| 10 | Remaining dashboard pages | not started | | |
| 10B | Demo experience layer (HR showcase) | not started | | |
| 11 | Evaluation and polish | not started | | |
| 12 | Documentation and final verification | not started | | |

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
