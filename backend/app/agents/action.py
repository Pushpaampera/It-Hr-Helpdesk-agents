"""Atlas, the Task Doer. Groq gpt-oss-20b with tool calling. request_access pauses the graph
(via a LangGraph NodeInterrupt) pending the requester's manager's approval."""
import asyncio
import re
from datetime import date, timedelta

from app.agents.llm import call_groq_tools
from app.agents.supervisor import LEAVE_REQUEST
from app.config import get_settings
from app.mock_apis import hr_system, it_system

settings = get_settings()

SYSTEM_PROMPT = """You are Atlas, a careful IT/HR operations assistant. Given an employee's
request, call exactly one tool that fulfills it. Only call request_access if the employee is
asking for access to a system; it always requires manager approval, so explain that in your
reasoning. Never fabricate dates — if a date is relative ("next week"), resolve it to an actual
date based on today."""

TOOLS = [
    {"type": "function", "function": {
        "name": "reset_password", "description": "Resets the employee's own password.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    }},
    {"type": "function", "function": {
        "name": "unlock_account", "description": "Unlocks the employee's own account.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    }},
    {"type": "function", "function": {
        "name": "request_access",
        "description": "Requests access to a system for the employee; always needs manager approval.",
        "parameters": {
            "type": "object",
            "properties": {
                "system": {"type": "string", "description": "The system name, e.g. 'Finance System'"},
                "access_level": {"type": "string", "enum": ["read", "write", "admin"]},
                "justification": {"type": "string"},
            },
            "required": ["system", "access_level", "justification"],
        },
    }},
    {"type": "function", "function": {
        "name": "apply_leave", "description": "Submits a leave request for the employee; HR approves or rejects it.",
        "parameters": {
            "type": "object",
            "properties": {
                "leave_type": {"type": "string", "enum": ["annual", "sick", "casual", "parental"]},
                "start_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                "reason": {"type": "string"},
            },
            "required": ["leave_type", "start_date", "end_date"],
        },
    }},
    {"type": "function", "function": {
        "name": "get_leave_balance", "description": "Looks up the employee's own leave balance.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    }},
]

LEAVE_TYPE_WORDS = {"annual": "annual", "vacation": "annual", "holiday": "annual", "sick": "sick", "casual": "casual", "parental": "parental"}


def _resolve_relative_date(query: str) -> tuple[date, date, int]:
    today = date.today()
    days_match = re.search(r"(\d+)\s*day", query, re.IGNORECASE)
    n_days = int(days_match.group(1)) if days_match else 1

    if re.search(r"next week", query, re.IGNORECASE):
        start = today + timedelta(days=(7 - today.weekday()))
    elif re.search(r"tomorrow", query, re.IGNORECASE):
        start = today + timedelta(days=1)
    else:
        start = today + timedelta(days=3)
    end = start + timedelta(days=n_days - 1)
    return start, end, n_days


def _mock_tool_call(query: str) -> dict | None:
    q = query.lower()
    if "unlock" in q:
        return {"name": "unlock_account", "arguments": {}}
    if "password" in q and ("reset" in q or "forgot" in q):
        return {"name": "reset_password", "arguments": {}}
    if "access" in q:
        system_match = re.search(r"access to (?:the )?([A-Za-z0-9 ]+?)(?:\s+system)?[.\s]*$", query, re.IGNORECASE)
        system = (system_match.group(1).strip().title() + " System") if system_match else "the requested system"
        level = "admin" if "admin" in q else "write" if "write" in q else "read"
        return {"name": "request_access", "arguments": {
            "system": system, "access_level": level, "justification": "Requested via the AI Assistant.",
        }}
    if "balance" in q and "leave" in q:
        return {"name": "get_leave_balance", "arguments": {}}
    if ("leave" in q and any(w in q for w in ("apply", "book", "request", "take"))) or LEAVE_REQUEST.search(query):
        leave_type = next((v for k, v in LEAVE_TYPE_WORDS.items() if k in q), "annual")
        start, end, _ = _resolve_relative_date(query)
        return {"name": "apply_leave", "arguments": {
            "leave_type": leave_type, "start_date": start.isoformat(), "end_date": end.isoformat(),
            "reason": "Requested via the AI Assistant.",
        }}
    return None


def _days(n: float) -> str:
    n = int(n) if float(n).is_integer() else n
    return f"{n} day" if n == 1 else f"{n} days"


def _dates(start: str, end: str) -> str:
    from datetime import date

    s, e = date.fromisoformat(start), date.fromisoformat(end)
    fmt = lambda d: f"{d.day} {d.strftime('%b %Y')}"  # noqa: E731
    return fmt(s) if s == e else f"{fmt(s)} to {fmt(e)}"


def _announce_leave_request(user_id: str, result: dict) -> None:
    """Tells the employee (in-app) and every HR person (in-app + email) about a new leave request,
    off the event loop so a slow mail server never delays the chat reply."""
    from app.notify import notify, notify_role
    from app.mock_apis.directory import get_user

    employee = get_user(user_id) or {"name": "An employee"}
    leave = f"{result['leave_type']} leave, {_days(result['days'])} ({_dates(result['start_date'], result['end_date'])})"

    def send() -> None:
        notify(user_id, "leave_submitted", "Leave request sent to HR",
               f"Your {leave} is waiting for HR's approval.", link=None, email=False)
        notify_role("hr", "leave_pending", f"New leave request from {employee['name']}",
                    f"{employee['name']} has asked for {leave}. Please approve or reject it on the HR Dashboard.",
                    link="/app/hr-insights")

    asyncio.get_running_loop().run_in_executor(None, send)


def _announce_access_request(user_id: str, approver_id: str, system: str, level: str) -> None:
    """Tells the approving manager (in-app + email) that a request is waiting for them."""
    from app.notify import notify
    from app.mock_apis.directory import get_user

    employee = get_user(user_id) or {"name": "An employee"}

    def send() -> None:
        notify(approver_id, "approval_pending", f"{employee['name']} needs your approval",
               f"{employee['name']} has asked for {level} access to {system}. Please approve or reject it in Approvals.",
               link="/app/approvals")

    asyncio.get_running_loop().run_in_executor(None, send)


async def decide_and_execute(query: str, user_id: str, run_id: str) -> dict:
    mock_call = _mock_tool_call(query)
    tool_call, llm_result = await call_groq_tools(SYSTEM_PROMPT, query, settings.GROQ_ACTION_MODEL, TOOLS, mock_call)

    base = {"tokens_in": llm_result.tokens_in, "tokens_out": llm_result.tokens_out,
            "latency_ms": llm_result.latency_ms, "model": llm_result.model}

    if not tool_call:
        return {**base, "tool": None, "message": "I couldn't determine a specific action to take.", "paused": False}

    name = tool_call["name"]
    args = tool_call.get("arguments", {})

    if name == "reset_password":
        result = it_system.reset_password(user_id)
        return {**base, "tool": name, "args": args, "result": result, "paused": False,
                "message": result["message"]}

    if name == "unlock_account":
        result = it_system.unlock_account(user_id)
        return {**base, "tool": name, "args": args, "result": result, "paused": False,
                "message": result["message"]}

    if name == "get_leave_balance":
        balances = hr_system.get_leave_balances(user_id)
        lines = [f"{b['leave_type'].title()}: {b['remaining_days']}/{b['total_days']} days" for b in balances]
        return {**base, "tool": name, "args": args, "result": {"balances": balances}, "paused": False,
                "message": "Here's your leave balance:\n" + "\n".join(lines)}

    if name == "apply_leave":
        result = hr_system.apply_leave(
            user_id, args.get("leave_type", "annual"), args["start_date"], args["end_date"],
            args.get("reason", "Requested via the AI Assistant."),
        )
        _announce_leave_request(user_id, result)
        return {**base, "tool": name, "args": args, "result": result, "paused": False,
                "message": f"Your {result['leave_type']} leave request for {_days(result['days'])} "
                           f"({_dates(result['start_date'], result['end_date'])}) has been sent to HR for approval. "
                           "You'll get a notification here and an email as soon as HR decides."}

    if name == "request_access":
        result = it_system.request_access(
            user_id, args["system"], args.get("access_level", "read"),
            args.get("justification", "Requested via the AI Assistant."), run_id=run_id,
        )
        if not result.get("success"):
            return {**base, "tool": name, "args": args, "result": result, "paused": False,
                    "message": result.get("message", "Could not submit the access request.")}
        _announce_access_request(user_id, result["approver_id"], args["system"], args.get("access_level", "read"))
        return {**base, "tool": name, "args": args, "result": result, "paused": True,
                "message": f"Your request for {args['system']} access is waiting on {result['approver_name']}'s approval. "
                           "You'll get a notification here and an email when they decide."}

    return {**base, "tool": name, "args": args, "result": None, "paused": False,
            "message": "Action not recognized."}
