# HANDOFF.md — paste-ready continuation prompt

If you are a new Claude Code session or account picking this up, read `CLAUDE.md`, then this
file, then `PROGRESS.md`, then `docs/phases/PHASE_05.md`, in that order, before touching code.

## Current state (2026-11-03)
**Phases 1-5 are all DONE and verified end to end (Phase 5's visual check is the one exception
— see below).** Phase 6 (Landing page) has not started. This session pauses and asks the
operator before starting each new phase (explicit operator instruction — see
`docs/06_DECISIONS.md`).

What exists and is verified working:
- **Foundation** (Phase 1): Poetry project, `/api/health`, all 22 tables migrated, Vite+React+TS
  scaffold.
- **RAG + seed data** (Phase 2): hybrid retrieval, `poetry run seed` populates everything.
- **Agents + graph** (Phase 3): all 7 agents, LangGraph `StateGraph` with a real
  `request_access` pause/resume.
- **Auth, API surface, bandit and analytics** (Phase 4): every backend endpoint is behind real
  JWT auth (`POST /api/auth/login` — demo password `Demo@1234` for every seeded user — `GET
  /api/auth/me`, `POST /api/auth/logout`). Ten routers beyond the Phase 3 three: `conversations`,
  `tickets`, `kb`, `analytics`, `agents` (incl. `/live` aggregated SSE), `bandit`, `eval`,
  `admin` (`/reset-demo`), `costs`. `app/bandit/simulator.py` (`poetry run simulate-feedback`),
  `app/eval/run_eval.py` (`poetry run eval`), `GET /metrics`, optional Langfuse hook. See
  `docs/03_BACKEND.md` for the full endpoint table.
- **Frontend design system and 3D building blocks** (Phase 5): `src/store/{uiStore,authStore}.ts`
  (zustand, persisted), `src/api/{client,types}.ts` (fetch wrapper + typed response shapes),
  `src/three/{Scene,AgentOrb,DataPulse,ParticleField}.tsx` (the 3D primitives later pages
  compose — `Scene` enforces the `dpr`-cap/pause-when-hidden performance budget from CLAUDE.md),
  `src/components/ReduceMotionToggle.tsx`, `src/components/ui/{Button,Badge,Panel}.tsx` (no UI
  kit, no Tailwind — plain CSS variable styling). `PlaceholderHome.tsx` now showcases all of it
  and still live-pings `/api/health`; Phase 6 replaces this page outright.
- `backend/tests/test_agents_graph.py` (12) + `backend/tests/test_auth_api.py` (12) —
  `poetry run pytest -q` → **24 passed**.
- `.env` confirmed working end to end; `LLM_MOCK_MODE=true`; GROQ/GEMINI keys still empty.
- Git repo on branch `main`; Phases 1-4 committed, Phase 5 pending this handoff's commit.
- **Environment quirk**: port 8000 has been occupied by unrelated system services in earlier
  sessions in this sandbox but was free during Phase 5's verification — don't assume either way;
  check before binding, and use a different port (e.g. 8077) for manual testing if it's busy.

## Known gap carried from Phase 5: no visual browser check
Phase 5's `tsc`/`npm run build`/dev-server checks confirm the code is correct and wired
together, and a live full-stack check confirmed `/api/health` resolves through the Vite proxy —
but no browser/screenshot tool was available in that session, so the 3D scene's actual
appearance, frame rate, and the Reduce-motion toggle's visible effect have **not** been
confirmed by eye. Before — or early in — Phase 6, either the operator should open
`http://localhost:5173/` themselves and confirm it looks right, or a session with browser/
screenshot tooling available should do it. If something looks wrong, it's almost certainly in
`src/three/*` or `PlaceholderHome.tsx`, both small and self-contained.

## Exact next step: start Phase 6 — Landing page
Per the master build prompt, this is the first real page, replacing `PlaceholderHome` outright:
1. The cinematic landing page composed from Phase 5's building blocks: `Scene` +
   `AgentOrb`/`DataPulse`/`ParticleField` as the hero visual, design tokens for layout/typography,
   `src/design/motion.ts` variants for scroll/entrance animation (gsap + ScrollTrigger is in
   `package.json` if the master prompt calls for scroll-driven sequences here — check its exact
   Phase 6 wording if available, otherwise Framer Motion's variants are enough).
2. A clear call-to-action into the login page (Phase 7) — `react-router-dom` route, probably
   `/login`, not yet added to `src/routes.tsx`.
3. Respect the "Reduce motion" toggle throughout (already wired at the store level — just don't
   bypass it with ad-hoc animation that ignores `uiStore.reduceMotion`).
4. **Verify**: `npm run build` succeeds, `npm run dev` serves the new page, and — this time —
   confirm visually (browser tool, or ask the operator) since Phase 5 couldn't.
5. Run the documentation gate: `docs/phases/PHASE_06.md`, `PROGRESS.md`, this file,
   `docs/07_CHANGELOG.md`, `docs/04_FRONTEND.md`, commit, **then stop and ask the operator
   before starting Phase 7**.

## Known issues
None blocking. Four things worth knowing about, not fixing:
- `MemorySaver`'s in-memory checkpointer means a backend restart loses any run that's
  mid-approval. Don't restart the backend while a demo scenario has a pending approval.
- `app/eval/run_eval.py` doesn't resume paused (`request_access`) golden questions end to end —
  scored as a correctness penalty instead.
- `GET /api/agents/live` polls `agent_events` every second (no real pub/sub) — fine for this
  local single-process demo.
- `src/three/AgentOrb.tsx`'s `AGENT_COLORS` duplicates `tokens.css`'s `--agent-*` values by
  hand (Three.js materials need real color values, not CSS var references) — keep both in sync
  if the palette is ever retuned.

## Commands reference
```bash
cd backend
poetry install
poetry run migrate
poetry run seed
poetry run pytest -q
poetry run dev                                              # pick a free port if 8000 is busy
poetry run search "VPN error 619" --strategy hybrid_rerank
poetry run simulate-feedback --n 500
poetry run eval

cd frontend
npm install
npm run dev
npm run build
```

## Demo accounts (all password `Demo@1234`)
- `emma.employee@acme.test` — employee
- `mark.manager@acme.test` — manager
- `hannah.hr@acme.test` — hr
- `alex.admin@acme.test` — admin
