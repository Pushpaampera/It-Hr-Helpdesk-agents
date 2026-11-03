# Phase 2 — Seed data and RAG

## Goal
Generate realistic seed data (`poetry run seed`) and build the hybrid retrieval pipeline
(lexical + vector + RRF + cross-encoder rerank, three selectable strategies), with a
`poetry run search` CLI for manual verification.

## Files created
### RAG (`backend/app/rag/`)
- `chunker.py` — splits article bodies into ~300-500 token (≈230-380 word) chunks, overlap 40
  words, splitting on `## Heading` markdown first; each chunk is prefixed with its article title
  (and section heading, if not the first) so standalone chunks stay self-describing.
- `embedder.py` — local `all-MiniLM-L6-v2` via `sentence-transformers`, 384-dim,
  `normalize_embeddings=True`; `embed_texts()` (batch) and `embed_query()`.
- `reranker.py` — cross-encoder `cross-encoder/ms-marco-MiniLM-L-6-v2`, `rerank(query,
  candidates, top_k)`.
- `strategies.py` — the three bandit arms' configs (`lexical_heavy` 0.7 lexical weight,
  `semantic_heavy` 0.7 vector weight, `hybrid_rerank` RRF k=60 + cross-encoder rerank).
- `retriever.py` — `retrieve(query, strategy, dept, top_k)`: Postgres `tsvector`/
  `websearch_to_tsquery`/`ts_rank_cd` lexical search + pgvector cosine search (`<=>` operator,
  `register_vector` from the `pgvector` package handles Python-list↔`vector` adaptation),
  merged either by weighted min-max normalized fusion (`lexical_heavy`/`semantic_heavy`) or
  Reciprocal Rank Fusion + cross-encoder rerank (`hybrid_rerank`), plus an exact-match boost
  (+0.5) for error codes (`ERR-\d+`, `0x[0-9A-F]+`, bare `error 619`-style codes) and article
  titles.

### Bandit foundations, pulled forward from Phase 4 (see docs/06_DECISIONS.md)
- `backend/app/bandit/features.py` — 12-dim context vector (dept one-hot ×2, query-length
  bucket ×3, contains-error-code, contains-policy-keyword, hour-of-day bucket ×4, supervisor
  confidence).
- `backend/app/bandit/linucb.py` — `LinUCBArm` (disjoint LinUCB: `A`, `b` accumulators,
  `score()`/`update()`), `select_arm()`, `compute_reward(rating, resolved)` implementing
  `reward = 0.6*(rating-1)/4 + 0.4*resolved` exactly as specified.

### Seed generators (`backend/app/seed/generators/`)
- `knowledge.py` — 60 IT runbook articles (VPN errors 619/691/800/868/789, laptop, Wi-Fi,
  email/Outlook, MFA, printer, software, password policy, SSO, remote desktop, backup,
  security/phishing — 12 categories × 5) and 40 HR policy articles (annual/sick/casual/
  parental leave, carry-forward, payroll, tax, benefits, insurance, travel, WFH, onboarding,
  performance review — 13 categories).
- `users.py` — 48 users: the 4 demo accounts first (matching `docs/00_PROJECT_OVERVIEW.md`
  exactly), 2 more HR (3 total), 5 more managers (6 total, one per department), the rest
  employees spread across the 5 departments with `manager_id` linked to their department's
  manager.
