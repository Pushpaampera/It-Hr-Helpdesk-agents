"""POST /api/eval/run (trigger a golden-set run) and GET /api/eval/runs (list past runs).
Admin only."""
from fastapi import APIRouter, Depends
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
    rows = db.execute(text("SELECT id, summary, created_at FROM eval_runs ORDER BY created_at DESC")).mappings().all()
    return [dict(r) for r in rows]
