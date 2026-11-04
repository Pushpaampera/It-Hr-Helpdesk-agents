# 07 — Changelog

### 2026-11-04 — 6-step overhaul: animation, mascot states, confirm-before-ticket chat, dashboard
### redesign, approvals safety, plain-English UI

Operator feedback on the first build: 3D/animation wasn't visibly working, the mascot was a
single static pose, the chatbot fired tickets automatically, the dashboard looked too plain for
an HR audience, approvals could be decided too easily, and some labels were jargon. Plan written
and approved before implementation (`~/.claude/plans/vivid-drifting-boole.md`, not checked into
the repo). All 6 steps verified: `poetry run pytest -q` → 25/25, `npx tsc -b --noEmit`/
`npm run build` clean, `LLM_MOCK_MODE=true` and `.env` untouched throughout.

**Step 1 — Animation.** Every dashboard page (`Approvals`, `AuditLog`, `ControlRoom`, `Costs`,
`Evaluation`, `HrInsights`, `KnowledgeBase`, `Overview`, `ReinforcementLab`, `Team`, `Tickets`)
had zero animation before this — now wrapped in a new `PageTransition` component and
`staggerContainer`/`fadeUp` motion (cards fade/stagger in on load), with `liftOnHover`/
`glowOnHover` CSS utilities on interactive cards. New `useCountUp` hook (used by Step 4).
`Scene.tsx`'s render loop now also drops to `"demand"` under the reduce-motion toggle, not just
when the tab is hidden. *See it:* open any dashboard page — cards animate in; toggle "Reduce
motion" in the sidebar and reload — everything is instant with no animation.

**Step 2 — One robot mascot everywhere.** `RoboCompanion` gained a real state machine — `idle`
(float/bob), `waving` (greeting), `thinking` (head-tilt, eye-scan), `working` (holographic
panel), `success` (jump + green flash), `blocked` (shield) — all still respecting reduce-motion.
New `AgentMascot` wrapper centralizes a per-agent accent-color map and is now used on Landing,
Login (new greeting robot), the AI Assistant's onboarding state (state driven by the live chat
lifecycle), the small panel inside `AgentActivityPanel`, and Approvals (flashes success/blocked
after a decision). *See it:* open Login — the robot waves then settles to idle; open AI
Assistant and ask a question — the mascot shows "thinking" then "working" while the answer is
built, then a brief "success" flash when resolved.

**Step 3 — The chatbot no longer auto-creates tickets (highest-risk change).** Old behavior: a
low-confidence answer created a ticket in the same turn, with no user input. New behavior: (1)
try to resolve from the knowledge base — mock-mode answers are now richer, formatting multi-line
source content as numbered steps and synthesizing from the top 2 chunks when their scores are
close, always citing sources; (2) show the answer and ask "Did this solve your problem?"; (3)
only on an explicit "no" (or a genuine no-match case) does it ask "Would you like me to open a
support ticket?"; (4) only an explicit "yes" to that creates the ticket. Implemented as two new
LangGraph nodes, `confirm_resolution`/`offer_ticket` (`backend/app/agents/graph.py`), reusing the
same `NodeInterrupt`+`MemorySaver` pause/resume mechanism the existing manager-approval flow
already proved out, plus a new `agent_runs` status (`awaiting_user_confirmation`, migration
`0002_confirmation_status.sql`) and a new SSE event type (`confirmation_required`). The
AI Assistant UI shows the answer plus Yes/No quick-reply buttons. Backend tests rewritten for the
new multi-turn flow (`backend/tests/test_agents_graph.py`), including a new test asserting no
ticket is ever created without an explicit "yes". *See it:* ask the AI Assistant a confident IT
question, click "No" when asked if it solved your problem — you'll get a ticket *offer*, not an
immediate ticket; click "Yes" on that offer and the ticket is created. Ask something with no
good match and it skips straight to the ticket offer.

