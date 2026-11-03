"""POST /api/approvals/{id}/decide — resumes a paused agent run after a manager decides.

Phase 3 scope: no JWT auth wiring yet (Phase 4 adds the real approver-identity check via the
authenticated user instead of a body field).
"""
import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.graph import resume_after_approval
from app.mock_apis import approvals as approvals_api

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


class DecideRequest(BaseModel):
    decision: str  # "approved" | "rejected"
    comment: str | None = None
    approver_id: str


@router.post("/{approval_id}/decide")
async def decide_approval(approval_id: str, req: DecideRequest):
    if req.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be 'approved' or 'rejected'")

    approval = approvals_api.get(approval_id)
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval["status"] != "pending":
        raise HTTPException(409, f"Approval already {approval['status']}")

    result = approvals_api.decide(approval_id, req.decision, req.comment, req.approver_id)

    run_id = approval.get("run_id")
    if run_id:
        asyncio.create_task(resume_after_approval(str(run_id), req.decision == "approved"))

    return result
