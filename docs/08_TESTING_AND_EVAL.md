# 08 — Testing and Evaluation

## Tests that exist (Phase 1)
- `backend/tests/test_health.py` — asserts `/api/health` responds and reports `status`,
  `database`, `pgvector` keys. Run with `cd backend && poetry run pytest`.

## How to run
```bash
cd backend
poetry run pytest
```

## Golden-set results over time
Not yet available — the golden set (70 questions, 8 payroll-access traps) is generated in
Phase 2's seed step; `poetry run eval` (Phase 11) is what produces results logged here.

## Known failing cases
None yet.