**Step 4 — Dashboard redesign.** New shared `components/ui/StatCard` (count-up animated numbers,
optional sparkline, gradient-glass styling) replaces four independently-duplicated stat-card
implementations (`Overview`, `HrInsights`, `Costs`, `ReinforcementLab`). New
`components/dashboard/DashboardHeader` (time-of-day greeting + waving mascot) replaces the plain
`<h1>+<p>` intro on every page except Approvals, which already had its own bespoke
decision-aware header. Every recharts chart (`Overview`, `Costs`, `ReinforcementLab`,
`HrInsights`, `Evaluation`) gained a legend and proper axis unit labels it was missing; HR
Insights' hand-rolled leave-utilization `<div>` progress bar is now a real chart.
*See it:* open Overview/Costs/ReinforcementLab — KPI numbers count up on load, charts have
legends and labeled axes.

**Step 5 — Approvals safety.** Rejecting an access request or leave request now requires a
written reason (blocked both in the UI and server-side, including if the "confirm" button were
bypassed via devtools). A 5-second "Undo" toast follows every approve/reject decision on both
Approvals and HR Insights' leave decisions — undo reverts the decision record itself, not an
already-resumed agent run (that run has already continued by the time undo could fire; fully
unwinding a completed LangGraph run was explicitly out of scope for a 5-second window — see
`docs/06_DECISIONS.md`). New migration `0003_leave_request_undo.sql` adds a `decided_at` column
to `leave_requests` to check the window. *See it:* on Approvals, click Reject and try to confirm
with an empty reason — blocked; fill in a reason and confirm — a 5-second "Undo" toast appears.

**Step 6 — Plain English.** Every page (all 11 dashboard pages + AI Assistant) now has a
dismissible "what is this page?" banner with real, page-specific copy, and every KPI/chart has an
`(i)` tooltip (keyboard-accessible, not hover-only) explaining it in plain words. Renamed visible
jargon without touching any backend field name: ReinforcementLab's "arm"/"UCB score"/"pulls" →
"strategy"/"confidence score"/"times used", raw snake_case strategy ids title-cased on screen,
Costs' "By route" → "By specialist", AuditLog's "Actor"/"Target" → "Who"/"What it affected", and
more (full list in the implementation notes). *See it:* open any dashboard page — a banner under
the header explains it; hover or tab to any KPI's (i) icon for a plain-English explanation.

---

### 2026-11-04 — Rebrand to Ampera Helpdesk: real logo/colors, a 3D robot, and real-use UX fixes
Three commits from the same live-feedback session, after Phase 12 had already closed out the
original build plan — operator-driven polish/rebrand work, not a numbered phase.

- **Rebrand** (`7d0dfe2`, `7e4b636`): renamed "Helpdesk AI Agents" → "Ampera Helpdesk" everywhere
  (page title, landing header, dashboard sidebar, API title). Replaced an initially-invented
  orange "robotics" palette with the *real* Ampera brand colors — purple `#7C70AF` and steel-blue
  `#BDCFD6` — extracted directly from amperadei.com's CSS (not guessed), propagated through
  `tokens.css` and every hardcoded hex duplicate (3D orbs, data pulses, particle field, dashboard
  charts). Pulled the real Ampera logo PNG from the live site into `src/assets/`, used in the
  landing header and dashboard sidebar next to a "Helpdesk" wordmark styled in the same brand
  purple and weight (an initial mismatched-color attempt was corrected after operator feedback).
- **New `src/three/RoboCompanion.tsx`** (`7e4b636`): a procedural low-poly robot (boxy head,
  glowing eyes, antenna, torso, arms) built from Three.js primitives, with a real idle animation
  loop (bob, sway, head-turn, eye-glow pulse) respecting `reduceMotion`. Placed in the Landing
  hero and the AI Assistant activity panel; a second instance added to the Assistant's empty-chat
  state (`a302dbc`). Found and fixed a real visibility bug: high `metalness` with no environment
  map rendered the body nearly invisible against the dark background (only the emissive eyes
  showed) — fixed by lowering metalness and adding a faint emissive tint.
