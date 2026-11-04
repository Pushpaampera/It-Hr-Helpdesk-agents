# HANDOFF.md — paste-ready continuation prompt

If you are a new Claude Code session or account picking this up, read `CLAUDE.md`, then this
file, then `PROGRESS.md`, then `docs/phases/PHASE_12.md`, in that order, before touching code.

## Current state (2026-11-04) — feature-complete, now in active live-feedback polish
**Every phase on the original checklist (1-12) is DONE and verified end to end**, including live
browser-driven checks for every frontend phase (6-12) — each tested as real functional flows
(real clicks/form submissions/decisions, not just static screenshots). Phase 10B (Demo
experience layer / HR showcase) was **skipped by explicit operator instruction (2026-11-03)** —
not needed for this project. **Every nav item in `src/layouts/navItems.ts` is `implemented:
true`.**

**Since then, the operator has been giving live, direct UX/rebrand feedback on the running app**
(not structured as phases) — see "Post-Phase-12 work" in `PROGRESS.md` and
`docs/07_CHANGELOG.md`'s 2026-11-04 entries for the full list (rebrand to real Ampera branding, a
3D robot companion, a real "agents discard retrieved content" bug fix, approval confirmation
modals, suggested-question chips, a ticket conversation viewer). **This is now ongoing reactive
work, not a finished/frozen build** — a new session should expect more of the same kind of
feedback rather than treating Phase 12 as the true end state.

What exists and is verified working:
- **Foundation** (Phase 1): Poetry project, `/api/health`, all 22 tables migrated, Vite+React+TS
  scaffold.
- **RAG + seed data** (Phase 2): hybrid retrieval, `poetry run seed` populates everything.
- **Agents + graph** (Phase 3): all 7 agents, LangGraph `StateGraph` with a real
  `request_access` pause/resume — now proven working through the real frontend, not just the
  backend test suite.
- **Auth, API surface, bandit and analytics** (Phase 4): every backend endpoint is behind real
  JWT auth. See `docs/03_BACKEND.md` for the full endpoint table.
- **Frontend design system and 3D building blocks** (Phase 5): `src/store/{uiStore,authStore}.ts`,
  `src/api/{client,types}.ts`, `src/three/{Scene,AgentOrb,DataPulse,ParticleField}.tsx`,
  `src/components/ReduceMotionToggle.tsx`, `src/components/ui/{Button,Badge,Panel,TextField}.tsx`.
- **Landing page** (Phase 6): `src/pages/Landing.tsx`, `src/components/Reveal.tsx`.
- **Login page** (Phase 7): `src/pages/Login.tsx`, `src/components/RequireAuth.tsx`.
- **Dashboard shell and Overview** (Phase 8): `src/layouts/DashboardLayout.tsx` (+
  `.module.css`), `navItems.ts`, `src/pages/dashboard/Overview.tsx`.
- **AI Assistant page** (Phase 9): `src/pages/dashboard/Assistant.tsx` (real chat UI against
  `POST /api/chat/stream`), `src/api/sse.ts` (manual SSE client — native `EventSource` can't do
  POST + auth headers), `src/components/chat/{AgentActivityPanel,FeedbackWidget}.tsx` (Phase 5's
  3D building blocks now wired to real events for the first time: handoff beams, active-agent
  pulsing, a live caption narrator log).
- **Remaining dashboard pages** (Phase 10): `src/pages/dashboard/{Tickets,Approvals,Team,
  HrInsights,KnowledgeBase}.tsx`. Two new backend routers,
  `backend/app/routers/{team,hr_insights}.py` (`GET /api/team`; `GET /api/hr/overview`,
  `GET`/`PATCH /api/hr/leave-requests`), since no endpoint for "my direct reports" or
  "company-wide leave posture" existed before.
