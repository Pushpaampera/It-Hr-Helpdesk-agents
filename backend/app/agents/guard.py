"""Gus, the Privacy Guardian — no LLM, pure rules. Runs before any other agent sees the
message. Blocks requests for another person's personal/payroll data unless the requester is
HR/admin, blocks bulk personal-data dumps even for HR, flags prompt-injection patterns, and
logs every block to audit_log.
"""
import re

from app.mock_apis import log_action
from app.mock_apis.directory import all_user_first_names

SENSITIVE_KEYWORDS = [
    "payslip", "pay slip", "salary", "compensation", "bank account", "bank details",
    "home address", "personal info", "personal information", "social security", "ssn",
    "leave balance", "leave history", "sick leave history",
]

BULK_PATTERNS = [
    re.compile(r"\beveryone'?s?\b", re.IGNORECASE),
    re.compile(r"\ball employees?\b", re.IGNORECASE),
    re.compile(r"\bwhole team'?s?\b", re.IGNORECASE),
    re.compile(r"\bentire team\b", re.IGNORECASE),
    re.compile(r"\bthe engineering team\b", re.IGNORECASE),
]

INJECTION_PATTERNS = [
    re.compile(r"ignore (all |your )?(previous|prior|above) instructions", re.IGNORECASE),
    re.compile(r"pretend (you'?re|to be|you are)", re.IGNORECASE),
    re.compile(r"disregard (the |your )?(system|above|previous)", re.IGNORECASE),
    re.compile(r"act as (an? )?(admin|administrator|system)", re.IGNORECASE),
    re.compile(r"you are now (an? )?admin", re.IGNORECASE),
    re.compile(r"bypass (the )?(rules|restrictions|access control)", re.IGNORECASE),
]

def _mentions_someone_else(query: str, requester_id: str, requester_name: str) -> str | None:
    """Returns the mentioned person's name if the query references a different employee by name."""
    requester_first = requester_name.split()[0].lower()
    for name, uid in all_user_first_names(exclude_user_id=requester_id):
        first = name.split()[0]
        if first.lower() == requester_first:
            continue
        # Match "Priya" or "Priya's" as a whole word, case-sensitive-ish on the capitalized name.
        if re.search(rf"\b{re.escape(first)}'?s?\b", query, re.IGNORECASE):
            return name
    return None


def check(query: str, requester: dict) -> dict:
    """requester: {'id', 'name', 'role'}. Returns {'blocked': bool, 'reason': str | None}."""
    for pattern in INJECTION_PATTERNS:
        if pattern.search(query):
            reason = "it looked like an attempt to bypass normal access rules."
            log_action(requester["id"], "guard_blocked", "message", None,
                       {"query": query, "reason": "prompt_injection"})
            return {"blocked": True, "reason": reason}

    is_sensitive = any(kw in query.lower() for kw in SENSITIVE_KEYWORDS)
    if not is_sensitive:
        return {"blocked": False, "reason": None}

    is_bulk = any(p.search(query) for p in BULK_PATTERNS)
    if is_bulk and requester["role"] != "admin":
        reason = "it asked for sensitive data about many people at once."
        log_action(requester["id"], "guard_blocked", "message", None,
                   {"query": query, "reason": "bulk_personal_data"})
        return {"blocked": True, "reason": reason}

    if requester["role"] in ("hr", "admin"):
        return {"blocked": False, "reason": None}

    other_person = _mentions_someone_else(query, requester["id"], requester["name"])
    if other_person:
        reason = f"it asked for someone else's ({other_person}) private data."
        log_action(requester["id"], "guard_blocked", "message", None,
                   {"query": query, "reason": "cross_user_data", "target": other_person})
        return {"blocked": True, "reason": reason}

    return {"blocked": False, "reason": None}
