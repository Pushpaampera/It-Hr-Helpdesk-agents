# HANDOFF.md — paste-ready continuation prompt

If you are a new Claude Code session or account picking this up, read `CLAUDE.md`, then this
file, then `PROGRESS.md`, then `docs/phases/PHASE_09.md`, in that order, before touching code.

## Current state (2026-11-03)
**Phases 1-9 are all DONE and verified end to end**, including live browser-driven checks for
Phases 6-9 — Phase 9 in particular was tested as real functional flows (a real chat turn, a real
cross-session approval resume), not just static screenshots. Phase 10 (Remaining dashboard
pages) has not started. This session pauses and asks the operator before starting each new
phase (explicit operator instruction — see `docs/06_DECISIONS.md`).

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
  pulsing, a live caption narrator log). `/app/assistant` is live; `Tickets`/`Approvals`/`Team`/
  `HR Insights`/`Policy Knowledge Base`/etc. are still disabled "Soon" nav entries.
- `backend/tests/test_agents_graph.py` (12) + `backend/tests/test_auth_api.py` (12) —
  `poetry run pytest -q` → **24 passed**.
- `.env` confirmed working end to end; `LLM_MOCK_MODE=true`; GROQ/GEMINI keys still empty.
- Git repo on branch `main`; Phases 1-8 committed, Phase 9 pending this handoff's commit.
- **Environment quirk**: port 8000 has been occupied by unrelated system services in earlier
  sessions in this sandbox but was free during Phases 5-9's verification — check before binding.

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

## Exact next step: start Phase 10 — Remaining dashboard pages
Per `src/layouts/navItems.ts`, these are still `implemented: false`:
1. **Tickets** (`/app/tickets`, all roles): list/detail using `GET /api/tickets`,
   `GET /api/tickets/{id}`; staff (manager/hr/admin) can `PATCH` status/priority/assignee.
2. **Approvals** (`/app/approvals`, manager/admin): list via `GET /api/approvals?status=pending`,
   decide via `POST /api/approvals/{id}/decide` — this is what Phase 9's approval test did via
   direct `fetch()` calls; now give it a real page so a manager doesn't need curl.
3. **Team** (`/app/team`, manager only) and **HR Insights**/**Policy Knowledge Base**
   (`/app/hr-insights`, `/app/kb`, hr only) — check the master build prompt (if available) for
   exact scope; `GET /api/kb/search`/`/compare`/`/articles/{id}` back the KB page.
4. Flip each page's `implemented` flag in `navItems.ts` as it's built; add routes in
   `routes.tsx` wrapped the same way `/app/assistant` is.
5. Respect the reduced-motion rule and verify visually/functionally per the lessons above.
6. Run the documentation gate: `docs/phases/PHASE_10.md`, `PROGRESS.md`, this file,
   `docs/07_CHANGELOG.md`, `docs/04_FRONTEND.md`, commit, **then stop and ask the operator
   before starting Phase 10B/11**.

## Known issues
None blocking. Seven things worth knowing about, not fixing:
- `MemorySaver`'s in-memory checkpointer means a backend restart loses any run that's
  mid-approval.
- `app/eval/run_eval.py` doesn't resume paused (`request_access`) golden questions end to end.
- `GET /api/agents/live` polls `agent_events` every second (no real pub/sub) — fine locally.
- `src/three/AgentOrb.tsx`'s `AGENT_COLORS`, `Overview.tsx`'s chart colors, and
  `AgentActivityPanel.tsx`'s `AGENT_ORDER`/`FRIENDLY_NAMES` all duplicate backend/token values
  by hand (SVG/WebGL need concrete values; frontend has no import path to Python constants).
- The production JS bundle is past Vite's 500kB chunk-size warning (~1.6MB raw / ~450kB
  gzipped). Still not worth code-splitting — revisit if Phase 10 adds enough weight to matter.
- The Assistant page starts a fresh conversation every page visit — no history loading yet
  (natural Phase 10 "Tickets"/conversation-list scope).
- No in-app approval-deciding UI yet (Phase 10's "Approvals" page) — Phase 9 verified the pause/
  resume flow via direct API calls, exactly how a manager would have to do it today.

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
