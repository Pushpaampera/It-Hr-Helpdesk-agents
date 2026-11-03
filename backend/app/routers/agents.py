"""GET /api/agents/status (per-agent activity summary) and GET /api/agents/live — the always-
on, aggregated SSE stream of every user's agent_events mentioned in docs/01_ARCHITECTURE.md.
Non-admin viewers get an anonymised feed (no requester name/user_id)."""
import asyncio
import json

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.agents.events import AGENT_JOBS, FRIENDLY_NAMES
from app.db import get_db, get_engine
from app.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/agents", tags=["agents"])

POLL_INTERVAL_SECONDS = 1.0


@router.get("/status")
def status(db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """SELECT agent, count(*) AS events_24h, avg(latency_ms) AS avg_latency_ms,
                   count(*) FILTER (WHERE status = 'error') AS errors_24h
               FROM agent_events WHERE ts >= now() - interval '24 hours'
               GROUP BY agent"""
        )
    ).mappings().all()
    by_agent = {r["agent"]: r for r in rows}
    return [
        {
            "agent": agent, "name": FRIENDLY_NAMES[agent], "job": AGENT_JOBS[agent],
            "events_24h": int(by_agent.get(agent, {}).get("events_24h", 0) or 0),
            "avg_latency_ms": round(by_agent.get(agent, {}).get("avg_latency_ms") or 0, 1),
            "errors_24h": int(by_agent.get(agent, {}).get("errors_24h", 0) or 0),
        }
        for agent in FRIENDLY_NAMES
    ]


@router.get("/live")
async def live(current_user: User = Depends(get_current_user)):
    is_admin = current_user.role == "admin"

    async def event_generator():
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("SELECT COALESCE(max(ts), now()) AS m FROM agent_events")).mappings().first()
        last_ts = row["m"]
        while True:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            with engine.connect() as conn:
                if is_admin:
                    rows = conn.execute(
                        text(
                            """SELECT e.run_id, e.seq, e.agent, e.status, e.action, e.caption, e.detail,
                                   e.model, e.latency_ms, e.ts, r.user_id, u.name AS user_name
                               FROM agent_events e
                               JOIN agent_runs r ON r.id = e.run_id
                               JOIN users u ON u.id = r.user_id
                               WHERE e.ts > :last_ts ORDER BY e.ts"""
                        ),
                        {"last_ts": last_ts},
                    ).mappings().all()
                else:
                    rows = conn.execute(
                        text(
                            """SELECT e.run_id, e.seq, e.agent, e.status, e.action, e.caption, e.detail,
                                   e.model, e.latency_ms, e.ts
                               FROM agent_events e WHERE e.ts > :last_ts ORDER BY e.ts"""
                        ),
                        {"last_ts": last_ts},
                    ).mappings().all()
            for r in rows:
                last_ts = r["ts"]
                payload = {
                    "run_id": str(r["run_id"]), "seq": r["seq"], "agent": r["agent"], "status": r["status"],
                    "action": r["action"], "caption": r["caption"], "detail": r["detail"], "model": r["model"],
                    "latency_ms": r["latency_ms"], "ts": r["ts"].isoformat(),
                }
                if is_admin:
                    payload["user_id"] = str(r["user_id"])
                    payload["user_name"] = r["user_name"]
                yield {"event": "agent_event", "data": json.dumps(payload)}

    return EventSourceResponse(event_generator())