- `ops.py` — leave balances (24/12/7/112 days annual/sick/casual/parental), 3 months of
  payslips per user, 200 historical tickets (60-day spread, weighted status/priority, linked
  ticket_events), 80 access-requests+approvals (manager as approver), 150 historical leave
  requests, and 300 historical `agent_runs` + `agent_events` + `feedback` + `bandit_decisions`/
  `bandit_rewards` — the bandit arms are incrementally updated in generation order so
  `bandit_state` is already "warmed up" by the time seeding finishes (Reinforcement Lab won't
  look empty when it's built in Phase 10).
- `golden.py` — 70 golden questions: 24 IT + 22 HR grounded/answerable, 8 that need an action,
  8 that should escalate (no confident answer exists), and 8 privacy traps (asking for another
  employee's payslip/salary/leave/personal info, including one prompt-injection attempt) that
  the Guard must block.
- `seed.py` — orchestrates all of the above inside one transaction, idempotent (checks `users`
  row count first; re-running after a successful seed prints a message and exits without
  duplicating anything).

### CLI
- `backend/app/cli.py::search` (already stubbed in Phase 1) now works: `poetry run search
  "<query>" --strategy <lexical_heavy|semantic_heavy|hybrid_rerank> [--dept IT|HR]`.

## Commands to run
```bash
cd backend
poetry run migrate     # if not already applied
poetry run seed          # idempotent — safe to re-run
poetry run search "VPN error 619" --strategy hybrid_rerank
poetry run pytest -q
```

## Verification results
`poetry run seed` output (fresh database):
```
[seed] inserted 48 users
[seed] inserted 100 knowledge articles (60 IT, 40 HR)
[seed] embedding 130 chunks locally (all-MiniLM-L6-v2) ...
[seed] inserted 130 kb_chunks with embeddings
[seed] inserted 192 leave balance rows, 144 payslips
[seed] inserted 200 tickets, 352 ticket events
[seed] inserted 80 approvals, 80 access requests
[seed] inserted 150 leave requests
[seed] inserted 300 agent runs, 1206 agent events, 300 feedback rows, 249 bandit decisions
[seed] inserted 70 golden questions
[seed] done in 11.1s
```
Re-running `poetry run seed` immediately after: `[seed] users table is not empty — seed already
applied, skipping (idempotent).` — confirmed idempotent.

Row counts verified directly against Postgres match the spec exactly: `users=48,
knowledge_articles=100, kb_chunks=130, leave_balances=192, payslips=144, tickets=200,
ticket_events=352, approvals=80, access_requests=80, leave_requests=150, agent_runs=300,
agent_events=1206, feedback=300, bandit_arms=3, bandit_state=3, bandit_decisions=249,
bandit_rewards=249, golden_questions=70`.

### Retrieval quality (the Phase 2 acceptance criteria)
Exact error-code query ranks the correct runbook at #1 under both required strategies:
```
$ poetry run search "VPN error 619" --strategy lexical_heavy
1. [1.461] VPN Error 619: causes and fix (af26a4df-...)

$ poetry run search "VPN error 619" --strategy hybrid_rerank
1. [9.877] VPN Error 619: causes and fix (af26a4df-...)
```
Vague query returns sensible results under `semantic_heavy` (no exact keyword match possible —
pure semantic similarity):
```
$ poetry run search "my laptop is super slow" --strategy semantic_heavy
1. [0.700] Wi-Fi is very slow compared to usual
2. [0.641] Laptop battery drains unusually fast
3. [0.525] Laptop battery drains unusually fast (different section)
4. [0.519] Laptop overheating and fan running constantly
5. [0.454] Laptop overheating and fan running constantly (different section)
```
Dept filter confirmed working (HR query only returns HR-dept chunks):
```
$ poetry run search "parental leave policy" --strategy hybrid_rerank --dept HR
1. [8.166] Parental leave policy overview
2. [7.255] Parental leave policy overview (different section)
3. [6.828] Returning to work after parental leave
4. [6.694] Parental leave pay and how it's calculated
5. [6.536] Parental leave for adoption and fostering
```
`poetry run pytest -q` → `5 passed` (health check + 4 new retrieval regression tests in
`backend/tests/test_retrieval.py`, covering exactly the three cases above plus the dept filter).

## Problems met and how they were fixed
- First `poetry run seed` attempt failed with a self-referencing foreign-key violation
  (`users_manager_id_fkey`): a manager row referenced by `manager_id` hadn't been inserted yet
  within the same batch `executemany`, since Postgres checks FK constraints per-statement, not
  at transaction end (no `DEFERRABLE` constraint was declared). Fixed by inserting all users
  first with no `manager_id`, then a second `executemany` of targeted `UPDATE ... SET
  manager_id` statements once every row exists.
- Confirmed `pgvector`'s `register_vector(conn)` (psycopg3 integration) accepts plain Python
  lists directly for `vector` columns (verified with a throwaway temp table) — no need to wrap
  embeddings in numpy arrays or a `Vector(...)` helper before insert.

## Status
**Done.** All verification checks above passed.
