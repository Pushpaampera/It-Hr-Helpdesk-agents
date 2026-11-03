# Helpdesk AI Agents

An enterprise IT/HR helpdesk run by a team of cooperating AI agents — FastAPI + real RAG over
pgvector on the backend, a cinematic React + Three.js frontend driven entirely by live backend
events on the front.

Every planned phase (1-11, 12) is complete — Phase 10B was explicitly skipped as unneeded. Start
here:
- [`CLAUDE.md`](CLAUDE.md) — standing instructions and hard constraints for any session working
  on this repo.
- [`PROGRESS.md`](PROGRESS.md) — phase-by-phase status and verification output.
- [`HANDOFF.md`](HANDOFF.md) — current state and resume notes for a new session.
- [`docs/05_RUNBOOK.md`](docs/05_RUNBOOK.md) — the full setup/run guide (no sudo required).
- [`docs/09_DEMO_SCRIPT.md`](docs/09_DEMO_SCRIPT.md) — the live demo script.
- [`docs/`](docs/) — architecture, database, backend, frontend, decisions, changelog, testing,
  and one file per build phase.

## Quickstart
```bash
cd backend && poetry install && poetry run migrate && poetry run seed && poetry run dev
cd frontend && npm install && npm run dev   # separate terminal
```
Open `http://localhost:5173`. Demo accounts (password `Demo@1234` for all): `emma.employee@
acme.test`, `mark.manager@acme.test`, `hannah.hr@acme.test`, `alex.admin@acme.test`. Full detail
in `docs/05_RUNBOOK.md`.
