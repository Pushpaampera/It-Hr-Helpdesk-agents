"""Replies for messages that aren't an IT or HR request (the Supervisor's OTHER route).

Two kinds:
  1. Small talk — greetings, "how can you help?", "who are you?", thanks, goodbyes. These get a
     warm, useful, deterministic reply (no LLM call needed, works in LLM_MOCK_MODE). Checked
     *before* routing so "hi, how can you help me" never reaches a fallback template.
  2. Anything else — a general question is answered by the LLM like a normal assistant would.
     It only declines when the request is unsafe; privacy/prompt-injection blocking is still the
     Guard's job (app/agents/guard.py) and runs before this.

The old behaviour echoed the message back with "I'm not totally sure how to help with …", which
read as broken for perfectly ordinary messages."""
import re

from app.agents.llm import LLMResult, call_gemini_with_groq_fallback, is_mock_mode
from app.config import get_settings

settings = get_settings()

_W = r"[\s,!.?']*"

SMALL_TALK_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("capabilities", re.compile(
        r"\b(how (can|could|do|will) (you|u) help|what (can|could|do) (you|u) (do|help)|what (can|should) i ask|"
        r"what are (you|u) (for|able to do)|what do (you|u) do|help me( out)?$|^help$|what is this (app|tool|place)|"
        r"how does this work)\b",
        re.IGNORECASE,
    )),
    ("identity", re.compile(
        r"\b(who are (you|u)|what('?s| is) (your|ur) name|your name|what are (you|u)|are (you|u) (a )?(bot|robot|human|real|ai))\b",
        re.IGNORECASE,
    )),
    ("thanks", re.compile(r"^\s*(thanks?|thank (you|u)|thx|ty|cheers|great,? thanks|ok,? thanks|appreciate it)\b", re.IGNORECASE)),
    ("goodbye", re.compile(r"^\s*(bye|goodbye|see (you|ya)|good ?night|that'?s all|nothing else)\b", re.IGNORECASE)),
    ("how_are_you", re.compile(r"\b(how are (you|u)|how'?s it going|how are things|what'?s up|wassup)\b", re.IGNORECASE)),
    ("greeting", re.compile(
        rf"^\s*(hi|hii+|hello|hey|hiya|howdy|yo|good (morning|afternoon|evening)|greetings)( there)?{_W}$",
        re.IGNORECASE,
    )),
]


def small_talk_kind(message: str) -> str | None:
    """Returns the small-talk category, or None if this is a real question. Only short messages
    count, so "hi, my VPN won't connect" still goes to IT."""
    if len(message.split()) > 10:
        return None
    for kind, pattern in SMALL_TALK_PATTERNS:
        if pattern.search(message):
            return kind
    return None


CAPABILITIES = (
    "Here's what I can do for you:\n\n"
    "- **Fix IT problems**: VPN and Wi-Fi, passwords and MFA, email, printers, laptops and software.\n"
    "- **Answer HR questions**: leave policies, your own leave balance, payroll, benefits and onboarding.\n"
    "- **Do things for you**: apply for leave, or request access to a system (your manager approves it).\n"
    "- **Get a person involved**: if I can't solve it, I'll offer to open a ticket for the IT or HR team.\n\n"
    "Just tell me what you need in your own words."
)


def small_talk_reply(kind: str, first_name: str) -> str:
    hi = f"Hi {first_name}!" if first_name else "Hi!"
    replies = {
        "capabilities": f"{hi} I'm the Ampera HelpDesk assistant. {CAPABILITIES}",
        "identity": (
            f"{hi} I'm the Ampera HelpDesk assistant, a small team of AI agents working together: "
            "Sage reads your question and passes it to the right specialist, Iris handles IT, Hana "
            "handles HR, and Atlas carries out requests like leave or system access. Every answer "
            f"comes from Ampera's own guides and policies.\n\n{CAPABILITIES}"
        ),
        "thanks": "You're welcome! If anything else comes up, just ask.",
        "goodbye": f"Bye{', ' + first_name if first_name else ''}! I'm here whenever you need help with IT or HR.",
        "how_are_you": (
            f"I'm doing well, thanks for asking{', ' + first_name if first_name else ''}! "
            "What can I help you with today? It could be an IT problem, an HR question, or a request like booking leave."
        ),
        "greeting": (
            f"{hi} How can I help you today? You can ask about an IT problem (like a VPN error or a "
            "forgotten password), an HR question (like your leave balance or the parental leave policy), "
            "or ask me to do something for you, like applying for leave."
        ),
    }
    return replies[kind]


GENERAL_SYSTEM_PROMPT = """You are the Ampera HelpDesk assistant, a friendly, capable workplace
assistant. The employee's message is not a specific IT or HR support request, so answer it the way
a helpful general assistant would: directly, accurately and briefly (under 120 words), using
markdown lists only when they help. General knowledge, how-to questions, writing help and everyday
workplace advice are all fine to answer.

Only decline if the request is unsafe, illegal, or asks for another person's private data — and
then say so briefly and politely. Never invent Ampera-specific policies, systems or numbers; if the
question depends on Ampera's own rules, give general guidance and say the employee can ask you
about the specific IT or HR policy for the exact answer."""

# Used in LLM_MOCK_MODE (no API keys) and if every provider fails. It can't answer arbitrary
# questions without a model, so it stays helpful and points to what it *can* answer, rather than
# echoing the question back as "not sure".
GENERAL_FALLBACK = (
    "That one's outside what I can look up here: I answer from Ampera's IT and HR guides. "
    "If it's work-related, tell me a little more (for example \"Outlook won't sync my email\" or "
    "\"how much annual leave can I carry forward?\") and I'll find the right answer or get the right team involved."
)


async def general_answer(message: str, first_name: str) -> LLMResult:
    user = f"Employee ({first_name or 'unknown'}) asks: {message}"
    return await call_gemini_with_groq_fallback(
        system=GENERAL_SYSTEM_PROMPT, user=user,
        gemini_model=settings.GEMINI_IT_MODEL, groq_fallback_model=settings.GROQ_ACTION_MODEL,
        mock_text=GENERAL_FALLBACK,
    )


__all__ = ["small_talk_kind", "small_talk_reply", "general_answer", "is_mock_mode"]
