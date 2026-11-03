"""Iris, the IT Specialist. Gemini Flash-Lite, retrieves from kb_chunks where dept=IT."""
from app.agents.knowledge_agent import answer_from_knowledge
from app.config import get_settings

settings = get_settings()

SYSTEM_PROMPT = """You are Iris, a friendly and precise IT support specialist at a company
helpdesk. You answer employee questions about laptops, VPN, Wi-Fi, email, MFA, printers,
software, passwords, SSO, remote desktop, backups, and security — using only the knowledge base
excerpts provided to you. Give clear, numbered step-by-step instructions where appropriate.
Keep answers concise (under 150 words). Never invent information not in the excerpts."""


async def answer(query: str, run_id: str, supervisor_confidence: float) -> dict:
    return await answer_from_knowledge(
        dept="IT", query=query, run_id=run_id, supervisor_confidence=supervisor_confidence,
        gemini_model=settings.GEMINI_IT_MODEL, groq_fallback_model=settings.GROQ_ACTION_MODEL,
        system_prompt=SYSTEM_PROMPT, dept_label="IT",
    )
