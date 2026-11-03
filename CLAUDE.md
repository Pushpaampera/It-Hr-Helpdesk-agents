# CLAUDE.md — standing instructions for any Claude session on this repo

## Project, in one paragraph
Helpdesk AI Agents is a runnable demo of an enterprise IT/HR helpdesk staffed by a team of
cooperating AI agents (LangGraph), with real RAG over a Postgres+pgvector knowledge base, a
FastAPI backend, and a cinematic React + Three.js frontend whose animation is driven only by
real backend SSE events (no fake timers). It is being built for a live demo to a non-technical
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
  Visuals come from React Three Fiber, Framer Motion, GSAP, canvas/SVG.
- `LLM_MOCK_MODE=true` must make every agent work deterministically with zero API keys.
- 3D scenes target ~60fps: instancing, capped particle counts, `devicePixelRatio` capped at 2,
  pause when tab hidden, global "Reduce motion" toggle.

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
