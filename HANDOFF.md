# HANDOFF.md — paste-ready continuation prompt

If you are a new Claude Code session or account picking this up, read `CLAUDE.md`, then this
file, then `PROGRESS.md`, then `docs/phases/PHASE_08.md`, in that order, before touching code.

## Current state (2026-11-03)
**Phases 1-8 are all DONE and verified end to end**, including live browser-driven checks for
Phases 6-8. Phase 9 (AI Assistant page — the project's centerpiece) has not started. This
session pauses and asks the operator before starting each new phase (explicit operator
instruction — see `docs/06_DECISIONS.md`).

What exists and is verified working:
- **Foundation** (Phase 1): Poetry project, `/api/health`, all 22 tables migrated, Vite+React+TS
  scaffold.
- **RAG + seed data** (Phase 2): hybrid retrieval, `poetry run seed` populates everything.
- **Agents + graph** (Phase 3): all 7 agents, LangGraph `StateGraph` with a real
  `request_access` pause/resume. `POST /api/chat/stream` (SSE) is the endpoint Phase 9 will
  finally give a real frontend.
- **Auth, API surface, bandit and analytics** (Phase 4): every backend endpoint is behind real
  JWT auth. See `docs/03_BACKEND.md` for the full endpoint table.
- **Frontend design system and 3D building blocks** (Phase 5): `src/store/{uiStore,authStore}.ts`,
  `src/api/{client,types}.ts`, `src/three/{Scene,AgentOrb,DataPulse,ParticleField}.tsx` (the
  primitives Phase 9's chat UI will animate against), `src/components/ReduceMotionToggle.tsx`,
  `src/components/ui/{Button,Badge,Panel,TextField}.tsx`.
- **Landing page** (Phase 6): `src/pages/Landing.tsx`, `src/components/Reveal.tsx`.
- **Login page** (Phase 7): `src/pages/Login.tsx`, `src/components/RequireAuth.tsx`.
- **Dashboard shell and Overview** (Phase 8): `src/layouts/DashboardLayout.tsx` (+
  `.module.css`, the project's first real `@media` breakpoint / CSS module), `navItems.ts`
  (role-aware nav with "Soon" placeholders for every unbuilt page), `src/pages/dashboard/
  Overview.tsx` (staff KPIs+chart via `recharts`, employee own-activity view). `/app/overview`
  is live; every other `/app/*` route (`assistant`, `tickets`, `approvals`, etc.) is still a
  disabled nav entry, not a route.
- `backend/tests/test_agents_graph.py` (12) + `backend/tests/test_auth_api.py` (12) —
  `poetry run pytest -q` → **24 passed**.
- `.env` confirmed working end to end; `LLM_MOCK_MODE=true`; GROQ/GEMINI keys still empty.
- Git repo on branch `main`; Phases 1-7 committed, Phase 8 pending this handoff's commit.
- **Environment quirk**: port 8000 has been occupied by unrelated system services in earlier
  sessions in this sandbox but was free during Phases 5-8's verification — check before binding.

## How to visually verify a frontend phase (do this every frontend phase — it keeps finding
real bugs)
No built-in browser tool is available in this harness, but Chrome and Playwright's browser
driver are present on the machine:
```bash
cd <scratchpad-dir> && npm init -y && npm install playwright-core --no-save
```
Then a short Node script using `require('playwright-core').chromium.launch({ executablePath:
'/usr/bin/google-chrome' })`, `page.goto(...)`, `page.screenshot(...)`, and a
`page.on('console', ...)` listener. Not added to `frontend/package.json` — reinstalled fresh
into the scratchpad each phase. For Phase 9, this means actually driving a real chat turn
through the SSE stream and confirming the 3D animation reacts to real events, not just that the
page renders statically.

## How to do reduced-motion-safe animation (still applies)
Branch the render tree: `reduceMotion ? <div>...</div> : <motion.div variants={...}>...
</motion.div>`, or reuse `src/components/Reveal.tsx`. Never conditionally null a `motion.*`
component's props while a child keeps an unconditional `variants={...}` — see
`docs/06_DECISIONS.md` for the Phase 6 bug this caused.

## Exact next step: start Phase 9 — AI Assistant page (centerpiece)
Per the master build prompt, this is the project's showcase page:
1. Add `src/pages/dashboard/Assistant.tsx` at `/app/assistant`, flip its `navItems.ts` entry to
   `implemented: true`.
2. A real chat interface: message input, conversation history (create a conversation via `POST
   /api/conversations` on first message, per `docs/03_BACKEND.md`), and a live SSE connection to
   `POST /api/chat/stream` (`EventSource`/`fetch` + `ReadableStream` — the backend uses
   `sse_starlette`, standard SSE framing, `event:`/`data:` lines per `docs/01_ARCHITECTURE.md`'s
   event schema).
3. Wire the Phase 5 3D building blocks to the real event stream per the mapping already
   documented in `docs/04_FRONTEND.md`: `handoff` → `DataPulse` between `AgentOrb`s,
   `retrieving` → highlight (a `KnowledgeCore` component doesn't exist yet — build a minimal one
   or adapt `AgentOrb`), `tool_call` → an Action Agent tool card, `approval_required` → an
   approval banner, `final` + a 1-5 star rating → a feedback burst, posting to `POST
   /api/feedback`.
4. Handle the pause/resume flow: when `approval_required` fires, the chat should show a visible
   "waiting on approval" state; the SSE connection stays open per
   `docs/01_ARCHITECTURE.md`'s "deliberately left open" note, so the UI just needs to keep
   listening for the eventual `final` event after a manager decides elsewhere (there's no
   approval-deciding UI yet — that's Phase 10's "Approvals" nav item).
5. Respect the reduced-motion rule above throughout.
6. **Verify visually and functionally** using the ad hoc Playwright setup — drive an actual
   message through (e.g. "My laptop won't connect to the VPN, error 619" as
   `emma.employee@acme.test`) against the real backend and confirm the 3D scene reacts, not just
   that static markup renders.
7. Run the documentation gate: `docs/phases/PHASE_09.md`, `PROGRESS.md`, this file,
   `docs/07_CHANGELOG.md`, `docs/04_FRONTEND.md`, commit, **then stop and ask the operator
   before starting Phase 10**.

## Known issues
None blocking. Six things worth knowing about, not fixing:
- `MemorySaver`'s in-memory checkpointer means a backend restart loses any run that's
  mid-approval.
- `app/eval/run_eval.py` doesn't resume paused (`request_access`) golden questions end to end.
- `GET /api/agents/live` polls `agent_events` every second (no real pub/sub) — fine locally.
- `src/three/AgentOrb.tsx`'s `AGENT_COLORS` and `Overview.tsx`'s chart colors both duplicate
  `tokens.css`'s values by hand (SVG/WebGL need concrete color strings, not `var()`).
- The production JS bundle is past Vite's 500kB chunk-size warning (~1.6MB raw / ~450kB
  gzipped) now that `recharts` is in it too. Still not worth code-splitting — revisit once
  Phase 9+ adds enough weight that it actually matters for load time.
- `DashboardLayout.module.css` is the only CSS module in the project so far (needed for a real
  `@media` breakpoint); everything else still uses inline styles from the design tokens.

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
