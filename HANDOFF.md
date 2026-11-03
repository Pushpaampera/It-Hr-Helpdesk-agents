# HANDOFF.md — paste-ready continuation prompt

If you are a new Claude Code session or account picking this up, read `CLAUDE.md`, then this
file, then `PROGRESS.md`, then `docs/phases/PHASE_07.md`, in that order, before touching code.

## Current state (2026-11-03)
**Phases 1-7 are all DONE and verified end to end**, including live browser-driven checks for
Phases 6-7. Phase 8 (Dashboard shell and Overview) has not started. This session pauses and
asks the operator before starting each new phase (explicit operator instruction — see
`docs/06_DECISIONS.md`).

What exists and is verified working:
- **Foundation** (Phase 1): Poetry project, `/api/health`, all 22 tables migrated, Vite+React+TS
  scaffold.
- **RAG + seed data** (Phase 2): hybrid retrieval, `poetry run seed` populates everything.
- **Agents + graph** (Phase 3): all 7 agents, LangGraph `StateGraph` with a real
  `request_access` pause/resume.
- **Auth, API surface, bandit and analytics** (Phase 4): every backend endpoint is behind real
  JWT auth (`POST /api/auth/login` — demo password `Demo@1234` for every seeded user). See
  `docs/03_BACKEND.md` for the full endpoint table.
- **Frontend design system and 3D building blocks** (Phase 5): `src/store/{uiStore,authStore}.ts`,
  `src/api/{client,types}.ts`, `src/three/{Scene,AgentOrb,DataPulse,ParticleField}.tsx`,
  `src/components/ReduceMotionToggle.tsx`, `src/components/ui/{Button,Badge,Panel}.tsx`.
- **Landing page** (Phase 6): `src/pages/Landing.tsx`, `src/components/Reveal.tsx`.
- **Login page** (Phase 7): `src/pages/Login.tsx` (real form + demo quick-picker, calls
  `authStore.login()`), `src/components/RequireAuth.tsx` (route guard — reuse this for every
  Phase 8+ dashboard route), `src/pages/AppPlaceholder.tsx` (temporary post-login landing, shows
  the role-aware "lands on" text — Phase 8 replaces it), `src/components/ui/TextField.tsx`.
  `src/App.tsx` now calls `authStore.refreshMe()` once on mount to validate a persisted token.
- `backend/tests/test_agents_graph.py` (12) + `backend/tests/test_auth_api.py` (12) —
  `poetry run pytest -q` → **24 passed**.
- `.env` confirmed working end to end; `LLM_MOCK_MODE=true`; GROQ/GEMINI keys still empty.
- Git repo on branch `main`; Phases 1-6 committed, Phase 7 pending this handoff's commit.
- **Environment quirk**: port 8000 has been occupied by unrelated system services in earlier
  sessions in this sandbox but was free during Phases 5-7's verification — check before binding.

## How to visually verify a frontend phase (do this every frontend phase from now on)
No built-in browser tool is available in this harness, but Chrome and Playwright's browser
driver are present on the machine. Phases 6 and 7 both used this ad hoc setup and it's worth
reusing exactly:
```bash
cd <scratchpad-dir> && npm init -y && npm install playwright-core --no-save
```
Then a short Node script using `require('playwright-core').chromium.launch({ executablePath:
'/usr/bin/google-chrome' })`, `page.goto('http://localhost:5173/...')`, `page.screenshot(...)`,
and a `page.on('console', ...)` listener for errors. This is **not** added to
`frontend/package.json` — it's a verification tool, installed fresh into the scratchpad each
time, not a project dependency. Phase 6 found and fixed a real bug this way that `tsc`/
`npm run build` alone could never have caught (see the Reduce-motion decision log entry); don't
skip this step for Phase 8 just because the backend/type-checks pass.

## How to do reduced-motion-safe animation (still applies — read before writing any new page)
**Do not** conditionally pass `undefined` for a `motion.*` component's `initial`/`animate`/
`variants` props to "turn off" an animation, while a child `motion.*` keeps an unconditional
`variants={...}`. Branch the render tree instead: `reduceMotion ? <div>...</div> :
<motion.div variants={...}>...</motion.div>` (see `Landing.tsx`'s hero, `Login.tsx`'s form, or
reuse `src/components/Reveal.tsx` for scroll-reveals). Full writeup in `docs/06_DECISIONS.md`.

## Exact next step: start Phase 8 — Dashboard shell and Overview
Per the master build prompt, this replaces `AppPlaceholder.tsx`:
1. A real dashboard shell: persistent nav/sidebar, top bar (user menu, `ReduceMotionToggle`,
   sign-out), content area — the layout every later dashboard page (AI Assistant, Approvals,
   Tickets, HR Insights, Control Room, Reinforcement Lab, etc.) renders inside.
2. Role-aware navigation: per `docs/00_PROJECT_OVERVIEW.md`, employee/manager/hr/admin see
   different nav items (employee sees their own data only; manager adds Approvals/Team; hr adds
   HR Insights/Policy KB/leave queries; admin adds Control Room/Reinforcement Lab/Evaluation/
   Costs/Audit Log). The backend already enforces these boundaries server-side (Phase 4) — this
   phase is UI-level navigation, not a new authorization layer.
3. The Overview page itself — likely pulling from `GET /api/analytics/kpis` for manager/hr/admin,
   and something employee-appropriate (their own recent activity?) for employee. Check whether
   the master build prompt specifies Overview's exact content before inventing it.
4. Real routes replacing the single `/app` placeholder — update `Login.tsx`'s
   `LANDING_PAGE_BY_ROLE`-equivalent redirect logic to point at real paths once they exist.
5. Respect the reduced-motion rule above. Wrap every new route in `RequireAuth`.
6. **Verify visually** using the ad hoc Playwright setup described above — don't skip this.
7. Run the documentation gate: `docs/phases/PHASE_08.md`, `PROGRESS.md`, this file,
   `docs/07_CHANGELOG.md`, `docs/04_FRONTEND.md`, commit, **then stop and ask the operator
   before starting Phase 9**.

## Known issues
None blocking. Five things worth knowing about, not fixing:
- `MemorySaver`'s in-memory checkpointer means a backend restart loses any run that's
  mid-approval.
- `app/eval/run_eval.py` doesn't resume paused (`request_access`) golden questions end to end.
- `GET /api/agents/live` polls `agent_events` every second (no real pub/sub) — fine locally.
- `src/three/AgentOrb.tsx`'s `AGENT_COLORS` duplicates `tokens.css`'s `--agent-*` values by hand.
- The production JS bundle is past Vite's 500kB chunk-size warning (~1.19MB raw / ~334kB
  gzipped). Not worth code-splitting yet — revisit once Phase 8+ adds enough routes.

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
