"""Sage, the Request Router. Groq llama-3.1-8b-instant, strict JSON output. Routes to OTHER
and asks a clarifying question if confidence is below 0.55."""
import json
import re

from app.agents.llm import call_groq_json, is_mock_mode
from app.config import get_settings

settings = get_settings()

SYSTEM_PROMPT = """You are Sage, a request routing classifier for an enterprise IT/HR helpdesk.
Given an employee's message, decide which specialist should handle it.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"route": "IT"|"HR"|"OTHER", "confidence": <float 0-1>, "needs_action": <bool>, "vague": <bool>, "intent": "<short phrase>"}

Routing guide:
- IT: laptops, VPN, Wi-Fi, email/Outlook, MFA, printers, software, passwords, SSO, remote
  desktop, backups, phishing/security.
- HR: leave, payroll, payslips, tax, benefits, insurance, travel, work from home, onboarding,
  performance reviews.
- OTHER: anything unclear, off-topic, or that doesn't fit IT or HR.

needs_action is true only if the user is asking to DO something (reset a password, apply for
leave, request access, unlock an account) rather than just asking a question. Plain wishes count
as requests: "I want a leave", "I need 2 days off tomorrow" -> needs_action true; "how much leave
can I carry forward?" -> false.
vague is true only when the message says something is wrong (or asks about a topic) but gives
no symptom or detail to act on, so any answer would be a guess: "I have an issue with my laptop
can you check what it is", "my computer has a problem", "question about my pay" -> true.
"my laptop is very slow", "laptop won't turn on", "VPN error 619", "how many sick days do I get?",
"I want a leave" -> false.
If you are not confident (below 0.55), set route to OTHER."""

IT_KEYWORDS = {
    "vpn", "laptop", "wifi", "wi-fi", "email", "outlook", "mfa", "printer", "password",
    "software", "sso", "login", "log in", "rdp", "remote desktop", "backup", "onedrive",
    "phishing", "virus", "error", "blue screen", "monitor", "docking", "keyboard", "account locked",
    "access", "unlock", "system", "computer", "desktop", "hardware",
}
HR_KEYWORDS = {
    "leave", "payroll", "payslip", "pay slip", "salary", "tax", "benefits", "insurance",
    "travel", "reimbursement", "work from home", "onboarding", "performance review", "sick",
    "casual", "parental", "annual leave", "bonus", "compensation", "day off", "days off", "time off",
    "holiday", "vacation",
}
ACTION_VERBS = {"reset", "apply", "request", "unlock", "submit", "book", "cancel"}
# Everyday ways of asking for time off ("I want a leave", "I need 2 days off", "can I take sick
# leave tomorrow"), as opposed to questions about leave ("how does leave carry forward?").
LEAVE_REQUEST = re.compile(
    r"^(?!\s*(?:how|what|why|which|where|who|is|are|does|do)\b)"
    r".*\b(?:want|need|would like|like to|take|taking|get|have|apply|book|request)\b"
    r".*\b(?:leave|day off|days off|time off|holiday|vacation)\b",
    re.IGNORECASE,
)
ACTION_PHRASES = [
    LEAVE_REQUEST,
    re.compile(r"\bneed(?:s)? access\b", re.IGNORECASE),
    re.compile(r"\bwant access\b", re.IGNORECASE),
    re.compile(r"\bgrant (?:me )?access\b", re.IGNORECASE),
]


def _mock_route(query: str) -> dict:
    q = query.lower()
    it_hits = sum(1 for kw in IT_KEYWORDS if kw in q)
    hr_hits = sum(1 for kw in HR_KEYWORDS if kw in q)
    needs_action = any(re.search(rf"\b{v}\b", q) for v in ACTION_VERBS) or any(p.search(q) for p in ACTION_PHRASES)

    if it_hits == 0 and hr_hits == 0:
        return {"route": "OTHER", "confidence": 0.4, "needs_action": False, "intent": "unclear"}

    if it_hits >= hr_hits:
        confidence = min(0.6 + 0.1 * it_hits, 0.97)
        return {"route": "IT", "confidence": round(confidence, 2), "needs_action": needs_action, "intent": "IT support request"}

    confidence = min(0.6 + 0.1 * hr_hits, 0.97)
    return {"route": "HR", "confidence": round(confidence, 2), "needs_action": needs_action, "intent": "HR policy question"}


async def route(query: str) -> dict:
    mock = _mock_route(query)
    if is_mock_mode():
        result = await call_groq_json(SYSTEM_PROMPT, query, settings.GROQ_SUPERVISOR_MODEL, json.dumps(mock))
        parsed = mock
    else:
        result = await call_groq_json(SYSTEM_PROMPT, query, settings.GROQ_SUPERVISOR_MODEL, json.dumps(mock))
        try:
            parsed = json.loads(result.text)
            assert parsed.get("route") in ("IT", "HR", "OTHER")
        except Exception:  # noqa: BLE001
            parsed = mock

    if parsed.get("confidence", 0) < 0.55:
        parsed["route"] = "OTHER"

    return {
        "route": parsed["route"], "confidence": float(parsed.get("confidence", 0.5)),
        "needs_action": bool(parsed.get("needs_action", False)), "intent": parsed.get("intent", ""),
        # Only meaningful from a real model; mock routing leaves it to clarify.find_vague_subject.
        "vague": bool(parsed.get("vague", False)) and not is_mock_mode(),
        "tokens_in": result.tokens_in, "tokens_out": result.tokens_out,
        "latency_ms": result.latency_ms, "model": result.model,
    }
