"""POST /api/admin/reset-demo — puts the small hand-written demo data back (same as `poetry run
reset-demo`: 6 people and their history; the knowledge base is kept). Admin only. Phase 10B (the
showcase confirmation-modal/progress-animation UI around this) was explicitly skipped by the
operator; this endpoint stays unused by the frontend for now.

GET /api/admin/audit-log (Phase 11) — the real audit_log table (every mock-API call and
approval/leave decision already writes to it via app/mock_apis/__init__.py::log_action), for
the Audit Log page. Admin only.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_roles
from app.seed.seed import reset_and_reseed

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_roles("admin"))])


@router.post("/reset-demo")
def reset_demo():
    reset_and_reseed()
    return {"success": True, "message": "Demo data has been reset and reseeded."}


@router.get("/audit-log")
def list_audit_log(
    action: str | None = None, actor_id: str | None = None, limit: int = 100,
    db: Session = Depends(get_db),
):
    where = []
    params: dict = {"limit": limit}
    if action:
        where.append("a.action = :action")
        params["action"] = action
    if actor_id:
        where.append("a.actor_id = :actor_id")
        params["actor_id"] = actor_id
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    rows = db.execute(
        text(
            f"""SELECT a.id, a.actor_id, u.name AS actor_name, a.action, a.target_type, a.target_id,
                   a.detail, a.ts
               FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
               {clause} ORDER BY a.ts DESC LIMIT :limit"""
        ),
        params,
    ).mappings().all()
    return [
        {
            "id": str(r["id"]), "actor_id": str(r["actor_id"]) if r["actor_id"] else None,
            "actor_name": r["actor_name"], "action": r["action"], "target_type": r["target_type"],
            "target_id": r["target_id"], "detail": r["detail"], "ts": r["ts"].isoformat(),
        }
        for r in rows
    ]


@router.get("/audit-log/actions")
def list_audit_log_actions(db: Session = Depends(get_db)):
    """Distinct action names seen so far, to populate the Audit Log page's filter dropdown
    without hardcoding a list that would drift from what log_action() callers actually use."""
    rows = db.execute(text("SELECT DISTINCT action FROM audit_log ORDER BY action")).all()
    return [r[0] for r in rows]
