"""Mock IT system API: password reset, account unlock, access requests (which create a pending
approval addressed to the requester's manager)."""
import uuid

from sqlalchemy import text

from app.db import get_engine
from app.mock_apis import log_action
from app.mock_apis.directory import get_manager


def reset_password(user_id: str) -> dict:
    log_action(user_id, "reset_password", "user", user_id, {})
    return {"success": True, "message": "Password reset. A temporary password has been sent to your registered device."}


def unlock_account(user_id: str) -> dict:
    log_action(user_id, "unlock_account", "user", user_id, {})
    return {"success": True, "message": "Account unlocked."}


def request_access(user_id: str, system: str, access_level: str, justification: str, run_id: str | None = None) -> dict:
    manager = get_manager(user_id)
    if not manager:
        return {"success": False, "message": "No manager on file to approve this request."}

    approval_id = str(uuid.uuid4())
    engine = get_engine()
    with engine.begin() as conn:
        import json

        conn.execute(
            text(
                """INSERT INTO approvals (id, run_id, requester_id, approver_id, type, payload, status)
                   VALUES (:id, :run_id, :requester_id, :approver_id, 'access_request', :payload, 'pending')"""
            ),
            {"id": approval_id, "run_id": run_id, "requester_id": user_id, "approver_id": manager["id"],
             "payload": json.dumps({"system": system, "access_level": access_level, "justification": justification})},
        )
        conn.execute(
            text(
                """INSERT INTO access_requests (user_id, system, access_level, justification, status, approval_id)
                   VALUES (:uid, :system, :level, :justification, 'pending', :approval_id)"""
            ),
            {"uid": user_id, "system": system, "level": access_level, "justification": justification,
             "approval_id": approval_id},
        )
    log_action(user_id, "request_access", "approval", approval_id, {"system": system, "access_level": access_level})
    return {"success": True, "approval_id": approval_id, "approver_id": str(manager["id"]), "approver_name": manager["name"]}