- **Evaluation and polish** (Phase 11): `src/pages/dashboard/{ControlRoom,ReinforcementLab,
  Evaluation,Costs,AuditLog}.tsx` — the last five admin-only nav items. Three new backend
  endpoints: `GET /api/agents/runs` (recent runs across everyone, backs Control Room),
  `GET /api/eval/runs/{id}` (one eval run's full per-question breakdown),
  `GET /api/admin/audit-log` + `.../actions` (the `audit_log` table, populated since Phase 1,
  read back for the first time). `src/api/sse.ts` grew `streamGetSSE`, a GET sibling of the
  existing POST-only `streamSSE`, for `GET /api/agents/live`'s always-on feed. **Every nav item
  is now `implemented: true`.**
- **Documentation and final verification** (Phase 12): no application code — a full accuracy
  pass over every `docs/*.md` file, `docs/08_TESTING_AND_EVAL.md` rewritten with real results,
  `docs/09_DEMO_SCRIPT.md` written, a final live sweep across all 4 roles and every nav item.
- **Post-Phase-12 rebrand/UX fixes** (2026-11-04, operator live feedback, 3 commits): real
  Ampera branding (logo + colors pulled from amperadei.com, not invented), a new `RoboCompanion`
  3D component, a real bug fix in `knowledge_agent.py` (was discarding retrieved content on
  low-confidence answers), `ConfirmModal` for Approvals/HR leave decisions, AI Assistant
  suggested-question chips, a ticket conversation viewer. Full detail: `docs/07_CHANGELOG.md`'s
  2026-11-04 entries, `docs/06_DECISIONS.md`. These 3 commits initially landed **without**
  updating `PROGRESS.md`/`HANDOFF.md` in the same step — a real process gap, caught when the
  operator asked "are you updating everything?" and fixed in the commit right after this one.
- `backend/tests/test_agents_graph.py` (12) + `backend/tests/test_auth_api.py` (12) —
  `poetry run pytest -q` → **24/24 passed**, confirmed again after the post-Phase-12 fixes (the
  one pre-existing, unrelated intermittent failure — see "Known issues" below — still unfixed,
  didn't trigger in these runs).
- `.env` confirmed working end to end; `LLM_MOCK_MODE=true`; GROQ/GEMINI keys still empty.
- Git repo on branch `main`, all work through this handoff committed.
- **Environment quirk**: port 8000 has been occupied by unrelated system services in earlier
  sessions in this sandbox but was free during Phases 5-12's and the post-Phase-12 verification —
  check before binding.

## Resuming this project
This is feature-complete but **actively being iterated on via direct live feedback, not a
queued plan** — don't assume there's nothing left to do. Before doing anything else in a new
session:
1. Run `cd backend && poetry run pytest -q` and `cd frontend && npx tsc -b --noEmit && npm run
   build` — confirm they still pass before trusting anything else in this file.
2. Log in as each of the four demo accounts (below) and spot-check a page or two per role still
   loads — code can drift from docs between sessions even when docs say otherwise.
3. Take direction from the operator's actual request. For substantial new work, write a
   `docs/phases/PHASE_13.md`-style doc as prior phases did; for smaller live-feedback fixes (the
   norm right now), a `docs/07_CHANGELOG.md` entry + `docs/06_DECISIONS.md` entry (if a real
   decision was made) is enough — but **always update `PROGRESS.md`/`HANDOFF.md`'s "Current
   state" in the same step**, not as an afterthought. That's the exact gap this session hit.

## Important lesson from Phase 11 (read before keying a React list by a backend-echoed field)
Don't assume a value the backend returns is actually unique — check what it's grouped by.
`Costs.tsx`'s "By route" list keyed each row by `r.route`, but `GET /api/costs`'s `by_route`
query groups by the raw `agent_runs.route` column (which can be `NULL`) and only applies
`coalesce(route, 'OTHER')` in the `SELECT` — so a `NULL`-route group and a literal-`'OTHER'`-
route group are two distinct rows that both display as `"OTHER"`, colliding on a value-based
key. Caught by a live browser's console warning, not `tsc`/build. Fixed with an array-index key
— the same fix class as Phase 9's resumed-run duplicate-key bug. General rule: a backend value is
only a safe React key if the backend's own grouping/uniqueness guarantees it, not just because it
looks like a label.

## Important lesson from Phase 10 (read before wiring a frontend action to a new/pre-existing
endpoint)
Don't assume an HTTP method from a sibling page's convention — check the actual router. Phase
10's Approvals page called `apiPatch(".../decide", ...)` because every other new page's
decide/update action is a PATCH, but `app/routers/approvals.py`'s `/decide` route is a **POST**
(built in Phase 4, untouched this phase). `tsc`/`npm run build` both passed and a static
screenshot looked fine; only clicking "Approve" in a live browser surfaced the real
`405 Method Not Allowed`. See `docs/phases/PHASE_10.md` for the full story — grep the actual
router file for `@router.<verb>` before wiring a frontend call, don't infer it from pattern-
matching other pages.

## Important lessons from Phase 9 (read before touching SSE or 3D-in-a-panel code)
1. **SSE parsing**: sse-starlette terminates lines with `\r\n`, not `\n`. Any hand-written
   text-protocol parser (`src/api/sse.ts`) must normalize line endings before splitting frames —
   assuming `\n\n` silently ate the entire event stream with zero errors anywhere. See the full
   writeup in `docs/06_DECISIONS.md`; if you write another manual stream parser, read it first.
2. **3D layout in small panels**: a spacing/radius that looks right in a full-width hero canvas
   (Landing page) can clip orbs outside a narrow sidebar panel's camera frustum. Always
   screenshot 3D components in their *actual* target container size, not just assume a formula
   is right — `AgentActivityPanel`'s orb spacing was wrong until a live screenshot showed only
   5 of 7 orbs visible.
3. **React keys across async pause/resume boundaries**: don't trust a backend sequence number as
   a React key if the backend can legitimately re-emit/re-process something (like a resumed
   LangGraph node). Generate a local unique id instead.

## How to visually verify a frontend phase (do this every frontend phase — it keeps finding
real, non-cosmetic bugs, not just style nits)
```bash
cd <scratchpad-dir> && npm init -y && npm install playwright-core --no-save
```
Then a Node script using `require('playwright-core').chromium.launch({ executablePath:
'/usr/bin/google-chrome' })`. For any page with live data flow (SSE, multi-step forms,
cross-session state), **drive the actual flow with real actions** (click, fill, wait for a
specific resulting DOM state) — don't just screenshot a static load. Phase 9's approval-resume
bug and CRLF bug would both have been invisible to a page that only loads and sits there.

