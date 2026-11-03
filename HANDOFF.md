# HANDOFF.md — paste-ready continuation prompt

If you are a new Claude Code session or account picking this up, read `CLAUDE.md`, then this
file, then `PROGRESS.md`, then `docs/phases/PHASE_01.md`, in that order, before touching code.

## Current state (2026-11-03)
**Phase 1 (Foundation) is DONE and verified end to end.** Phase 2 (Seed data and RAG) has not
started. This session pauses and asks the operator before starting each new phase (an explicit
operator instruction that overrides the master prompt's "don't stop between phases" default —
see `docs/06_DECISIONS.md`).

What exists and is verified working:
- `backend/`: Poetry project installed (`poetry install` succeeded — note first install pulls
  torch/sentence-transformers and takes ~15 minutes, this is normal). `app/config.py`,
  `app/db.py`, `app/security.py`, `app/deps.py`, `app/main.py` (`/api/health`), `app/cli.py`
  (script entry points: `migrate`, `seed`, `simulate-feedback`, `search`, `eval`, `dev`),
  `app/models/user.py` (first ORM model; more are added as later phases need them — the SQL
  migration is the schema source of truth, not the ORM).
- `backend/migrations/0001_init.sql`: all 22 logical tables, **applied successfully** against
  the operator's real Postgres 17 (port 5433). `idx_kb_chunks_embedding` uses a real `hnsw`
  index (this server's pgvector supports it; `app/cli.py::migrate` has an automatic ivfflat
  fallback for servers that don't, untested here since it wasn't needed).
- `backend/tests/test_health.py` passes (`poetry run pytest -q` → `1 passed`).
- `frontend/`: Vite + React 18 + TS scaffold, verified to boot (`npm run dev`, port 5173) and
  proxy `/api/*` to the backend correctly. Design tokens (`src/design/tokens.css`) already
  contain the final Phase 5 agent color palette and dark "AI ops room" background — don't
  redefine these in Phase 5, just build on them.
- `.env` is filled in by the operator and confirmed working: DB connects, pgvector enabled,
  `LLM_MOCK_MODE=true`. GROQ/GEMINI keys are not yet set (fine — mock mode covers Phase 3+
  agent work until the operator adds real keys).
- Git repo initialized on branch `main`, not yet committed (commit happens as part of this
  phase's documentation gate, right after this handoff is written).

## Exact next step: start Phase 2 — Seed data and RAG
Per the master build prompt:
1. Build `backend/app/seed/` generators + `backend/app/seed/data/*.json`: 48 users (1 admin, 3
   HR, 6 managers, rest employees across Engineering/Sales/Finance/Support/Operations, managers
   linked via `manager_id`), 60 IT runbook articles (VPN errors 619/691/800, laptop, Wi-Fi,
   email/Outlook, MFA, printer, software install, password policy, SSO, remote desktop, backup,
   phishing), 40 HR articles (leave types, payroll cycle, tax, benefits, travel, WFH,
   onboarding, performance review), leave balances for everyone, 3 months of payslips, 200
   historical tickets over 60 days, 300 historical runs with events+feedback, 80 historical
   approvals/access requests, and a 70-question `golden_set.json` (8 payroll-access traps).
   `poetry run seed` must be idempotent (safe to re-run).
2. Build `backend/app/rag/`: `chunker.py` (300–500 token chunks, overlap, split on headings
   first, store dept/title/category/section metadata), `embedder.py` (local
   `all-MiniLM-L6-v2`, 384 dims, computed during seed), `retriever.py` (hybrid: Postgres
   `tsvector`/`ts_rank_cd` lexical search + pgvector cosine search merged with Reciprocal Rank
   Fusion k=60, optional cross-encoder rerank of top 20 → top 5, exact-match boost for error
   codes via regex and policy names), `strategies.py` (three bandit arms: `lexical_heavy`
   BM25-weight 0.7, `semantic_heavy` vector-weight 0.7, `hybrid_rerank` RRF+cross-encoder —
   stored in `bandit_arms.config`), `reranker.py` (cross-encoder
   `cross-encoder/ms-marco-MiniLM-L-6-v2`).
3. Wire the `poetry run search "VPN error 619" --strategy hybrid_rerank` CLI (already stubbed
   in `app/cli.py::search`, calling `app.rag.retriever.retrieve` — that function doesn't exist
   yet, build it).
4. **Verify**: after seeding, exact error-code queries return the right runbook at rank 1 under
   `lexical_heavy` and `hybrid_rerank`; vague queries ("my laptop is super slow") return sensible
   results under `semantic_heavy`. Paste example CLI output into `PROGRESS.md` and
   `docs/phases/PHASE_02.md`.
5. Run the documentation gate (see `CLAUDE.md`'s resume protocol / the master prompt's
   "DOCUMENTATION GATE" section): update `docs/phases/PHASE_02.md`, `PROGRESS.md`, this file,
   `docs/07_CHANGELOG.md`, `docs/06_DECISIONS.md` (any choices made), `docs/02_DATABASE.md` if
   seed counts/schema details change, `docs/05_RUNBOOK.md` (add `poetry run seed` and
   `poetry run search` to the quickstart), run `scripts/backup.sh`, commit, then **stop and ask
   the operator before starting Phase 3** (per their standing instruction).

## Known issues
None blocking. Watch for: GROQ/GEMINI API keys are still empty in `.env` — fine for Phase 2
(no LLM calls needed for seeding/retrieval), but Phase 3's agents will need either real keys or
`LLM_MOCK_MODE=true` (currently true).

## Commands reference
```bash
cd backend
poetry install
poetry run migrate
poetry run pytest -q
poetry run dev              # backend on :8000

cd frontend
npm install
npm run dev                  # frontend on :5173, proxies /api to :8000

# Phase 2 (once built):
cd backend
poetry run seed
poetry run search "VPN error 619" --strategy hybrid_rerank
```
