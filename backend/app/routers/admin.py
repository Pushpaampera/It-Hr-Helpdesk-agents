"""POST /api/admin/reset-demo — wipes and reseeds all demo data. Admin only. The full "reset
demo" showcase control (confirmation modal, progress animation) is built in Phase 10B; this is
its backend."""
from fastapi import APIRouter, Depends

from app.deps import require_roles
from app.seed.seed import reset_and_reseed

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_roles("admin"))])


@router.post("/reset-demo")
def reset_demo():
    reset_and_reseed()
    return {"success": True, "message": "Demo data has been reset and reseeded."}