## How to do reduced-motion-safe animation (still applies)
Branch the render tree: `reduceMotion ? <div>...</div> : <motion.div variants={...}>...
</motion.div>`, or reuse `src/components/Reveal.tsx`. See `docs/06_DECISIONS.md` for the Phase
6 bug this prevents.

## Important lesson from Phase 12 (read before trusting a doc's forward-looking claims)
Documentation written early (Phase 1-4) made forward references to phases that hadn't happened
yet — "Phase 10 Agent Control Room," "Phase 10B," "the master prompt" — and nothing ever swept
back through to fix them once those phases actually landed (or, for 10B, got skipped). Found and
fixed three stale ones in `docs/01_ARCHITECTURE.md` alone (a dead link to a file that was never
built, a phase-number mix-up on which phase actually consumed `GET /api/agents/live`, and an
event-mapping summary that overstated what's live vs. deferred relative to `04_FRONTEND.md`'s
own correct list). General rule for any future phase: when a doc says "Phase N will build X,"
check whether phase N actually happened and whether it actually built X exactly as described —
don't assume an old forward-reference stayed accurate just because nobody flagged it.

## Known issues
None blocking. Ten things worth knowing about, not fixing:
- `MemorySaver`'s in-memory checkpointer means a backend restart loses any run that's
  mid-approval.
- `app/eval/run_eval.py` doesn't resume paused (`request_access`) golden questions end to end.
- `GET /api/agents/live` polls `agent_events` every second (no real pub/sub) — fine locally.
- `src/three/{AgentOrb,RoboCompanion}.tsx`'s color constants, `Overview.tsx`/`Costs.tsx`/
  `ReinforcementLab.tsx`'s chart colors, and `AgentActivityPanel.tsx`'s `AGENT_ORDER`/
  `FRIENDLY_NAMES` all duplicate `tokens.css`'s `--accent-primary`/`--agent-*` values by hand
  (SVG/WebGL/recharts need concrete hex, not CSS `var()`). Updating the brand palette means
  grep-ing for the old hex values across all of these, not just editing `tokens.css` — done once
  already for the 2026-11-04 rebrand (orange → real Ampera purple/steel-blue), worth remembering
  if the palette ever changes again.
- The production JS bundle is past Vite's 500kB chunk-size warning (~1.7MB raw / ~460kB
  gzipped after Phase 11). Still not worth code-splitting yet.
- The Assistant page starts a fresh conversation every page visit — no history loading yet; the
  Tickets page is the closest thing to a "my past activity" view so far.
- A manager can reach `/app/reinforcement-lab`/`/app/costs` directly even though their nav links
  are admin-only — correct per those endpoints' real Phase-4-era backend scope
  (manager/hr/admin), not a bug. See `docs/phases/PHASE_11.md`.
- `POST /api/admin/reset-demo` has no frontend button anywhere (its UI was Phase 10B scope,
  which was skipped) — still reachable via `poetry run seed` or curl.
- `test_agents_graph.py::test_e_unanswerable_question_creates_ticket` fails intermittently —
  confirmed present on the clean Phase 9 tree (not caused by Phase 10), not yet root-caused. See
  `docs/phases/PHASE_10.md`.
- The Tickets table has no pagination — fine at the current ~200-row seed scale.

## Commands reference
```bash
cd backend
poetry install
poetry run migrate
poetry run seed
poetry run pytest -q
poetry run dev                                              # pick a free port if 8000 is busy
poetry run simulate-feedback --n 500
poetry run eval

cd frontend
npm install
npm run dev
npm run build
npx tsc -b --noEmit
```

## Demo accounts (all password `Demo@1234`)
- `emma.employee@acme.test` — employee
- `mark.manager@acme.test` — manager
- `hannah.hr@acme.test` — hr
- `alex.admin@acme.test` — admin

## Further reading
- `docs/09_DEMO_SCRIPT.md` — the full live demo walkthrough (10 steps, anticipated HR questions,
  recovery plan).
- `docs/08_TESTING_AND_EVAL.md` — current test/golden-set results and every known failing case.
- `docs/05_RUNBOOK.md` — full setup, verification commands, and `reset-demo` usage.
