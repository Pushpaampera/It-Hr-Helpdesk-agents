# HANDOFF.md — paste-ready continuation prompt

If you are a new Claude Code session or account picking this up, read `CLAUDE.md`, then this
file, then `PROGRESS.md`, then `docs/phases/PHASE_03.md`, in that order, before touching code.

## Current state (2026-11-03)
**Phases 1-3 are all DONE and verified end to end.** Phase 4 (Auth, API surface, bandit and
analytics) has not started. This session pauses and asks the operator before starting each new
phase (explicit operator instruction — see `docs/06_DECISIONS.md`).

What exists and is verified working:
- **Foundation** (Phase 1): Poetry project, `/api/health`, all 22 tables migrated against the
  operator's real Postgres 17 (port 5433), Vite+React+TS scaffold.
- **RAG + seed data** (Phase 2): `app/rag/` hybrid retrieval (verified ranking quality),
  `poetry run seed` idempotently populates 48 users (incl. the 4 demo accounts and a specific
  named employee, Priya Sharma, needed for the privacy-guard demo), 100 knowledge articles (130
  chunks), 200 tickets, 80 approvals, 150 leave requests, 300 historical runs, 70 golden
  questions.
- **Agents + graph** (Phase 3): all 7 agents (Gus/guard, Sage/supervisor, Iris/it_support,
  Hana/hr_policy, Atlas/action, Tess/ticketing, Finn/feedback) in `app/agents/`, wired into a
  LangGraph `StateGraph` (`app/agents/graph.py`) with a **real** pause/resume for
  `request_access` (via `NodeInterrupt` + a module-level `MemorySaver` checkpointer — see
  `docs/06_DECISIONS.md` for why this is fine for a local demo but would need a persistent
  checkpointer in a real deployment). `app/mock_apis/` (directory, hr_system, it_system,
  approvals) write to the real tables and log to `audit_log`. `app/agents/llm.py` supports both
  `LLM_MOCK_MODE=true` (current default, zero API keys needed) and real Groq/Gemini calls with
  retry/fallback — not yet tested against real keys since none are configured.
- **HTTP surface** (Phase 3, intentionally minimal/unauthenticated): `POST /api/chat/stream`
  (SSE), `GET /api/runs/{id}/events`, `POST /api/approvals/{id}/decide`, `POST /api/feedback` —
  all take `user_id`/`approver_id` directly in the request body since JWT auth doesn't exist
  yet. **Phase 4 must wrap these with real auth and remove those body fields.**
- `backend/tests/test_agents_graph.py` — all 7 of the master prompt's Phase 3 verification
  scenarios pass (`poetry run pytest -q` → 12 passed total).
- `.env` confirmed working end to end; `LLM_MOCK_MODE=true`; GROQ/GEMINI keys still empty (fine
  — mock mode is fully functional; Phase 4 doesn't require real keys either).
- Git repo on branch `main`; Phases 1-2 committed, Phase 3 pending this handoff's commit.
- **Environment quirk**: ports 8000 and 8001 are occupied by unrelated system services in this
  sandbox (not part of this project — don't touch them). Use a different port (e.g. 8077) for
  manual `poetry run dev` testing, or just rely on `vite.config.ts`'s proxy once the frontend
  exists and both are on their expected ports in a clean environment.

## Exact next step: start Phase 4 — Auth, API surface, bandit and analytics
Per the master build prompt:
1. JWT login (`app/routers/auth.py`): `POST /api/auth/login` (email+password, bcrypt verify via
   `app/security.py::verify_password`, issue via `create_access_token`), `POST
   /api/auth/logout`, `GET /api/auth/me`. Wire `app/deps.py::get_current_user`/`require_roles`
   onto every existing and new router — **including retrofitting `chat.py`, `approvals.py`,
   `feedback.py` from Phase 3** to use the authenticated identity instead of body-supplied
   `user_id`/`approver_id`.
2. Remaining routers: `conversations` (list/get), `tickets` (list/detail/update — employees see
   only their own), `approvals` (list pending, in addition to the existing decide endpoint),
   `kb` (search, article detail, the lexical-vs-vector-vs-hybrid comparison endpoint for one
   query — this can mostly just call `app.rag.retriever.retrieve` three times),
   `analytics` (KPIs, timeseries, per-department — query the historical seed data), `agents`
   (status, and `GET /api/agents/live` — the always-on aggregated SSE stream mentioned in
   `docs/01_ARCHITECTURE.md` but not yet built), `bandit` (`GET /api/bandit/stats`: arm pulls,
   average reward over time, regret estimate, per-context win rates — query
   `bandit_decisions`/`bandit_rewards`/`bandit_state`), `eval` (trigger a golden-set run, list
   past runs), `admin` (reset-demo button's backend, covered more fully in Phase 10B), `costs`.
3. `app/bandit/simulator.py` + wire `poetry run simulate-feedback --n 500` (stubbed in
   `app/cli.py::simulate_feedback` already, calling a not-yet-existing `run_simulation`) —
   generates synthetic feedback demonstrating the "lexical wins for error-code queries, semantic
   wins for vague ones" pattern, updating `bandit_state` incrementally like
   `app/seed/generators/ops.py::generate_historical_runs` already does for the seeded 300 runs.
4. Prometheus `/metrics`. Optional Langfuse hook (only if `LANGFUSE_PUBLIC_KEY`/
   `LANGFUSE_SECRET_KEY` are present — they're currently empty).
5. **Verify** (pytest): login works for all 4 demo roles; forbidden cross-role access is
   rejected (e.g. an employee calling an admin-only endpoint gets 403); a `POST /api/feedback`
   call visibly updates `bandit_state`; the simulator produces a learning curve (arm pulls/
   average reward change over successive calls).
6. Run the documentation gate: `docs/phases/PHASE_04.md`, `PROGRESS.md`, this file,
   `docs/07_CHANGELOG.md`, `docs/06_DECISIONS.md`, `docs/03_BACKEND.md` (full endpoint table),
   `scripts/backup.sh`, commit, **then stop and ask the operator before starting Phase 5**.

## Known issues
None blocking. Two things worth knowing about, not fixing:
- The Phase 3 HTTP endpoints have no auth — by design, since Phase 4 is where auth is built.
  Don't treat this as a regression to silently patch; it's the next phase's actual job.
- `MemorySaver`'s in-memory checkpointer means a backend restart loses any run that's
  mid-approval (`awaiting_approval` status with no way to resume). Fine for a local demo; just
  don't restart the backend while a demo scenario has a pending approval.

## Commands reference
```bash
cd backend
poetry install
poetry run migrate
poetry run seed
poetry run pytest -q
poetry run dev                                              # pick a free port in this sandbox
poetry run search "VPN error 619" --strategy hybrid_rerank

cd frontend
npm install
npm run dev
```
