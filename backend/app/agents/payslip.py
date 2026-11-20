"""Atlas shows the person their OWN payslip in the chat.

  "I want my payslip", "show my payslip for October", "last month's pay slip"
  -> Sage sends it straight to Atlas (a word check, like leave and password requests), and Atlas
     replies with that month's gross pay, each deduction and the net pay, plus which other months
     are available. Nothing else to click and no "did this solve it?" question.

Only ever the signed-in person's own payslip: someone else's ("Priya's payslip") is stopped by Gus
before routing. Problems with a payslip ("my payslip looks wrong", "what are the deductions on my
payslip?") are NOT this: they stay questions for Hana, who can raise an HR ticket.
Plain rules, no LLM, so it behaves the same in LLM_MOCK_MODE. Every view is audited
(hr_system.get_payslip -> view_payslip).
"""
import re
from datetime import date

_PAYSLIP = r"(?:pay\s?slips?|salary\s+slips?|pay\s?stubs?|pay\s+statements?)"
_WANTS = re.compile(
    rf"\b(?:show|see|view|want|need|get|give|send|download|check|open|display|share|look at|access|find|fetch)\b.*\b{_PAYSLIP}\b"
    rf"|\bwhere(?:'s| is| are| can i (?:find|see|get))\b.*\b{_PAYSLIP}\b"
    rf"|\bmy\s+(?:latest\s+|last\s+|recent\s+|current\s+|this month'?s\s+|last month'?s\s+)?{_PAYSLIP}\s*[?.!]*$"
    rf"|^\s*{_PAYSLIP}\s*(?:please|pls)?\s*[?.!]*$",
    re.IGNORECASE,
)
# A problem with a payslip, or a question about how payslips work: Hana answers those.
_NOT_A_VIEW = re.compile(
    r"\b(?:wrong|incorrect|mistake|error|issue|problem|missing|not (?:received|got|get)|didn'?t (?:get|receive)|"
    r"discrepanc\w*|dispute|tax code|explain|meaning|mean|why|how (?:do|does|can|to)|when|change|bank|correct(?:ion)?)\b",
    re.IGNORECASE,
)

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september",
          "october", "november", "december"]
_WORD_RE = re.compile(r"\b[a-z]{3,9}\b", re.IGNORECASE)


def _month_number(word: str) -> int | None:
    """'October', 'oct', 'sept' -> its month number (any 3+ letter start of a month's name)."""
    w = word.lower()
    return next((i for i, full in enumerate(MONTHS, start=1) if full.startswith(w)), None)
_ISO_MONTH_RE = re.compile(r"\b(20\d{2})-(0[1-9]|1[0-2])\b")

DEDUCTION_LABELS = {"tax": "Tax", "pension": "Pension", "insurance": "Health insurance"}


def is_payslip_request(message: str) -> bool:
    """True for "I want my payslip", "show me my payslip for October", "my last payslip"."""
    return bool(_WANTS.search(message)) and not _NOT_A_VIEW.search(message)


def month_name(month: str) -> str:
    """'2026-10' -> 'October 2026'."""
    year, m = month.split("-")
    return f"{MONTHS[int(m) - 1].title()} {year}"


def requested_month(message: str, available: list[str], today: date | None = None) -> str | None:
    """The month the message asks for, as 'YYYY-MM', or None for "the latest one".
    "last month" / "previous" -> the month before the latest available; a month name -> the most
    recent such month not in the future."""
    today = today or date.today()
    iso = _ISO_MONTH_RE.search(message)
    if iso:
        return f"{iso.group(1)}-{iso.group(2)}"
    # "May I see my payslip?" asks politely; it isn't the month of May.
    polite = re.sub(r"\bmay\s+(?=(?:i|we|you)\b)", " ", message, flags=re.IGNORECASE)
    m = next((n for w in _WORD_RE.findall(polite) if (n := _month_number(w))), None)
    if m:
        year = today.year if m <= today.month else today.year - 1
        return f"{year}-{m:02d}"
    if re.search(r"\b(?:last|previous|prior)\s+month'?s?\b|\bprevious\b", message, re.IGNORECASE) and len(available) > 1:
        return available[1]
    return None


def _money(amount: float) -> str:
    return f"{amount:,.2f}"


def format_payslip(slip: dict, available: list[str]) -> str:
    deductions = slip.get("deductions") or {}
    total = sum(float(v) for v in deductions.values())
    lines = [f"Here's your payslip for **{month_name(slip['month'])}**:", "",
             f"- **Gross pay:** {_money(float(slip['gross']))}"]
    for key, value in deductions.items():
        lines.append(f"- {DEDUCTION_LABELS.get(key, key.replace('_', ' ').capitalize())}: −{_money(float(value))}")
    lines += [f"- Total deductions: −{_money(total)}",
              f"- **Net pay (paid to your bank): {_money(float(slip['net']))}**", ""]
    others = [month_name(m) for m in available if m != slip["month"]]
    if others:
        lines.append(f"You also have payslips for {', '.join(others)}. "
                     f"Ask for one by month, for example \"my payslip for {others[0].split()[0]}\".")
    lines.append("If anything looks wrong, tell me what and I'll help you raise it with HR.")
    return "\n".join(lines)


def missing_month_reply(month: str, available: list[str]) -> str:
    have = ", ".join(month_name(m) for m in available)
    return (f"I don't have a payslip for **{month_name(month)}**. The payslips available to you are: {have}. "
            "Which one would you like to see?")


NO_PAYSLIPS_REPLY = (
    "I couldn't find any payslips for you yet. Payslips appear 3 working days before each pay date "
    "(the last working day of the month). If you expected one, tell me and I'll help you raise it with HR."
)
