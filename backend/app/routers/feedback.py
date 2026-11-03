"""POST /api/feedback — submits a rating for a run; Finn computes the LinUCB reward and
updates the bandit."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.feedback import submit_feedback
from app.agents.runs_store import get_run

router = APIRouter(prefix="/api", tags=["feedback"])


class FeedbackRequest(BaseModel):
    run_id: str
    rating: int
    resolved: bool
    comment: str | None = None


@router.post("/feedback")
def post_feedback(req: FeedbackRequest):
    if not (1 <= req.rating <= 5):
        raise HTTPException(400, "rating must be between 1 and 5")
    if not get_run(req.run_id):
        raise HTTPException(404, "Run not found")
    return submit_feedback(req.run_id, req.rating, req.resolved, req.comment)