- **Real bug fix** (`7d0dfe2`): `knowledge_agent.py`'s unresolved-answer branch was discarding
  real retrieved article content and showing only a generic "not confident" message even when
  relevant articles were found — reported live as "agents never solve anything, just raise
  tickets." Now shows the closest related material honestly flagged as uncertain, while still
  creating a ticket as a safety net.
- **New `src/components/ui/ConfirmModal.tsx`** (`a302dbc`): Approvals and HR Insights' leave
  decisions now require an explicit second confirmation click with a plain-English explanation
  of what the decision does, instead of firing immediately — reported live as "we can mistakenly
  approve/reject with one click."
- **AI Assistant suggested-question chips** (`a302dbc`): a row of clickable starter questions
  (VPN, Wi-Fi, password reset, leave balance, policy, access request) replaces the old plain-text
  placeholder when the chat is empty.
- **Tickets conversation view** (`a302dbc`): the detail panel can expand "View the conversation
  that created this ticket," showing the real agent event transcript (reusing the existing
  `GET /api/runs/{id}/events`) instead of only the single "Tess created this ticket" timeline
  entry — reported live as "while opening we need to show that conversation properly."
- Verified throughout: `poetry run pytest -q` (24/24), `poetry run eval` (57/70, no regression),
  `npx tsc -b --noEmit`/`npm run build`, and live browser screenshots after every change (an
  initial robot placement overlapped the hero text and was clipped in the narrow Assistant panel;
  both were caught and fixed via live screenshots before committing).
- Why no `docs/phases/PHASE_13.md`: this was reactive UX/branding feedback on the already-shipped
  app, not a new planned feature phase — tracked here and in `docs/06_DECISIONS.md` instead.
  **Known gap**: these three commits landed without updating `PROGRESS.md`/`HANDOFF.md` in the
  same step, breaking the project's own resume-protocol discipline — caught when the operator
  asked "are you updating everything?" and fixed in the next commit.

### 2026-11-04 — Fix: greeting handling and a missing IT keyword in the OTHER-route fallback
- Changed: `backend/app/agents/graph.py::node_other_reply` now replies with a short, friendly
  greeting (addressed by first name) for a plain "hello"/"hi"/"hey"/etc. instead of reusing the
  generic "I'm not totally sure how to help with..." clarifying template. `backend/app/agents/
  supervisor.py`'s `IT_KEYWORDS` grew `"computer"`/`"desktop"`/`"hardware"`.
- Why: live operator testing found "hello" got the same confusing non-answer as any other vague
  message, and "i have a problem with my computer" looped back into the identical clarifying
  question a second time (no keyword matched "computer") instead of routing to IT — both read as
  the assistant not actually listening. See `docs/06_DECISIONS.md` for the full reasoning and
  rejected alternatives.
- Verified: `poetry run pytest -q` 24/24 still passing, `poetry run eval` still 57/70 (no
  regression), and both fixes confirmed live in a real browser — "hello" now gets a real greeting,
  the computer complaint now routes to Iris (IT) and creates a real ticket when retrieval isn't
  confident, rather than repeating the clarifying question.

### 2026-11-03 — Phase 11: Evaluation and polish
- Added: `frontend/src/pages/dashboard/{ControlRoom,ReinforcementLab,Evaluation,Costs,
  AuditLog}.tsx` — the last five admin-only nav items, completing every item in
  `navItems.ts`. `GET /api/agents/runs` (`backend/app/routers/agents.py`), recent runs across
  every user, backing Control Room. `GET /api/eval/runs/{id}` (`backend/app/routers/eval.py`),
  one eval run's full per-question breakdown. `GET /api/admin/audit-log` +
  `.../audit-log/actions` (`backend/app/routers/admin.py`), the first read-back of the
  `audit_log` table populated since Phase 1. `frontend/src/api/sse.ts` grew `streamGetSSE`, a
  GET sibling of the existing POST-only `streamSSE`, for `GET /api/agents/live`'s always-on feed.
