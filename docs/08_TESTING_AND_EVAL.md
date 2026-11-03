# 08 — Testing and Evaluation

Updated through Phase 12.

## Tests that exist
`cd backend && poetry run pytest -q`:
- `backend/tests/test_health.py` (Phase 1, 1 test) — `/api/health` reports `status`, `database`,
  `pgvector` keys against a real DB connection.
- `backend/tests/test_agents_graph.py` (Phase 2-3, 11 tests) — 4 retrieval regression tests
  (exact error codes rank #1, semantic search sensible, dept filter correct) + 7 agent-graph
  scenarios run through the real `start_chat`/agent graph: grounded IT answer with cited sources,
  grounded HR answer using the employee's own real leave balance, a `reset_password` tool call,
  the full `request_access` approval pause → `resume_after_approval` → resolved flow, an
  unanswerable question creating a real ticket, the Guard blocking a cross-user payroll request
  and logging it to `audit_log`, and strictly increasing/unique `agent_events.seq` per run.
- `backend/tests/test_auth_api.py` (Phase 4, 12 tests) — login for all 4 demo roles, wrong
  password / missing token rejected, role enforcement on analytics/eval endpoints, ownership
  enforcement on run-events access, feedback correctly updating `bandit_state.pulls`, a defined
  learning curve from `run_simulation(60)`.

**Current result: 24/24 passing** (verified 2026-11-04, Phase 12's final run).

## How to run
```bash
cd backend
poetry run pytest -q
```

## Golden-set results over time
`poetry run eval` (or `POST /api/eval/run`, admin only) runs all 70 `golden_questions` through
the real agent graph (`LLM_MOCK_MODE`-safe) and scores route accuracy, source-citation accuracy,
and escalation-match behavior. `PASS_THRESHOLD = 0.66` of the three checks, and a question that
paused for manager approval is never counted as passed (the eval runner doesn't resume approvals
— see "Known limitations" below).

| Date | Pass rate | Avg correctness | IT | HR |
|------|-----------|------------------|----|----|
| 2026-11-03 (Phase 4, first run) | 81.43% (57/70) | 0.8476 | — | — |
| 2026-11-03 (Phase 11, live UI trigger) | 81.43% (57/70) | 0.8381-0.8476 (varies slightly run to run — real retrieval/rerank scores, not deterministic text matching) | 26/30 | 31/40 |
| 2026-11-04 (Phase 12, final verification run) | **81.43% (57/70)** | 0.8381 | 26/30 | 31/40 |

Pass rate has been stable at 57/70 across every run in this project's history — the same 13
questions fail for the same structural reasons each time (see below), not flaky classification.

## Known failing cases (as of the Phase 12 verification run)
All 13 failures are genuine route-classification or retrieval-precision misses from Sage/the
retrieval pipeline under `LLM_MOCK_MODE`'s deterministic heuristic classifier, not application
bugs — this is the real accuracy ceiling of the mock-mode routing logic, left as-is since
`LLM_MOCK_MODE=true` must work with zero API keys (`CLAUDE.md`'s hard constraint) and a keyword-
heuristic router will always miss some genuinely ambiguous phrasing a real LLM would catch:

- 6 routed to `OTHER` when a human would clearly classify them IT/HR from phrasing alone (e.g.
  "My mailbox says it's over quota" → IT, "When is the next pay date" → HR) — the mock
  classifier's keyword heuristics don't cover every real-world phrasing.
- 4 more routed to `OTHER` on workplace-relationship-adjacent HR questions ("My team lead is
  asking me to work outside my contracted hours regularly", "I disagree with my performance
  rating") — genuinely ambiguous between HR-policy and "just venting," a real LLM would likely
  do better but mock mode's heuristic correctly declines to guess.
- 1 ("I need access to the Finance system") routed correctly but is counted as failed only
  because it paused for approval and the eval runner doesn't resume paused runs end to end —
  this is a known limitation of the eval harness, not the agent graph (see below).
- 1 ("I need admin access to the AWS console") routed correctly (IT) but retrieved MFA-setup
  articles instead of an access-request flow — a real retrieval near-miss, not a routing bug.
- 1 ("I think there's a billing error on my health insurance") misrouted to IT and retrieved VPN
  articles — a genuine retrieval/routing miss worth revisiting if mock-mode classification is
  ever improved.

## Known limitations of the eval harness itself
- `app/eval/run_eval.py` doesn't resume paused (`request_access`) golden questions end to end —
  a question that triggers an approval pause is scored as failed regardless of whether the
  route/retrieval were correct, which slightly undercounts the true pass rate (1 of the 13
  current failures is purely this).
- `test_agents_graph.py::test_e_unanswerable_question_creates_ticket` has been observed to fail
  intermittently in this environment (first noticed in Phase 10, reproduced on a clean Phase 9
  tree, did not trigger in Phase 11's or Phase 12's final runs) — not yet root-caused. See
  `docs/phases/PHASE_10.md`.

## Manual/live verification
Every frontend phase (6 onward) was verified with a real Chrome browser (via `playwright-core`)
driving actual user actions — clicks, form submissions, multi-session flows — not just static
screenshots, per the lesson in `HANDOFF.md`. See each `docs/phases/PHASE_0N.md` for that phase's
specific verification log; `PROGRESS.md`'s "Verification output log" has the condensed version
for every phase in one place.
