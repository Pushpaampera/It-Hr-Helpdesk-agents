"""POST /api/feedback — submits a rating for a run; Finn computes the LinUCB reward and
updates the bandit. Phase 4: the caller must be the run's own user (or admin)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.agents.feedback import submit_feedback
from app.agents.runs_store import get_run
from app.deps import ensure_self_or_roles, get_current_user
from app.models.user import User

router = APIRouter(prefix="/api", tags=["feedback"])


class FeedbackRequest(BaseModel):
    run_id: str
    rating: int
    resolved: bool
    comment: str | None = None


@router.post("/feedback")
def post_feedback(req: FeedbackRequest, current_user: User = Depends(get_current_user)):
    if not (1 <= req.rating <= 5):
        raise HTTPException(400, "rating must be between 1 and 5")
    run = get_run(req.run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    ensure_self_or_roles(current_user, run["user_id"], "admin")
    return submit_feedback(req.run_id, req.rating, req.resolved, req.comment)
