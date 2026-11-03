# PROGRESS.md

## RESUME HERE
- Current phase: **Phase 1 — Foundation: DONE.** Next up: **Phase 2 — Seed data and RAG**
  (not started; awaiting operator go-ahead, since this session pauses between phases on
  request).
- Last updated: 2026-11-03
- Next step: start Phase 2 — implement `backend/app/seed/` generators (48 users, 60 IT + 40 HR
  articles, leave balances, payslips, 200 historical tickets, 300 historical runs, 80
  approvals/access requests, 70-question golden set), `backend/app/rag/` (chunker, embedder,
  hybrid retriever with 3 strategies, cross-encoder rerank), and the `poetry run search` CLI.
- Blocker/dependency: none currently. `.env` is filled in and verified working (DB connects,
  pgvector enabled). `LLM_MOCK_MODE=true` is set so the app works without GROQ/GEMINI keys.

## Phase checklist

| # | Phase | Status | Date | Result |
|---|-------|--------|------|--------|
| 1 | Foundation | done | 2026-11-03 | Repo layout, Poetry project, 22-table SQL migration (24 tables incl. bookkeeping), `/api/health` verified against a real DB with pgvector/HNSW enabled, Vite+React+TS scaffold verified serving and proxying to the backend. |
| 2 | Seed data and RAG | not started | | |
| 3 | Agents, graph, mock APIs and events | not started | | |
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
