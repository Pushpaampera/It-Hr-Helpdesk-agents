import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

from app.config import get_settings
from app.db import check_db_connection
from app.routers import (
    admin,
    agents,
    analytics,
    approvals,
    auth,
    bandit,
    chat,
    conversations,
    costs,
    eval as eval_router,
    feedback,
    kb,
    tickets,
)

settings = get_settings()

app = FastAPI(title="Helpdesk AI Agents API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN] if settings.FRONTEND_ORIGIN else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REQUEST_COUNT = Counter(
    "helpdesk_http_requests_total", "HTTP requests", ["method", "path", "status_code"]
)
REQUEST_LATENCY = Histogram(
    "helpdesk_http_request_latency_seconds", "HTTP request latency", ["method", "path"]
)


@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    REQUEST_COUNT.labels(request.method, path, response.status_code).inc()
    REQUEST_LATENCY.labels(request.method, path).observe(time.perf_counter() - start)
    return response


app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(approvals.router)
app.include_router(feedback.router)
app.include_router(conversations.router)
app.include_router(tickets.router)
app.include_router(kb.router)
app.include_router(analytics.router)
app.include_router(agents.router)
app.include_router(bandit.router)
app.include_router(eval_router.router)
app.include_router(admin.router)
app.include_router(costs.router)


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


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