- Changed: `frontend/src/api/types.ts` (`AgentStatus`, `RunSummary`, `RunEventsResponse`,
  `LiveAgentEvent`, `BanditArm`/`BanditStats`, `EvalSummary`/`EvalRun`/`EvalResult`/
  `EvalRunDetail`, `CostsResponse`, `AuditLogEntry`), `frontend/src/routes.tsx` (5 new routes),
  `frontend/src/layouts/navItems.ts` (all 5 flipped to `implemented: true` — every nav item is
  now implemented).
- Fixed: a real bug found via live browser testing — `Costs.tsx`'s "By route" breakdown keyed
  rows by `r.route`, but the backend groups by the raw column (`NULL` vs. the literal string
  `'OTHER'`), so two distinct rows can both display as `"OTHER"` and collide on a value-based
  React key. Fixed with an index key, the same fix class as Phase 9's resumed-run duplicate-key
  bug. See `docs/phases/PHASE_11.md`.
- Verified: `npx tsc -b --noEmit`/`npm run build` succeed; `poetry run pytest -q` 24/24 (the
  pre-existing intermittent flake noted in Phase 10 did not trigger this run); full live,
  functional end-to-end tests as admin covering every new page's core flow, including Control
  Room's live feed genuinely streaming a second, concurrently-logged-in employee session's real
  chat turn in real time, a real synchronous 70-question evaluation run with full per-question
  drill-down, and confirming server-side role enforcement on every admin-only endpoint.
- Why: this was the last feature phase on the original checklist (Phase 10B was explicitly
  skipped by the operator) — these five pages give an admin real operational visibility into
  the live multi-agent system, the bandit's learning, eval quality, spend, and the audit trail,
  closing out the dashboard's full intended nav structure from `docs/00_PROJECT_OVERVIEW.md`.

