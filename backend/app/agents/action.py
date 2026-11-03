"""Atlas, the Task Doer. Groq gpt-oss-20b with tool calling. request_access pauses the graph
(via a LangGraph NodeInterrupt) pending the requester's manager's approval."""
import re
from datetime import date, timedelta

from app.agents.llm import call_groq_tools
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
        "name": "apply_leave", "description": "Applies for a leave of absence for the employee.",
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

LEAVE_TYPE_WORDS = {"annual": "annual", "vacation": "annual", "sick": "sick", "casual": "casual", "parental": "parental"}


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
    if "leave" in q and any(w in q for w in ("apply", "book", "request", "take")):
        leave_type = next((v for k, v in LEAVE_TYPE_WORDS.items() if k in q), "annual")
        start, end, _ = _resolve_relative_date(query)
        return {"name": "apply_leave", "arguments": {
            "leave_type": leave_type, "start_date": start.isoformat(), "end_date": end.isoformat(),
            "reason": "Requested via the AI Assistant.",
        }}
    return None


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
        return {**base, "tool": name, "args": args, "result": result, "paused": False,
                "message": f"Your {result['leave_type']} leave request for {result['days']} day(s) has been submitted and approved."}

    if name == "request_access":
        result = it_system.request_access(
            user_id, args["system"], args.get("access_level", "read"),
            args.get("justification", "Requested via the AI Assistant."), run_id=run_id,
        )
        if not result.get("success"):
            return {**base, "tool": name, "args": args, "result": result, "paused": False,
                    "message": result.get("message", "Could not submit the access request.")}
        return {**base, "tool": name, "args": args, "result": result, "paused": True,
                "message": f"Your request for {args['system']} access is waiting on {result['approver_name']}'s approval."}

    return {**base, "tool": name, "args": args, "result": None, "paused": False,
            "message": "Action not recognized."}
