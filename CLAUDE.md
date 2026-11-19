# CLAUDE.md — standing instructions for any Claude session on this repo

## Project, in one paragraph
Helpdesk AI Agents is a runnable demo of an enterprise IT/HR helpdesk staffed by a team of
cooperating AI agents (LangGraph), with real RAG over a Postgres+pgvector knowledge base, a
FastAPI backend, and a plain, accessible React frontend in Ampera's colours (Montserrat, navy
#0F1D66 + magenta #9C369A, matching the Ampera Campus Hire portal) whose live agent activity is driven only by real backend SSE events (no fake timers). It is being built for a live demo to a non-technical
HR audience, so the UI must be instantly understandable and must never fail on stage.

## Hard constraints (never violate)
- Local only: no Docker, no docker-compose, no GitHub Actions/CI files, no deployment config.
- No sudo anywhere. Python deps via Poetry with `virtualenvs.in-project true`. Node deps via
  npm in user space.
- All secrets/DB settings come from `.env` at the repo root (never committed, never read into
  chat/docs). `.env.example` documents variable names only.
- Only database: PostgreSQL + pgvector. `CREATE EXTENSION IF NOT EXISTS vector` is run on
  migrate; if it fails on permissions, stop with a clear message — never switch databases.
- No placeholders / no TODOs in critical paths. Every file must be complete.
- No Tailwind, no UI kit (no MUI/Chakra). Styling is plain CSS (CSS variables + CSS modules).
  Colours match the Ampera Campus Hire portal (sampled from its screenshot): navy #0F1D66 sidebar,
  #2D3778 active item, #000F5C banners/chat headers, #BCBED0 quiet text on navy; magenta #9C369A
  buttons/links (#7E2B7C pressed, #F7EDF7 tint); page #FCFCFC, white cards, text #050505/#5B5B5B.
  Dark theme = strictly black/grey/white, NO hues at all (operator request, 2026-11-19, for
  low-vision users): page #1A1A1A, cards/sidebar/banners #202020–#2E2E2E, near-white text, white
  buttons with near-black text; the logo and the landing orbit also turn greyscale. High contrast
  (dark) is the pure black-and-white version. Accessibility settings are ONE browser-wide choice
  (same on landing, sign-in and every portal page; synced across tabs), never per page or account.
  **No other hues**: navy, magenta, black/white/greys, plus one red for errors. All colours come
  from tokens in `src/design/tokens.css` — never hard-code a hex in a component. Montserrat font;
  the official Ampera logo PNG. 3D is used in ONE place only: the orbit animation in the landing
  page's navy hero (`src/three/HeroOrbit.tsx`, lazy-loaded, aria-hidden, frozen under "Stop
  animations"). The operator rejected the earlier robot/desk scene — don't bring it back. The
  signed-in app is flat.
  Agents are always shown with `AgentAvatar` (rounded-square icon badge + robot "AI" mark; one icon
  per agent, see AGENT_ICONS) and their name — never a letter, never colour alone.
  Motion is light (Framer Motion fade/slide) and must honour the "Stop animations" setting.
- `LLM_MOCK_MODE=true` must make every agent work deterministically with zero API keys.
- Accessibility is a hard requirement (WCAG 2.2 AA): keyboard-only use, visible focus, >= 4.5:1
  text contrast, labelled controls, and the Accessibility panel (text size, high contrast,
  easy-to-read font, extra spacing, stop animations). Font sizes are in rem so the text-size
  setting scales everything — never use px for text. Re-run an axe audit after UI changes.

## Repo layout
See `docs/01_ARCHITECTURE.md` for the full map. Top level: `backend/` (FastAPI + Poetry),
`frontend/` (Vite + React + TS), `docs/` (all project documentation), `scripts/backup.sh`,
`backups/` (gitignored tar.gz snapshots).

## Coding conventions
- Backend: Python 3.11+, SQLAlchemy 2.0 typed models, Pydantic v2 schemas, FastAPI routers per
  domain under `app/routers/`, role checks enforced server-side via `app/deps.py` dependencies
  (never UI-only). Raw SQL migration files in `backend/migrations/*.sql`, applied in order by
  `poetry run migrate` (tracked in a `schema_migrations` table).
- Frontend: function components + hooks, zustand for cross-component state, CSS variables from
  `src/design/tokens.css`, shared Framer Motion variants from `src/design/motion.ts`.
- Secrets: variable names only, ever. Never write an API key or password into a commit, a
  markdown file, or a code comment.

## Resume protocol (run this first, every session)
1. Read `CLAUDE.md` (this file), then `HANDOFF.md`, then `PROGRESS.md`, then the `docs/phases/`
   file for the current phase.
2. Check the repo matches what those files claim: list key files, run the quick verification
   commands named in `PROGRESS.md`'s "RESUME HERE" block.
3. Report any mismatch, fix the docs to match reality, then continue from the first unfinished
   phase. Never restart a finished phase.
4. `.env` must be filled in by the human operator directly (DB credentials are confidential —
   never ask for them in chat, never read `.env` into a response). If `.env` is missing values,
   ask the operator to fill it in rather than guessing or hardcoding a fallback.