### 2026-11-03 — Phase 10: Remaining dashboard pages
- Added: `backend/app/routers/{team,hr_insights}.py` (`GET /api/team`; `GET /api/hr/overview`,
  `GET`/`PATCH /api/hr/leave-requests`) — no endpoint for "my direct reports" or "company-wide
  leave posture" existed before this phase. `frontend/src/pages/dashboard/
  {Tickets,Approvals,Team,HrInsights,KnowledgeBase}.tsx` — the five remaining `/app/*` nav items
  that were "Soon" placeholders through Phase 9.
- Changed: `backend/app/main.py` (registered the two new routers), `frontend/src/api/types.ts`
  (`TicketDetail`/`TicketEvent`, `Approval`, `TeamMember`, `HrOverview`, `LeaveRequest`,
  `KbResult`/`KbArticle`/`KbArticleDetail`/`KbChunk`), `frontend/src/routes.tsx` (5 new routes),
  `frontend/src/layouts/navItems.ts` (all 5 flipped to `implemented: true`).
- Fixed: a real bug found via live end-to-end browser testing — Approvals' decide button called
  `PATCH /api/approvals/{id}/decide` by analogy with every other new page's decide/update action,
  but that Phase-4-era endpoint is a `POST`. `tsc`/`npm run build` and a static screenshot both
  looked correct; only clicking "Approve" live surfaced the real `405`. Fixed by switching to
  `apiPost`. See `docs/phases/PHASE_10.md`.
- Verified: `npx tsc -b --noEmit`/`npm run build` succeed; `poetry run pytest -q` 24/25 (one
  pre-existing, unrelated intermittent failure, confirmed present on the clean Phase 9 tree via
  `git stash`); full live, functional end-to-end tests across all 4 demo roles (Chrome +
  playwright-core driving real clicks) covering every new page's core flow, including a live
  ticket status change, a live approval decide, a live leave-request decide, and confirming an
  employee hitting `/app/team` directly gets the backend's real `403`.
- Why: these were the last "Soon" dashboard placeholders a staff user would actually click
  during a demo. Team and HR Insights needed real backend endpoints built from scratch rather
  than placeholder UI, in keeping with `CLAUDE.md`'s "no placeholders" rule.

### 2026-11-03 — Phase 9: AI Assistant page (centerpiece)
- Added: `frontend/src/api/sse.ts` (manual SSE client for `POST /api/chat/stream`),
  `frontend/src/pages/dashboard/Assistant.tsx` (the real chat UI), `frontend/src/components/
  chat/{AgentActivityPanel,FeedbackWidget}.tsx` (Phase 5's 3D primitives wired to live SSE
  events for the first time).
- Changed: `frontend/src/api/types.ts` (full `ChatEvent` discriminated union, `Conversation`,
  `FeedbackResponse`), `frontend/src/routes.tsx` (`/app/assistant`), `frontend/src/layouts/
  navItems.ts` (AI Assistant flipped to implemented).
- Fixed: 3 real bugs found via live end-to-end browser testing, not static screenshots — a `\r\n`
  vs `\n` SSE frame-parsing mismatch that silently dropped every single event (see
  `docs/06_DECISIONS.md`); two of seven 3D agent orbs clipped outside the activity panel's
  camera frustum; a duplicate-React-key warning on resumed `request_access` runs (correct
  backend re-emission, wrong frontend key choice).
- Verified: `npx tsc -b --noEmit`/`npm run build` succeed; live, functional end-to-end tests
  covering a grounded IT answer with real citations and feedback submission, the complete
  `request_access` pause → real cross-session manager approval → automatic resume flow over the
  same open SSE connection, and an HR question under Reduce-motion.
- Why: this is the product's actual demo centerpiece — the page a non-technical audience
  watches to see the multi-agent system work. Getting the real-time visualization genuinely
  wired to genuine backend events (not a canned animation) is the whole point of the project's
  "cinematic frontend driven only by real backend SSE events" framing in
  `docs/00_PROJECT_OVERVIEW.md`.

### 2026-11-03 — Phase 8: Dashboard shell and Overview
- Added: `frontend/src/layouts/DashboardLayout.tsx` + `.module.css` (responsive sidebar+topbar
  shell, the project's first CSS module/real `@media` breakpoint), `navItems.ts` (role-aware nav
  table with "Soon" placeholders for every unbuilt dashboard page), `frontend/src/pages/
  dashboard/Overview.tsx` (staff KPI cards + `recharts` 30-day chart; employee own-activity
  view).
- Changed: `frontend/src/routes.tsx` (`/app` → `DashboardLayout` → `overview` nested route),
  `frontend/src/api/types.ts` (added `Kpis`, `TimeseriesPoint`, `TicketSummary`,
  `ConversationSummary`).
- Deleted: `frontend/src/pages/AppPlaceholder.tsx` (fully superseded by the real shell).
- Fixed: a real `tsc` type error in `navItems.ts` — a hand-rolled `ComponentType<{size}>` prop
  type for nav icons didn't structurally match lucide-react's actual `LucideIcon` type; fixed by
  importing that type directly instead of re-deriving it.
- Verified: `npx tsc -b --noEmit`/`npm run build` succeed; a full live end-to-end test (real
  backend + frontend dev server, Chrome + playwright-core) confirmed correct role-filtered
  navigation and Overview content for all 4 demo roles, that disabled nav items are inert, that
  the sidebar collapses to a mobile drawer correctly, and correct rendering under Reduce-motion.
- Why: this is the shell every Phase 9-11 dashboard page renders inside, and the first page to
  prove the Phase 4 role boundaries (`analytics` 403s for employee) actually shape what the UI
  shows, not just what the API allows.

### 2026-11-03 — Phase 7: Login page
- Added: `frontend/src/pages/Login.tsx` (real form + demo-account quick-picker),
  `AppPlaceholder.tsx` (temporary post-login landing, Phase 8 replaces it),
  `frontend/src/components/RequireAuth.tsx` (route guard), `frontend/src/components/ui/
  TextField.tsx`.
- Changed: `frontend/src/routes.tsx` (`/login` → `Login`; `/app` wrapped in `RequireAuth` →
  `AppPlaceholder`), `frontend/src/App.tsx` (calls `authStore.refreshMe()` on mount).
- Deleted: `frontend/src/pages/LoginPlaceholder.tsx` (fully superseded by `Login.tsx`).
- Verified: `npx tsc -b --noEmit`/`npm run build` succeed; a full live end-to-end test (real
  backend + frontend dev server, Chrome + playwright-core) confirmed the route guard, manual
  login, the demo quick-picker, the per-role "lands on" redirect text, sign-out, the wrong-
  password error state, and correct rendering under Reduce-motion.
- Why: this is the first page that actually exercises the Phase 4 JWT auth endpoints and the
  Phase 5 `authStore` from a real UI, and it's the gate every Phase 8+ dashboard route sits
  behind via `RequireAuth`.

### 2026-11-03 — Phase 6: Landing page
- Added: `frontend/src/pages/Landing.tsx` (real cinematic landing page), `LoginPlaceholder.tsx`
  (temporary, Phase 7 replaces it), `frontend/src/components/Reveal.tsx` (scroll-reveal wrapper,
  reduced-motion-safe).
- Changed: `frontend/src/routes.tsx` (`/` → `Landing`, `/login` → `LoginPlaceholder`),
  `frontend/src/three/Scene.tsx` (added an opt-in `bloom` prop via
  `@react-three/postprocessing`).
- Deleted: `frontend/src/pages/PlaceholderHome.tsx` (fully superseded by `Landing.tsx`).
- Fixed: a real bug caught via screenshot — the hero section's headline/subtext/CTA went fully
  invisible with Reduce-motion toggled on, because child `motion.*` components with only a
  `variants` prop never resolve off their hidden state without an actively-animating parent.
  Fixed by branching the render tree instead of conditionally nulling motion props; full
  writeup in `docs/06_DECISIONS.md`.
- Verified: `npx tsc -b --noEmit` and `npm run build` both succeed. A browser tool (Chrome +
  an ad hoc `playwright-core` install) was available this phase — screenshotted every section in
  both default and reduced-motion states, confirmed the fix, and confirmed zero app-level
  console errors.
- Why: this is the project's first real page and the first phase with actual visual
  verification tooling, which is exactly how it caught a bug that `tsc`/`npm run build` alone
  (Phase 5's only available checks) could never have found — a useful case study for why
  Phase 5's "not verified visually" caveat mattered.

### 2026-11-03 — Phase 5: Frontend design system and 3D building blocks
- Added: `frontend/src/store/uiStore.ts` (reduce-motion + tab-visibility), `authStore.ts`
  (JWT + user, persisted).
- Added: `frontend/src/api/client.ts`, `types.ts`.
- Added: `frontend/src/three/Scene.tsx`, `AgentOrb.tsx`, `DataPulse.tsx`, `ParticleField.tsx`.
- Added: `frontend/src/components/ReduceMotionToggle.tsx`,
  `frontend/src/components/ui/{Button,Badge,Panel}.tsx`.
- Changed: `frontend/src/pages/PlaceholderHome.tsx` — now showcases every new building block
  alongside the existing health check.
- Verified: `npx tsc -b --noEmit` and `npm run build` both succeed; `npm run dev` boots cleanly;
  a live full-stack check confirmed `/api/health` resolves through the Vite proxy. Visual/FPS
  confirmation in an actual browser was **not** possible this session (no browser tool
  available) — flagged for the operator in `docs/phases/PHASE_05.md` and `HANDOFF.md`.
- Why: Phase 1 already shipped the design tokens themselves; Phase 5 is what turns those tokens
  into the reusable pieces (3D primitives, UI atoms, state stores, API client) that Phase 6's
  landing page and every page after it will assemble, rather than each page reinventing them.

### 2026-11-03 — Phase 4: Auth, API surface, bandit and analytics
- Added: `backend/app/routers/auth.py` (`POST /api/auth/login`/`logout`, `GET /api/auth/me`).
- Added: `backend/app/deps.py::ensure_self_or_roles` — shared "own it, or have an elevated role"
  check.
- Added: `backend/app/routers/{conversations,tickets,kb,analytics,agents,bandit,eval,admin,
  costs}.py`, `backend/app/eval/run_eval.py` (real golden-set runner through the live agent
  graph), `backend/app/bandit/simulator.py` (`poetry run simulate-feedback`, drives the live
  bandit), `backend/app/observability.py` (optional Langfuse hook, no-op by default).
- Added: `backend/tests/test_auth_api.py` — 12 new tests (login for all 4 roles, 403 role/
  ownership enforcement, bandit update via feedback, simulator learning curve).
- Changed: `backend/app/routers/{chat,approvals,feedback}.py` — removed `user_id`/`approver_id`
  body fields in favor of the JWT-authenticated identity; added 403s for cross-user/cross-role
  access.
- Changed: `backend/app/main.py` — wired all 10 new routers, added a Prometheus middleware +
  `GET /metrics`.
- Changed: `backend/app/seed/seed.py` — added `reset_and_reseed()` (admin "reset demo" backend).
- Changed: `backend/app/agents/events.py`, `app/agents/graph.py` — added the optional Langfuse
  trace hook (`trace_event`/`trace_run_start`/`trace_run_end`), inert unless both Langfuse keys
  are set.
- Verified: `poetry run pytest -q` → 24 passed; `poetry run simulate-feedback --n 40` and
  `poetry run eval` both run successfully against the live seeded DB; live HTTP smoke test
  covering login for all 4 roles, the full chat SSE flow, and the full `request_access`
  approval flow with real approver-identity enforcement. Full detail in
  `docs/phases/PHASE_04.md`.
- Why: this is the phase that makes the backend's role boundaries real — every endpoint built in
  Phases 1-3 was intentionally open; Phase 4 closes that gap before any frontend ships against
  it, and adds the analytics/bandit/cost surfaces the Phase 8+ dashboard pages will read from.

### 2026-11-03 — Phase 3: Agents, graph, mock APIs and events
- Added: `backend/app/agents/llm.py` (provider wrapper, retries, fallback, mock mode),
  `events.py` (SSE event builder + live-queue registry), `guard.py`, `supervisor.py`,
  `knowledge_agent.py` + `it_support.py`/`hr_policy.py`, `action.py`, `ticketing.py`,
  `feedback.py`, `graph.py` (LangGraph wiring + pause/resume), `runs_store.py`.
- Added: `backend/app/mock_apis/` (`directory.py`, `hr_system.py`, `it_system.py`,
  `approvals.py`), `backend/app/bandit/store.py`.
- Added: `backend/app/routers/chat.py` (`POST /api/chat/stream` SSE, `GET /api/runs/{id}/events`),
  `approvals.py` (`POST /api/approvals/{id}/decide`), `feedback.py` (`POST /api/feedback`);
  wired into `app/main.py`.
- Added: `backend/tests/test_agents_graph.py` — the master prompt's 7 Phase 3 verification
  scenarios, all passing.
- Fixed: `app/seed/generators/users.py` now seeds a specific named employee (Priya Sharma) for
  the privacy-guard showcase scenario; `app/seed/seed.py` now advances `ticket_number_seq` past
  the hand-assigned seeded ticket numbers so live-created tickets don't collide. Database was
  truncated and re-seeded to pick up both fixes.
- Verified: `poetry run pytest -q` → 12 passed; manual HTTP/SSE smoke test confirmed real
  end-to-end streaming through `POST /api/chat/stream`. Full detail in
  `docs/phases/PHASE_03.md`.
- Why: this is the functional core of the product — a real multi-agent graph with a genuine
  human-in-the-loop approval pause, producing the exact event stream the Phase 5+ frontend will
  animate against.

### 2026-11-03 — Phase 2: Seed data and RAG
- Added: `backend/app/rag/` — `chunker.py`, `embedder.py` (local all-MiniLM-L6-v2),
  `reranker.py` (cross-encoder/ms-marco-MiniLM-L-6-v2), `strategies.py` (3 bandit arms),
  `retriever.py` (hybrid lexical+vector retrieval, RRF, exact-match boost).
- Added: `backend/app/bandit/features.py`, `backend/app/bandit/linucb.py` — pulled forward from
  Phase 4 (see `docs/06_DECISIONS.md`) so historical seed data has real bandit decisions/rewards.
- Added: `backend/app/seed/generators/knowledge.py` (100 articles), `users.py` (48 users),
  `ops.py` (leave/payslips/tickets/approvals/leave_requests/300 historical runs), `golden.py`
  (70-question golden set).
- Added: `backend/app/seed/seed.py` — idempotent orchestrator wired to `poetry run seed`.
- Added: `backend/tests/test_retrieval.py` — 4 regression tests for the retrieval acceptance
  criteria (exact error code rank-1 under lexical_heavy/hybrid_rerank, sensible semantic_heavy
  results for a vague query, dept filter correctness).
- Verified: `poetry run seed` populates all tables with exactly the spec's row counts; re-run is
  idempotent; `poetry run search` confirms the required ranking behavior; `poetry run pytest -q`
  → 5 passed. Full detail in `docs/phases/PHASE_02.md`.
- Why: establishes real, searchable knowledge content and a working hybrid RAG pipeline that
  Phase 3's agents will call directly.

### 2026-11-03 — Phase 1: Foundation
- Added: full repo layout (`backend/`, `frontend/`, `docs/`, `scripts/`) per
  `docs/01_ARCHITECTURE.md`.
- Added: `backend/pyproject.toml` (Poetry project, scripts: `migrate`, `seed`,
  `simulate-feedback`, `search`, `eval`, `dev`).
- Added: `backend/app/config.py`, `app/db.py`, `app/security.py`, `app/deps.py`, `app/main.py`
  (`/api/health`), `app/cli.py`.
- Added: `backend/app/models/base.py`, `app/models/user.py` (first ORM model).
- Added: `backend/migrations/0001_init.sql` — all 22 logical tables, pgvector + pgcrypto
  extensions, HNSW index on `kb_chunks.embedding` with automatic ivfflat fallback.
- Added: `frontend/` Vite + React 18 + TypeScript scaffold (`package.json`, `vite.config.ts`,
  `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/routes.tsx`,
  `src/design/tokens.css`, `src/design/global.css`, `src/design/motion.ts`,
  `src/pages/PlaceholderHome.tsx`).
- Added: `.env.example`, blank `.env` (operator-filled), `.gitignore`.
- Added: `CLAUDE.md`, `HANDOFF.md`, `PROGRESS.md`, `docs/00_PROJECT_OVERVIEW.md` through
  `docs/09_DEMO_SCRIPT.md` skeletons, `docs/phases/PHASE_01.md`.
- Why: establishes the foundation every later phase builds on, exactly as Phase 1 of the master
  build prompt specifies.
- Fixed: `pyproject.toml` switched from `package-mode = false` to `packages = [{include = "app"}]`
  so `poetry run <script>` entry points actually work.
- Fixed: `tenacity` relaxed to `>=8.1.0,<9.0.0` to satisfy `langchain-core`'s constraint.
- Verified: `poetry run migrate` applies cleanly against the operator's real Postgres 17
  instance (port 5433), `/api/health` reports a connected database with pgvector/HNSW enabled,
  both dev servers boot and the frontend reaches the backend through the Vite proxy. Phase 1
  marked **done** in `PROGRESS.md`.
