# HANDOFF.md — paste-ready continuation prompt

If you are a new Claude Code session or account picking this up, read `CLAUDE.md`, then this
file, then `PROGRESS.md`, then `docs/phases/PHASE_04.md`, in that order, before touching code.

## Current state (2026-11-03)
**Phases 1-4 are all DONE and verified end to end.** Phase 5 (Frontend design system and 3D
building blocks) has not started. This session pauses and asks the operator before starting
each new phase (explicit operator instruction — see `docs/06_DECISIONS.md`).

What exists and is verified working:
- **Foundation** (Phase 1): Poetry project, `/api/health`, all 22 tables migrated against the
  operator's real Postgres 17 (port 5433), Vite+React+TS scaffold.
- **RAG + seed data** (Phase 2): `app/rag/` hybrid retrieval (verified ranking quality),
  `poetry run seed` idempotently populates 48 users, 100 knowledge articles (130 chunks), 200
  tickets, 80 approvals, 150 leave requests, 300 historical runs, 70 golden questions.
- **Agents + graph** (Phase 3): all 7 agents in `app/agents/`, wired into a LangGraph
  `StateGraph` with a **real** pause/resume for `request_access`.
- **Auth, API surface, bandit and analytics** (Phase 4): every endpoint is now behind real JWT
  auth (`app/deps.py::get_current_user`/`require_roles`/`ensure_self_or_roles`). `POST
  /api/auth/login` (demo password `Demo@1234` for every seeded user), `GET /api/auth/me`, `POST
  /api/auth/logout`. `chat.py`/`approvals.py`/`feedback.py` use the authenticated identity
  instead of body `user_id`/`approver_id`. Ten new routers: `conversations` (create/list/get),
  `tickets` (list/detail/update, employee-own vs. staff-all), `kb` (search/compare/article
  detail), `analytics` (kpis/timeseries/departments), `agents` (status + the always-on `/live`
  aggregated SSE stream), `bandit` (`/stats`: pulls, avg reward, regret, context win rates),
  `eval` (trigger a real golden-set run / list past runs, backed by `app/eval/run_eval.py`),
  `admin` (`/reset-demo`, backed by `app/seed/seed.py::reset_and_reseed`), `costs`
  (token/$ breakdown). `app/bandit/simulator.py::run_simulation(n)` drives the *live* bandit
  state (`poetry run simulate-feedback --n 500`). `GET /metrics` (Prometheus). Optional Langfuse
  hook in `app/observability.py` (no-op unless both `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`
  are set **and** `poetry add langfuse` has been run — neither is needed for the demo).
- `backend/tests/test_agents_graph.py` (12 Phase 1-3 tests) + `backend/tests/test_auth_api.py`
  (12 new Phase 4 tests) — `poetry run pytest -q` → **24 passed**.
- `.env` confirmed working end to end; `LLM_MOCK_MODE=true`; GROQ/GEMINI keys still empty (fine
  — mock mode is fully functional).
- Git repo on branch `main`; Phases 1-3 committed, Phase 4 pending this handoff's commit.
- **Environment quirk**: ports 8000 and 8001 are occupied by unrelated system services in this
  sandbox (not part of this project — don't touch them). Use a different port (e.g. 8077) for
  manual `poetry run dev` testing, or just rely on `vite.config.ts`'s proxy once the frontend
  exists and both are on their expected ports in a clean environment.

## Exact next step: start Phase 5 — Frontend design system and 3D building blocks
Per the master build prompt, this phase has no backend work — it's the first real frontend
phase beyond the Phase 1 scaffold:
1. `src/design/tokens.css` — CSS variables (colors, spacing, typography) per `docs/04_FRONTEND.md`
   once it's populated; no Tailwind, no UI kit (hard constraint).
2. `src/design/motion.ts` — shared Framer Motion variants reused across later pages.
3. First React Three Fiber building blocks: whatever `docs/04_FRONTEND.md`/the master prompt
   names for Phase 5 specifically (e.g. `AgentOrb`, base 3D scene wrapper with the "Reduce
   motion" toggle and `devicePixelRatio` cap, instancing helpers) — these get composed into the
   landing page (Phase 6), login page (Phase 7), and dashboard (Phase 8+).
4. Zustand store scaffolding for cross-component state (auth token, current user, theme/reduce-
   motion preference) — the frontend's equivalent of this phase's JWT work, so Phase 6+ pages
   have somewhere to keep the logged-in user and call the new `/api/auth/*` endpoints from.
5. **Verify**: `npm run dev` boots, the design tokens render correctly in both light/dark (if
   applicable), a trivial 3D scene renders at a stable frame rate, "Reduce motion" visibly
   disables animation.
6. Run the documentation gate: `docs/phases/PHASE_05.md`, `PROGRESS.md`, this file,
   `docs/07_CHANGELOG.md`, `docs/04_FRONTEND.md` (populate properly — it's been a stub since
   Phase 1), commit, **then stop and ask the operator before starting Phase 6**.

## Known issues
None blocking. Three things worth knowing about, not fixing:
- `MemorySaver`'s in-memory checkpointer means a backend restart loses any run that's
  mid-approval. Fine for a local demo; just don't restart the backend while a demo scenario has
  a pending approval.
- `app/eval/run_eval.py` doesn't resume paused (`request_access`) golden questions end to end —
  scored as a correctness penalty instead. Revisit in Phase 11 if the golden set grows access-
  request cases.
- `GET /api/agents/live` polls `agent_events` every second (no real pub/sub) — fine for this
  local single-process demo.

## Commands reference
```bash
cd backend
poetry install
poetry run migrate
poetry run seed
poetry run pytest -q
poetry run dev                                              # pick a free port in this sandbox
poetry run search "VPN error 619" --strategy hybrid_rerank
poetry run simulate-feedback --n 500
poetry run eval

cd frontend
npm install
npm run dev
```

## Demo accounts (all password `Demo@1234`)
- `emma.employee@acme.test` — employee
- `mark.manager@acme.test` — manager
- `hannah.hr@acme.test` — hr
- `alex.admin@acme.test` — admin
