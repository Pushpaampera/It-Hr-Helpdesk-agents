"""`poetry run eval` / `POST /api/eval/run` — runs the 70-question golden set end to end
through the real agent graph (LLM_MOCK_MODE-safe) and scores route accuracy, source-citation
accuracy, and escalation behaviour against each question's expectations.
"""
import asyncio
import json
import uuid

from sqlalchemy import text

from app.agents.events import drop_queue
from app.agents.graph import start_chat
from app.db import get_engine

EVAL_USER_EMAIL = "emma.employee@acme.test"
PASS_THRESHOLD = 0.66


async def _run_one(user: dict, question: dict) -> dict:
    run_id = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    await start_chat(user, question["question"], None, run_id, queue)

    final_event = None
    while not queue.empty():
        item = queue.get_nowait()
        if item and item.get("type") == "final":
            final_event = item

    engine = get_engine()
    with engine.connect() as conn:
        run = conn.execute(text("SELECT status, route FROM agent_runs WHERE id = :id"), {"id": run_id}).mappings().first()
    drop_queue(run_id)

    actual_route = (run["route"] if run else None) or "OTHER"
    paused = bool(run and run["status"] == "awaiting_approval")
    ticket_created = bool(run and run["status"] == "escalated")
    sources = final_event["sources"] if final_event else []
    source_titles = {s.get("title") for s in sources}

    route_match = actual_route == question["expected_route"]
    if question["expected_sources"]:
        source_match = bool(source_titles & set(question["expected_sources"]))
    else:
        source_match = True
    escalate_match = ticket_created == question["should_escalate"]

    checks = [route_match, source_match, escalate_match]
    correctness = sum(1.0 for c in checks if c) / len(checks)
    passed = correctness >= PASS_THRESHOLD and not paused

    return {
        "question_id": question["id"], "actual_route": actual_route, "correctness": round(correctness, 4),
        "passed": passed,
        "details": {
            "route_match": route_match, "source_match": source_match, "escalate_match": escalate_match,
            "paused_for_approval": paused, "sources": list(source_titles),
        },
    }


async def _run_eval_async() -> dict:
    engine = get_engine()
    user_row = get_user_by_email(EVAL_USER_EMAIL)
    if not user_row:
        raise RuntimeError(f"Eval user {EVAL_USER_EMAIL} not found — run `poetry run seed` first.")
    user = {k: str(v) if v is not None else v for k, v in user_row.items()}

    with engine.connect() as conn:
        questions = conn.execute(
            text(
                """SELECT id, question, expected_route, expected_answer, expected_sources,
                       needs_action, should_escalate FROM golden_questions ORDER BY created_at"""
            )
        ).mappings().all()
    questions = [dict(q) for q in questions]
    for q in questions:
        q["id"] = str(q["id"])

    results = []
    for q in questions:
        result = await _run_one(user, q)
        results.append(result)

    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    avg_correctness = sum(r["correctness"] for r in results) / total if total else 0.0
    by_route: dict[str, dict] = {}
    for q, r in zip(questions, results, strict=True):
        route = q["expected_route"]
        by_route.setdefault(route, {"total": 0, "passed": 0})
        by_route[route]["total"] += 1
        by_route[route]["passed"] += 1 if r["passed"] else 0

    summary = {
        "total": total, "passed": passed, "pass_rate": round(passed / total, 4) if total else 0.0,
        "avg_correctness": round(avg_correctness, 4), "by_route": by_route,
    }

    eval_run_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO eval_runs (id, summary) VALUES (:id, :summary)"),
            {"id": eval_run_id, "summary": json.dumps(summary)},
        )
        conn.execute(
            text(
                """INSERT INTO eval_results (eval_run_id, question_id, actual_route, correctness, passed, details)
                   VALUES (:eval_run_id, :question_id, :actual_route, :correctness, :passed, :details)"""
            ),
            [
                {
                    "eval_run_id": eval_run_id, "question_id": r["question_id"], "actual_route": r["actual_route"],
                    "correctness": r["correctness"], "passed": r["passed"], "details": json.dumps(r["details"]),
                }
                for r in results
            ],
        )

    return {"eval_run_id": eval_run_id, "summary": summary}


def get_user_by_email(email: str) -> dict | None:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, name, email, role, department, title, manager_id FROM users WHERE email = :email"),
            {"email": email},
        ).mappings().first()
    return dict(row) if row else None


async def run_eval_async() -> dict:
    return await _run_eval_async()


def run_eval() -> dict:
    result = asyncio.run(_run_eval_async())
    print(
        f"[eval] {result['summary']['passed']}/{result['summary']['total']} passed "
        f"(pass_rate={result['summary']['pass_rate']}, avg_correctness={result['summary']['avg_correctness']})"
    )
    for route, stats in result["summary"]["by_route"].items():
        print(f"  {route}: {stats['passed']}/{stats['total']}")
    return result
