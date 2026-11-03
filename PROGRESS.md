# PROGRESS.md

## RESUME HERE
- Current phase: **Phase 3 — Agents, graph, mock APIs and events: DONE.** Next up: **Phase 4 —
  Auth, API surface, bandit and analytics** (not started; awaiting operator go-ahead, since this
  session pauses between phases on request).
- Last updated: 2026-11-03
- Next step: start Phase 4 — implement JWT login + role dependencies wired onto the Phase 3
  routers (chat/approvals/feedback currently take `user_id`/`approver_id` directly in the body;
  these need to switch to the authenticated identity), plus the remaining routers
  (conversations, tickets, kb, analytics, agents, bandit, eval, costs), the live LinUCB stats
  endpoint, and `poetry run simulate-feedback --n 500`.
- Blocker/dependency: none currently. `.env` is filled in and verified working end to end
  (DB connects, pgvector enabled, seeded, and the full 7-agent LangGraph flow — including a real
  manager-approval pause/resume — verified against a live HTTP server). `LLM_MOCK_MODE=true` is
  set so everything built so far works without GROQ/GEMINI keys; the operator can add real keys
  later for live-provider testing (the provider wrapper in `app/agents/llm.py` already supports
  both paths).

## Phase checklist

| # | Phase | Status | Date | Result |
|---|-------|--------|------|--------|
| 1 | Foundation | done | 2026-11-03 | Repo layout, Poetry project, 22-table SQL migration (24 tables incl. bookkeeping), `/api/health` verified against a real DB with pgvector/HNSW enabled, Vite+React+TS scaffold verified serving and proxying to the backend. |
| 2 | Seed data and RAG | done | 2026-11-03 | 48 users, 100 KB articles (130 chunks), 200 tickets, 80 approvals, 150 leave requests, 300 historical runs, 70 golden questions. Hybrid retrieval verified: exact error codes rank #1, semantic search sensible, dept filter correct. |
| 3 | Agents, graph, mock APIs and events | done | 2026-11-03 | 7 agents + LangGraph flow with real NodeInterrupt pause/resume for manager approval. All 7 master-prompt verification scenarios (a)-(g) pass. SSE streaming confirmed end to end over real HTTP. |
| 4 | Auth, API surface, bandit and analytics | not started | | |
| 5 | Frontend design system and 3D building blocks | not started | | |
| 6 | Landing page | not started | | |
| 7 | Login page | not started | | |
| 8 | Dashboard shell and Overview | not started | | |
| 9 | AI Assistant page (centerpiece) | not started | | |
| 10 | Remaining dashboard pages | not started | | |
| 10B | Demo experience layer (HR showcase) | not started | | |
| 11 | Evaluation and polish | not started | | |
| 12 | Documentation and final verification | not started | | |

## Verification output log
(Appended to at the end of each phase.)

### Phase 1 — DONE
- `npm install` in `frontend/`: succeeded, 193 packages. `npm run dev` verified to boot and
  serve `200` on `http://localhost:5173/`, and `GET /api/health` through the Vite proxy returned
  the full healthy payload.
- `poetry install` in `backend/`: succeeded (~16 min first install for torch/sentence-
  transformers). Verified imports of fastapi, sqlalchemy, psycopg, sentence_transformers, groq,
  langgraph.
- `poetry run pytest -q`: `1 passed` (`test_health.py`).
- `poetry run migrate`: succeeded — `[migrate] pgvector extension is enabled`,
  `[migrate] 0001_init OK`, `[migrate] all migrations applied`. 24 tables confirmed present;
  `idx_kb_chunks_embedding` confirmed using the `hnsw` access method (no ivfflat fallback
  needed on this server).
- `GET /api/health` on the real backend: `{"status":"ok", "mock_mode":true,
  "database":{"connected":true}, "pgvector":{"enabled":true}}`.
- Full details, exact commands and problems-fixed in `docs/phases/PHASE_01.md`.

### Phase 2 — DONE
- `poetry run seed`: all row counts match spec exactly (users=48, knowledge_articles=100,
  kb_chunks=130, leave_balances=192, payslips=144, tickets=200, ticket_events=352, approvals=80,
  access_requests=80, leave_requests=150, agent_runs=300, agent_events=1206, feedback=300,
  bandit_arms=3, bandit_state=3, bandit_decisions=249, bandit_rewards=249, golden_questions=70).
  Completed in 11.1s. Re-run confirmed idempotent (no duplication).
- `poetry run search "VPN error 619" --strategy lexical_heavy` and `--strategy hybrid_rerank`
  both rank "VPN Error 619: causes and fix" at #1.
- `poetry run search "my laptop is super slow" --strategy semantic_heavy` returns sensible
  laptop/Wi-Fi results (no exact keyword overlap possible — pure semantic match).
- `poetry run search "parental leave policy" --strategy hybrid_rerank --dept HR` returns only
  HR-dept parental-leave articles, confirming the dept filter.
- `poetry run pytest -q`: `5 passed` (health check + 4 retrieval regression tests).
- Full details, exact commands and problems-fixed in `docs/phases/PHASE_02.md`.

### Phase 3 — DONE
- `poetry run pytest -q`: **12 passed** (1 health + 4 retrieval + 7 agent-graph scenarios).
- Scenario (a) VPN 619 → IT route, cited "VPN Error 619" source, `status=resolved`.
- Scenario (b) sick days → HR route, answer uses the employee's own real leave balance.
- Scenario (c) reset password → `action` tool_call `reset_password`, resolved.
- Scenario (d) "I need access to the Finance system" → `approval_required` event,
  `status=awaiting_approval`; after a manager approves via `approvals_api.decide()` +
  `resume_after_approval()`, run becomes `resolved`.
- Scenario (e) unanswerable question → ticket created, `status=escalated`, ticket summary
  mentions the original question.
- Scenario (f) "Show me Priya's payslip" → Guard blocks it, logs `audit_log` action
  `guard_blocked` for the requester.
- Scenario (g) every run's `agent_events` have strictly increasing, unique `seq` numbers.
- Manual HTTP smoke test: `POST /api/chat/stream` streamed real SSE events (`agent_event`,
  `handoff`, `token`, `final`) end to end through a live `uvicorn` server.
- Two real bugs found and fixed via this scenario testing: a missing `Priya` seed user, and a
  ticket-number sequence that wasn't advanced past the hand-seeded ticket numbers (both in
  `docs/phases/PHASE_03.md` and `docs/06_DECISIONS.md`).
- Full details, exact commands and problems-fixed in `docs/phases/PHASE_03.md`.
