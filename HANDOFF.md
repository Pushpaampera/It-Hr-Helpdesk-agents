# HANDOFF.md — paste-ready continuation prompt

If you are a new Claude Code session or account picking this up, read `CLAUDE.md`, then this
file, then `PROGRESS.md`, then `docs/phases/PHASE_10.md`, in that order, before touching code.

## Current state (2026-11-03)
**Phases 1-10 are all DONE and verified end to end**, including live browser-driven checks for
Phases 6-10 — each tested as real functional flows (real clicks/form submissions/decisions, not
just static screenshots). Phase 10B (Demo experience layer / HR showcase) has been **skipped by
explicit operator instruction (2026-11-03)** — not needed for this project; next up is Phase 11
(Evaluation and polish). This
session pauses and asks the operator before starting each new phase (explicit operator
instruction — see `docs/06_DECISIONS.md`).

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
  HrInsights,KnowledgeBase}.tsx` — all five `/app/*` nav items that were "Soon" placeholders
  through Phase 9 are now real, live pages. Two new backend routers,
  `backend/app/routers/{team,hr_insights}.py` (`GET /api/team`; `GET /api/hr/overview`,
  `GET`/`PATCH /api/hr/leave-requests`), since no endpoint for "my direct reports" or
  "company-wide leave posture" existed before. Every nav item is now `implemented: true` except
  Control Room/Reinforcement Lab/Evaluation/Costs/Audit Log, which are Phase 11 scope (Phase 10B
  was skipped — see above).
- `backend/tests/test_agents_graph.py` (12) + `backend/tests/test_auth_api.py` (12) —
  `poetry run pytest -q` → **24/25 passed** (one pre-existing, unrelated intermittent failure —
  see "Known issues" below).
- `.env` confirmed working end to end; `LLM_MOCK_MODE=true`; GROQ/GEMINI keys still empty.
- Git repo on branch `main`; Phases 1-9 committed, Phase 10 pending this handoff's commit.
- **Environment quirk**: port 8000 has been occupied by unrelated system services in earlier
  sessions in this sandbox but was free during Phases 5-10's verification — check before binding.

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

## Exact next step: start Phase 11 — Evaluation and polish
Phase 10B (Demo experience layer / HR showcase) was explicitly skipped by the operator — don't
build it unless asked again later. No detailed scope has been written down anywhere yet for
Phase 11 (checked — no master build prompt file exists in this repo). Before starting:
1. Ask the operator what "Evaluation and polish" concretely means here, or check for a master
   build prompt / design doc they may provide this session.
2. Per `src/layouts/navItems.ts`, the still-unbuilt nav items are Control Room, Reinforcement
   Lab, Evaluation, Costs, Audit Log (all admin-only) — these are the most likely candidates for
   this phase's scope, but confirm rather than assume.
3. Whatever it turns out to be, keep following the reduced-motion rule and the live-verification
   bar below, and grep the actual backend router for its HTTP verb before wiring any frontend
   call to it (see the Phase 10 lesson above — don't infer it from another page's pattern).
4. Run the documentation gate: a new `docs/phases/PHASE_11.md`, `PROGRESS.md`, this file,
   `docs/07_CHANGELOG.md`, `docs/04_FRONTEND.md`, commit, **then stop and ask the operator
   before starting the phase after that**.

## Known issues
None blocking. Eight things worth knowing about, not fixing:
- `MemorySaver`'s in-memory checkpointer means a backend restart loses any run that's
  mid-approval.
- `app/eval/run_eval.py` doesn't resume paused (`request_access`) golden questions end to end.
- `GET /api/agents/live` polls `agent_events` every second (no real pub/sub) — fine locally.
- `src/three/AgentOrb.tsx`'s `AGENT_COLORS`, `Overview.tsx`'s chart colors, and
  `AgentActivityPanel.tsx`'s `AGENT_ORDER`/`FRIENDLY_NAMES` all duplicate backend/token values
  by hand (SVG/WebGL need concrete values; frontend has no import path to Python constants).
- The production JS bundle is past Vite's 500kB chunk-size warning (~1.6MB raw / ~450kB
  gzipped after Phase 10). Still not worth code-splitting yet.
- The Assistant page starts a fresh conversation every page visit — no history loading yet; the
  new Tickets page is the closest thing to a "my past activity" view so far.
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
