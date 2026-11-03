"""Hana, the HR Policy Expert. Gemini Flash-Lite, retrieves from kb_chunks where dept=HR.
Also reads the requester's own leave_balances via the HR mock API when asked about a balance."""
import re

from app.agents.knowledge_agent import answer_from_knowledge
from app.config import get_settings
from app.mock_apis.hr_system import get_leave_balances

settings = get_settings()

SYSTEM_PROMPT = """You are Hana, a friendly and precise HR policy expert at a company helpdesk.
You answer employee questions about leave, payroll, payslips, tax, benefits, insurance, travel,
work from home, onboarding, and performance reviews — using only the knowledge base excerpts
provided to you. Keep answers concise (under 150 words), warm but professional. Never invent
information not in the excerpts, and never disclose figures about anyone other than the current
employee."""

BALANCE_INTENT_RE = re.compile(
    r"(how many|what'?s|what is|check|my)\s+.*(leave|sick|casual|annual|vacation).*(left|balance|remaining|have)",
    re.IGNORECASE,
)


async def answer(query: str, run_id: str, supervisor_confidence: float, user_id: str) -> dict:
    result = await answer_from_knowledge(
        dept="HR", query=query, run_id=run_id, supervisor_confidence=supervisor_confidence,
        gemini_model=settings.GEMINI_HR_MODEL, groq_fallback_model=settings.GROQ_ACTION_MODEL,
        system_prompt=SYSTEM_PROMPT, dept_label="HR",
    )

    if BALANCE_INTENT_RE.search(query):
        balances = get_leave_balances(user_id)
        if balances:
            lines = [f"- {b['leave_type'].title()}: {b['remaining_days']} of {b['total_days']} days remaining" for b in balances]
            result["answer"] = "Here's your current leave balance:\n" + "\n".join(lines)
            result["unresolved"] = False
            result["used_leave_balance_lookup"] = True

    return result
