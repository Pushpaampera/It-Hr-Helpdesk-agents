from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import check_db_connection
from app.routers import approvals, chat, feedback

settings = get_settings()

app = FastAPI(title="Helpdesk AI Agents API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN] if settings.FRONTEND_ORIGIN else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(approvals.router)
app.include_router(feedback.router)


@app.get("/api/health")
def health() -> dict:
    db_ok, db_msg = (False, "DATABASE_URL not set")
    if settings.DATABASE_URL:
        db_ok, db_msg = check_db_connection()

    pgvector_ok = False
    pgvector_msg = "not checked"
    if db_ok:
        try:
            from sqlalchemy import text

            from app.db import get_engine

            with get_engine().connect() as conn:
                row = conn.execute(
                    text("SELECT extname FROM pg_extension WHERE extname = 'vector'")
                ).fetchone()
                pgvector_ok = row is not None
                pgvector_msg = "enabled" if pgvector_ok else "extension not found"
        except Exception as exc:  # noqa: BLE001
            pgvector_msg = str(exc)

    return {
        "status": "ok" if db_ok else "degraded",
        "service": "helpdesk-ai-agents-backend",
        "mock_mode": settings.LLM_MOCK_MODE,
        "database": {"connected": db_ok, "detail": db_msg},
        "pgvector": {"enabled": pgvector_ok, "detail": pgvector_msg},
    }
