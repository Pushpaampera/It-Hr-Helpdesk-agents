# HANDOFF.md — paste-ready continuation prompt

If you are a new Claude Code session or account picking this up, read `CLAUDE.md`, then this
file, then `PROGRESS.md`, then `docs/phases/PHASE_02.md`, in that order, before touching code.

## Current state (2026-11-03)
**Phase 1 (Foundation) and Phase 2 (Seed data and RAG) are both DONE and verified end to end.**
Phase 3 (Agents, graph, mock APIs and events) has not started. This session pauses and asks the
operator before starting each new phase (explicit operator instruction overriding the master
prompt's default — see `docs/06_DECISIONS.md`).

What exists and is verified working:
- **Backend foundation** (Phase 1): Poetry project, `app/config.py`/`db.py`/`security.py`/
  `deps.py`/`main.py` (`/api/health`), `app/cli.py` script entry points, `app/models/user.py`.
  `backend/migrations/0001_init.sql` applied against the operator's real Postgres 17 (port
  5433), all 22 logical tables present, HNSW index working.
- **RAG pipeline** (Phase 2): `app/rag/chunker.py`, `embedder.py` (local all-MiniLM-L6-v2),
  `reranker.py` (cross-encoder/ms-marco-MiniLM-L-6-v2), `strategies.py` (3 arms), `retriever.py`
  (hybrid lexical+vector+RRF, exact-match boost). `poetry run search "<query>" --strategy
  <name> [--dept IT|HR]` works and is verified to rank correctly (see `docs/phases/PHASE_02.md`).
- **Bandit foundations** (pulled forward from Phase 4): `app/bandit/features.py` (12-dim
  context vector), `app/bandit/linucb.py` (`LinUCBArm`, `select_arm`, `compute_reward`).
- **Seed data** (Phase 2): `poetry run seed` is idempotent and populates: 48 users (demo
  accounts emma.employee/mark.manager/hannah.hr/alex.admin, password `Demo@1234` for all), 100
  knowledge articles (60 IT, 40 HR) chunked into 130 embedded `kb_chunks`, leave balances +
  3 months of payslips for everyone, 200 historical tickets, 80 approvals/access requests, 150
  leave requests, 300 historical agent runs with 1206 events + 300 feedback rows + 249 bandit
  decisions/rewards (bandit_state already "warmed up"), and a 70-question golden set (incl. 8
  privacy traps).
- `.env` is filled in and confirmed working end to end; `LLM_MOCK_MODE=true`; GROQ/GEMINI keys
  are still empty (fine until Phase 3 needs live-provider testing — mock mode covers it).
- Git repo on branch `main`; Phase 1 and (pending this handoff) Phase 2 are committed.

## Exact next step: start Phase 3 — Agents, graph, mock APIs and events
Per the master build prompt:
1. `backend/app/agents/llm.py` — single provider wrapper: Groq + Gemini SDKs, `tenacity`
   retries/backoff, automatic fallback (Gemini fails → try Groq and vice versa), per-provider
   rate limiting, token/latency accounting, and full `LLM_MOCK_MODE` support (deterministic
   canned responses per agent, still emitting the full event schema).
2. `backend/app/agents/events.py` — the SSE event emitter/schema helper (see
   `docs/01_ARCHITECTURE.md`'s event envelope), including the plain-English `caption` templates
   per agent/status (reuse the caption style already used in `app/seed/generators/ops.py`'s
   historical event generation — e.g. "Sage is reading your message...", "Iris is checking the
   IT runbooks...", "Gus stopped this request...").
3. The 7 agents in `backend/app/agents/`: `guard.py` (no LLM — rules + prompt-injection
   detection, blocks cross-user payroll/personal data access, logs to `audit_log`),
   `supervisor.py` (Sage — Groq `llama-3.1-8b-instant`, strict JSON `{route, confidence,
   needs_action, intent}`, routes to OTHER below 0.55 confidence), `it_support.py` (Iris —
   Gemini Flash-Lite, calls `app.rag.retriever.retrieve` with `dept="IT"` and the bandit-chosen
   strategy via `app.bandit.linucb.select_arm`), `hr_policy.py` (Hana — same pattern,
   `dept="HR"`, also reads the requester's own `leave_balances`), `action.py` (Atlas — Groq
   `openai/gpt-oss-20b` tool calling: `reset_password`, `request_access` [pauses the graph via a
   LangGraph interrupt pending manager approval], `apply_leave`, `get_leave_balance`,
   `unlock_account`), `ticketing.py` (Tess — Groq `openai/gpt-oss-20b`, creates/updates a
   ticket with a context summary), `feedback.py` (Finn — no LLM, computes
   `app.bandit.linucb.compute_reward` and calls `LinUCBArm.update`).
4. `backend/app/agents/graph.py` — LangGraph wiring: `guard -> supervisor -> (it_support |
   hr_policy | other_reply) -> action (if needs_action) -> ticketing (if unresolved/escalated)
   -> feedback`, conditional edges, shared typed state, every step persisted to `agent_events`.
5. `backend/app/mock_apis/`: `directory.py`, `hr_system.py` (leave balances/requests,
   payslips), `it_system.py` (password reset, unlock, access grant) — write to the real tables,
   log every action to `audit_log`.
6. SSE endpoint (`POST /api/chat/stream`) with the full event schema from
   `docs/01_ARCHITECTURE.md`, plus `GET /api/runs/{id}/events` for replay.
7. **Verify** (CLI or pytest, per the master prompt): (a) "VPN error 619" → IT route + cited
   answer; (b) "how many sick days do I have" → HR route + own balance; (c) "reset my password"
   → action runs; (d) "I need access to the finance system" → pauses for manager approval,
   resumes after; (e) unanswerable question → ticket with summary; (f) "show me Priya's
   payslip" → blocked by Guard, logged to `audit_log`; (g) every step appears in `agent_events`
   with sequence numbers.
8. Run the documentation gate: `docs/phases/PHASE_03.md`, `PROGRESS.md`, this file,
   `docs/07_CHANGELOG.md`, `docs/06_DECISIONS.md`, `docs/01_ARCHITECTURE.md`/`03_BACKEND.md` (add
   the real prompts used by each agent), `scripts/backup.sh`, commit, **then stop and ask the
   operator before starting Phase 4**.

## Known issues
None blocking. GROQ_API_KEY/GEMINI_API_KEY are still empty in `.env` — Phase 3's agents must
work correctly under `LLM_MOCK_MODE=true` regardless; live-provider testing can happen whenever
the operator adds real keys (not required to finish Phase 3).

## Commands reference
```bash
cd backend
poetry install
poetry run migrate
poetry run seed
poetry run pytest -q
poetry run dev                                              # backend on :8000
poetry run search "VPN error 619" --strategy hybrid_rerank    # retrieval sanity check

cd frontend
npm install
npm run dev                                                   # frontend on :5173
```
