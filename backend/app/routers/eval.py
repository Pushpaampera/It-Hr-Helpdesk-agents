"""POST /api/eval/run (trigger a golden-set run), GET /api/eval/runs (list past runs), and
GET /api/eval/runs/{id} (one run's full per-question breakdown, for the Evaluation page's
drill-down). Admin only."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_roles
from app.eval.run_eval import run_eval_async

router = APIRouter(prefix="/api/eval", tags=["eval"], dependencies=[Depends(require_roles("admin"))])


@router.post("/run")
async def trigger_eval():
    return await run_eval_async()


@router.get("/runs")
def list_eval_runs(db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT id, summary, created_at FROM eval_runs ORDER BY created_at DESC")
    ).mappings().all()
    return [{"id": str(r["id"]), "summary": r["summary"], "created_at": r["created_at"].isoformat()} for r in rows]


@router.get("/runs/{eval_run_id}")
def get_eval_run(eval_run_id: str, db: Session = Depends(get_db)):
    run = db.execute(
        text("SELECT id, summary, created_at FROM eval_runs WHERE id = :id"), {"id": eval_run_id}
    ).mappings().first()
    if not run:
        raise HTTPException(404, "Eval run not found")
    results = db.execute(
        text(
            """SELECT r.id, r.question_id, g.question, g.expected_route, r.actual_route,
                   r.correctness, r.passed, r.details
               FROM eval_results r JOIN golden_questions g ON g.id = r.question_id
               WHERE r.eval_run_id = :id ORDER BY g.created_at"""
        ),
        {"id": eval_run_id},
    ).mappings().all()
    return {
        "id": str(run["id"]), "summary": run["summary"], "created_at": run["created_at"].isoformat(),
        "results": [
            {
                "id": str(r["id"]), "question_id": str(r["question_id"]), "question": r["question"],
                "expected_route": r["expected_route"], "actual_route": r["actual_route"],
                "correctness": r["correctness"], "passed": r["passed"], "details": r["details"],
            }
            for r in results
        ],
    }
