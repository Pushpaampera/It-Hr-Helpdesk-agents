"""GET /api/approvals (list pending) and POST /api/approvals/{id}/decide — resumes a paused
agent run after a manager decides.

Phase 4: the approver identity comes from the JWT (must be the approval's own approver_id, or
an admin standing in), not a body field.
"""
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.agents.graph import resume_after_approval
from app.db import get_db
from app.deps import get_current_user
from app.mock_apis import approvals as approvals_api
from app.models.user import User
from app.notify import notify, notify_after_undo_window

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
    approval_id: str, req: DecideRequest, background: BackgroundTasks, current_user: User = Depends(get_current_user)
):
    if req.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be 'approved' or 'rejected'")
    if req.decision == "rejected" and not (req.comment or "").strip():
        raise HTTPException(400, "A reason is required to reject a request")

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

    decided_at = (approvals_api.get(approval_id) or {}).get("decided_at")
    background.add_task(
        notify_after_undo_window,
        lambda: _still_decided(approval_id, req.decision, decided_at),
        lambda: _tell_requester(approval, req.decision, (req.comment or "").strip() or None, current_user.name),
    )
    return result


def _still_decided(approval_id: str, decision: str, decided_at) -> bool:
    row = approvals_api.get(approval_id)
    return bool(row) and row["status"] == decision and row["decided_at"] == decided_at


def _tell_requester(approval: dict, decision: str, comment: str | None, approver_name: str) -> None:
    payload = approval.get("payload") or {}
    what = f"{payload.get('access_level', '')} access to {payload['system']}".strip() if payload.get("system") else "your request"
    if decision == "approved":
        title = "Your request has been approved"
        body = f"{approver_name} approved {what}."
        if comment:
            body += f"\nNote: {comment}"
    else:
        title = "Your request was not approved"
        body = f"{approver_name} rejected {what}.\nReason: {comment}"
    notify(str(approval["requester_id"]), f"approval_{decision}", title, body, important=True)


@router.post("/{approval_id}/undo")
async def undo_approval(approval_id: str, current_user: User = Depends(get_current_user)):
    """Reverts a just-decided approval back to pending, within a 5-second window. Does not
    re-pause the LangGraph run that already resumed off this decision — see
    app/mock_apis/approvals.py::undo for the scope boundary."""
    approval = approvals_api.get(approval_id)
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval["status"] not in ("approved", "rejected"):
        raise HTTPException(409, "This approval hasn't been decided yet")
    if str(approval["approver_id"]) != str(current_user.id) and current_user.role != "admin":
        raise HTTPException(403, "Only the assigned approver (or an admin) can undo this")

    decided_at = approval.get("decided_at")
    if decided_at is None:
        raise HTTPException(409, "No decision timestamp on record")
    decided_at_aware = decided_at if decided_at.tzinfo else decided_at.replace(tzinfo=timezone.utc)
    if (datetime.now(timezone.utc) - decided_at_aware).total_seconds() > 5:
        raise HTTPException(409, "The undo window has expired")

    return approvals_api.undo(approval_id)
