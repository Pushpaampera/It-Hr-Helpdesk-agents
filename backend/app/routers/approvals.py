"""GET /api/approvals (list pending) and POST /api/approvals/{id}/decide — resumes a paused
agent run after a manager decides.

Phase 4: the approver identity comes from the JWT (must be the approval's own approver_id, or
an admin standing in), not a body field.
"""
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.agents.graph import resume_after_approval
from app.db import get_db
from app.deps import get_current_user
from app.mock_apis import approvals as approvals_api
from app.models.user import User

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


class DecideRequest(BaseModel):
    decision: str  # "approved" | "rejected"
    comment: str | None = None


@router.get("")
def list_approvals(
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Approvals addressed to the current user (their own requests to approve). Admins see
    every pending approval, which is what the demo's Approval Center shows an admin."""
    params: dict = {}
    where = []
    if current_user.role == "admin":
        pass
    else:
        where.append("approver_id = :approver_id")
        params["approver_id"] = str(current_user.id)
    if status:
        where.append("status = :status")
        params["status"] = status
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    rows = db.execute(
        text(
            f"""SELECT a.id, a.run_id, a.requester_id, r.name AS requester_name, a.approver_id,
                   a.type, a.payload, a.status, a.comment, a.decided_at, a.created_at
               FROM approvals a JOIN users r ON r.id = a.requester_id
               {clause} ORDER BY a.created_at DESC"""
        ),
        params,
    ).mappings().all()
    return [dict(row) for row in rows]


@router.post("/{approval_id}/decide")
async def decide_approval(
    approval_id: str, req: DecideRequest, current_user: User = Depends(get_current_user)
):
    if req.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be 'approved' or 'rejected'")

    approval = approvals_api.get(approval_id)
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval["status"] != "pending":
        raise HTTPException(409, f"Approval already {approval['status']}")
    if str(approval["approver_id"]) != str(current_user.id) and current_user.role != "admin":
        raise HTTPException(403, "Only the assigned approver (or an admin) can decide this")

    result = approvals_api.decide(approval_id, req.decision, req.comment, str(current_user.id))

    run_id = approval.get("run_id")
    if run_id:
        asyncio.create_task(resume_after_approval(str(run_id), req.decision == "approved"))

    return result
