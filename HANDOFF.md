# HANDOFF.md — paste-ready continuation prompt

If you are a new Claude Code session or account picking this up, read `CLAUDE.md`, then this
file, then `PROGRESS.md`, then `docs/phases/PHASE_06.md`, in that order, before touching code.

## Current state (2026-11-03)
**Phases 1-6 are all DONE and verified end to end, including a real visual/browser check for
Phase 6.** Phase 7 (Login page) has not started. This session pauses and asks the operator
before starting each new phase (explicit operator instruction — see `docs/06_DECISIONS.md`).

What exists and is verified working:
- **Foundation** (Phase 1): Poetry project, `/api/health`, all 22 tables migrated, Vite+React+TS
  scaffold.
- **RAG + seed data** (Phase 2): hybrid retrieval, `poetry run seed` populates everything.
- **Agents + graph** (Phase 3): all 7 agents, LangGraph `StateGraph` with a real
  `request_access` pause/resume.
- **Auth, API surface, bandit and analytics** (Phase 4): every backend endpoint is behind real
  JWT auth (`POST /api/auth/login` — demo password `Demo@1234` for every seeded user — `GET
  /api/auth/me`, `POST /api/auth/logout`). See `docs/03_BACKEND.md` for the full endpoint table.
- **Frontend design system and 3D building blocks** (Phase 5): `src/store/{uiStore,authStore}.ts`,
  `src/api/{client,types}.ts`, `src/three/{Scene,AgentOrb,DataPulse,ParticleField}.tsx`,
  `src/components/ReduceMotionToggle.tsx`, `src/components/ui/{Button,Badge,Panel}.tsx`.
- **Landing page** (Phase 6): `src/pages/Landing.tsx` (hero with `Scene`+`bloom`, 7 `AgentOrb`s,
  `DataPulse` beams, `ParticleField`, radial scrim for text legibility; "Meet the team"; "How it
  works"; closing CTA), `src/components/Reveal.tsx` (scroll-triggered fade-up, the pattern to
  copy for reduced-motion-safe animation — see the decision log entry below),
  `src/pages/LoginPlaceholder.tsx` (temporary, Phase 7 replaces it). `PlaceholderHome.tsx` is
  deleted — fully superseded.
- `backend/tests/test_agents_graph.py` (12) + `backend/tests/test_auth_api.py` (12) —
  `poetry run pytest -q` → **24 passed**.
- `.env` confirmed working end to end; `LLM_MOCK_MODE=true`; GROQ/GEMINI keys still empty.
- Git repo on branch `main`; Phases 1-5 committed, Phase 6 pending this handoff's commit.
- **Environment quirk**: port 8000 has been occupied by unrelated system services in earlier
  sessions in this sandbox but was free during Phases 5-6's verification — check before binding.

## Important: how to do reduced-motion-safe animation (read before writing any new page)
**Do not** conditionally pass `undefined` for a `motion.*` component's `initial`/`animate`/
`variants` props to "turn off" an animation under `useUIStore().reduceMotion`, while a child
`motion.*` component keeps an unconditional `variants={...}`. This was tried in Phase 6's first
hero implementation and the entire hero content silently went **invisible** under reduced
motion — Framer Motion children stuck at a `"hidden"` variant's styles never resolve without an
actively-animating parent. Caught only because a browser tool was available to screenshot it
with the toggle on; see `docs/06_DECISIONS.md` for the full writeup. **Instead**: branch the
render itself — reuse `src/components/Reveal.tsx` for scroll-reveals, or write
`reduceMotion ? <div>...</div> : <motion.div variants={...}>...</motion.div>` directly, the
pattern `Landing.tsx`'s hero now uses. Every new page from Phase 7 onward should follow this.

## Exact next step: start Phase 7 — Login page
Per the master build prompt, this replaces `LoginPlaceholder.tsx`:
1. A real login form: email + password, `POST /api/auth/login` via `useAuthStore().login()`
   (already built in Phase 5 — just needs a UI), loading/error states, the 4 demo accounts
   quick-picker (`emma.employee@acme.test` / `mark.manager@acme.test` / `hannah.hr@acme.test` /
   `alex.admin@acme.test`, all password `Demo@1234`) for fast demo use.
2. Role-aware post-login redirect, per `docs/00_PROJECT_OVERVIEW.md`'s "lands on" column:
   employee → AI Assistant, manager → Overview, hr → HR Insights, admin → Control Room. None of
   those dashboard routes/pages exist yet (Phase 8+) — this phase can redirect to a placeholder
   `/app` route if the real ones aren't built yet, or coordinate with Phase 8's actual route
   names once decided; don't invent dashboard page content here.
3. Respect the reduced-motion rule above for any entrance animation.
4. **Verify visually** (a browser tool was available this session at
   `/usr/bin/google-chrome` + `playwright-core` installed ad hoc into the scratchpad directory —
   do the same if it's not already set up, and actually screenshot both the default and
   reduced-motion states before calling this done, the way Phase 6 did after getting burned by
   not doing this in Phase 5).
5. Run the documentation gate: `docs/phases/PHASE_07.md`, `PROGRESS.md`, this file,
   `docs/07_CHANGELOG.md`, `docs/04_FRONTEND.md`, commit, **then stop and ask the operator
   before starting Phase 8**.

## Known issues
None blocking. Five things worth knowing about, not fixing:
- `MemorySaver`'s in-memory checkpointer means a backend restart loses any run that's
  mid-approval. Don't restart the backend while a demo scenario has a pending approval.
- `app/eval/run_eval.py` doesn't resume paused (`request_access`) golden questions end to end.
- `GET /api/agents/live` polls `agent_events` every second (no real pub/sub) — fine locally.
- `src/three/AgentOrb.tsx`'s `AGENT_COLORS` duplicates `tokens.css`'s `--agent-*` values by hand.
- The production JS bundle is past Vite's 500kB chunk-size warning (~1.1MB raw / 330kB gzipped)
  now that `@react-three/postprocessing` is in it. Not worth code-splitting yet — one real page
  exists. Revisit once Phase 8+ adds enough routes that splitting actually pays off.

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
