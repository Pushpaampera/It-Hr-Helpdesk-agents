"""Atlas's leave request: collected step by step, sent to HR only after the person says yes.

  1. "i want to put a sicck leave tomorow, i have fever" -> spelling is fixed first
     (app/agents/spelling.py), then Sage sends it straight to Atlas (HR, an action).
  2. Atlas reads what it can: the type (sick / casual / annual / parental), the dates ("tomorrow",
     "25 Nov", "1 Dec to 3 Dec", "monday", "next week", "for 2 days") and the reason ("because …",
     "for my sister's wedding", "I have fever").
  3. Anything missing is asked for, one question at a time, with one-click answers.
  4. A summary (with the remaining balance) and "Shall I send it to HR for approval?".
  5. Yes -> a pending leave request (hr_system.apply_leave); HR is notified and approves or rejects
     it on the HR Dashboard; the person is notified of the decision (existing flow).

Each question is a LangGraph NodeInterrupt resumed by the person's next message, like the other
gates; the details so far live in the leave_drafts table (state set before an interrupt is lost).
Everything here is plain rules, no LLM, so it behaves the same in LLM_MOCK_MODE.
"""
import re
from datetime import date, timedelta

from sqlalchemy import text

from app.db import get_engine

TYPE_GATE = "leave_type"
DATES_GATE = "leave_dates"
REASON_GATE = "leave_reason"
CONFIRM_GATE = "leave_confirm"

LEAVE_LABEL = {"sick": "Sick leave", "casual": "Casual leave", "annual": "Annual leave", "parental": "Parental leave"}
MAX_DAYS = {"sick": 30, "casual": 7, "annual": 30, "parental": 180}
SICK_BACKDATE_DAYS = 7

# ---------------------------------------------------------------- is it a leave request?

_LEAVE_WORDS = r"(?:leave|leaves|day off|days off|time off|holiday|vacation|off tomorrow|off today)"
_ASKING = re.compile(
    rf"\b(?:want|need|would like|like to|take|taking|get|have|apply|applying|book|request|put|raise|submit|"
    rf"mark|file|grant|give me|planning)\b.*\b{_LEAVE_WORDS}\b",
    re.IGNORECASE,
)
_TYPED_WITH_WHEN = re.compile(
    r"\b(?:sick|casual|annual|parental|maternity|paternity)\s+leave\b.*\b(?:today|tomorrow|on|from|for|next|this|"
    r"monday|tuesday|wednesday|thursday|friday|\d)",
    re.IGNORECASE,
)
_UNWELL_TODAY = re.compile(
    r"\b(?:i am|i'm|im|feeling)\s+(?:sick|unwell|ill|not well|not feeling well)\b.*\b(?:can'?t|cannot|won'?t|will not)\s+"
    r"(?:come|work|make it|attend)",
    re.IGNORECASE,
)
# Questions about leave, and other leave actions Atlas handles elsewhere.
_NOT_A_REQUEST = re.compile(
    r"^\s*(?:how|what|why|which|where|who|when|is|are|does|do|did)\b"
    r"|\b(?:balance|how many|left|remaining|carry|policy|policies|cancel|withdraw|status of|approved\?)\b",
    re.IGNORECASE,
)


def is_leave_request(message: str) -> bool:
    """True for "I want a leave", "i want to put a sick leave", "need casual leave on monday",
    "sick leave tomorrow", "I'm not feeling well, I can't come today". Not for questions ("how many
    sick days do I get?") or balance / cancel requests."""
    if _NOT_A_REQUEST.search(message):
        return False
    return bool(_ASKING.search(message) or _TYPED_WITH_WHEN.search(message) or _UNWELL_TODAY.search(message))


# ---------------------------------------------------------------- leave type

_TYPE_WORDS = (
    ("parental", re.compile(r"\b(?:parental|maternity|paternity|baby|newborn)\b", re.IGNORECASE)),
    ("sick", re.compile(r"\b(?:sick|ill|unwell|not well|not feeling well|fever|cold|flu|doctor|medical|hospital|"
                        r"headache|migraine|injury|injured|surgery|stomach|covid|dentist)\b", re.IGNORECASE)),
    ("casual", re.compile(r"\b(?:casual|personal work|personal reason|errand|function|ceremony)\b", re.IGNORECASE)),
    ("annual", re.compile(r"\b(?:annual|vacation|holiday|holidays|trip|travel|travelling|traveling|tour|earned|"
                          r"privilege)\b", re.IGNORECASE)),
)


def extract_type(message: str) -> str | None:
    for key, words in _TYPE_WORDS:
        if words.search(message):
            return key
    return None


# ---------------------------------------------------------------- dates

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4, "may": 5,
    "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_NUMBER_WORDS = {"one": 1, "a": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
                 "eight": 8, "nine": 9, "ten": 10, "a couple of": 2, "couple of": 2}

_MONTH_RE = "|".join(sorted(_MONTHS, key=len, reverse=True))
_DATE_PATTERNS = (
    ("iso", re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b")),
    ("dmy", re.compile(r"\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b")),
    ("d_month", re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({_MONTH_RE})\b\.?(?:,?\s+(\d{{4}}))?",
                           re.IGNORECASE)),
    ("month_d", re.compile(rf"\b({_MONTH_RE})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?\b(?:,?\s+(\d{{4}}))?", re.IGNORECASE)),
    ("relative", re.compile(r"\b(day after tomorrow|tomorrow|today|yesterday)\b", re.IGNORECASE)),
    ("weekday", re.compile(rf"\b(?:(next|this|coming)\s+)?({'|'.join(_WEEKDAYS)})\b", re.IGNORECASE)),
)
_DURATION = re.compile(
    r"\b(?:for\s+)?(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|couple of)\s+"
    r"(?:working\s+)?(days?|weeks?)\b",
    re.IGNORECASE,
)
_NEXT_WEEK = re.compile(r"\b(?:next|coming)\s+week\b", re.IGNORECASE)


def _year_for(month: int, day: int, today: date) -> date | None:
    try:
        d = date(today.year, month, day)
    except ValueError:
        return None
    # "5 Jan" said in November means next January.
    if d < today - timedelta(days=SICK_BACKDATE_DAYS):
        try:
            d = date(today.year + 1, month, day)
        except ValueError:
            return None
    return d


def _explicit(kind: str, m: re.Match, today: date) -> date | None:
    try:
        if kind == "iso":
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if kind == "dmy":
            day, month, year = int(m.group(1)), int(m.group(2)), m.group(3)
            if year:
                y = int(year) + (2000 if len(year) == 2 else 0)
                return date(y, month, day)
            return _year_for(month, day, today)
        if kind == "d_month":
            day, month, year = int(m.group(1)), _MONTHS[m.group(2).lower()], m.group(3)
            return date(int(year), month, day) if year else _year_for(month, day, today)
        if kind == "month_d":
            month, day, year = _MONTHS[m.group(1).lower()], int(m.group(2)), m.group(3)
            return date(int(year), month, day) if year else _year_for(month, day, today)
    except (ValueError, KeyError):
        return None
    if kind == "relative":
        word = m.group(1).lower()
        return today + timedelta(days={"today": 0, "tomorrow": 1, "day after tomorrow": 2, "yesterday": -1}[word])
    if kind == "weekday":
        target = _WEEKDAYS.index(m.group(2).lower())
        ahead = (target - today.weekday()) % 7 or 7  # always the next one, never today
        return today + timedelta(days=ahead)
    return None


def _dates_in(message: str, today: date) -> list[tuple[int, date]]:
    """Every date mentioned, with its position, earliest mention first (overlaps skipped)."""
    found: list[tuple[int, int, date]] = []
    for kind, pattern in _DATE_PATTERNS:
        for m in pattern.finditer(message):
            if any(start <= m.start() < end or start < m.end() <= end for start, end, _ in found):
                continue
            d = _explicit(kind, m, today)
            if d:
                found.append((m.start(), m.end(), d))
    return [(start, d) for start, _, d in sorted(found)]


def extract_duration(message: str) -> int | None:
    m = _DURATION.search(message)
    if not m:
        return None
    raw = m.group(1).lower()
    n = int(raw) if raw.isdigit() else _NUMBER_WORDS.get(raw, 1)
    return n * 7 if m.group(2).lower().startswith("week") else n


def extract_dates(message: str, today: date | None = None, known_duration: int | None = None) -> dict:
    """{'start': date|None, 'end': date|None, 'duration': int|None} from a message."""
    today = today or date.today()
    duration = extract_duration(message) or known_duration
    dates = _dates_in(message, today)
    if len(dates) >= 2:
        start, end = sorted((dates[0][1], dates[1][1]))
        return {"start": start, "end": end, "duration": (end - start).days + 1}
    if len(dates) == 1:
        start = dates[0][1]
        end = start + timedelta(days=(duration or 1) - 1)
        return {"start": start, "end": end, "duration": (end - start).days + 1}
    if _NEXT_WEEK.search(message):
        start = today + timedelta(days=(7 - today.weekday()))
        end = start + timedelta(days=(duration or 5) - 1)
        return {"start": start, "end": end, "duration": (end - start).days + 1}
    return {"start": None, "end": None, "duration": duration}


def date_problem(leave_type: str | None, start: date, end: date, today: date | None = None) -> str | None:
    today = today or date.today()
    if end < start:
        return "The end date is before the start date."
    earliest = today - timedelta(days=SICK_BACKDATE_DAYS) if leave_type == "sick" else today
    if start < earliest:
        return ("Sick leave can only go back up to a week." if leave_type == "sick"
                else "That date has already passed. Leave has to start today or later.")
    longest = MAX_DAYS.get(leave_type or "annual", 30)
    if (end - start).days + 1 > longest:
        return f"That's more than {longest} days, the longest {LEAVE_LABEL.get(leave_type, 'leave').lower()} you can ask for at once."
    return None


def overlapping_leave(user_id: str, start: date, end: date) -> dict | None:
    with get_engine().connect() as conn:
        row = conn.execute(
            text("""SELECT leave_type, start_date, end_date, status FROM leave_requests
                    WHERE user_id = :u AND status IN ('pending', 'approved')
                      AND start_date <= :end AND end_date >= :start
                    ORDER BY start_date LIMIT 1"""),
            {"u": user_id, "start": start, "end": end},
        ).mappings().first()
    return dict(row) if row else None


# ---------------------------------------------------------------- reason

_CUT = re.compile(
    r"\s*(?:,|\.|;|\band\b\s+(?:i\s+)?(?:want|need)|\bfrom\b\s|\bon\s+(?:\d|mon|tue|wed|thu|fri|sat|sun)|"
    r"\btomorrow\b|\btoday\b|\bfor\s+\d|\bnext week\b|\bplease\b)",
    re.IGNORECASE,
)
_REASON_PATTERNS = (
    re.compile(r"\b(?:because(?:\s+of)?|due to|as i(?:'m| am)?|since i|reason(?:\s+is)?\s*:?)\s+(.+)", re.IGNORECASE),
    re.compile(r"\bfor\s+((?:my|a|an|the|our)\s+(?!(?:sick|casual|annual|parental|leave|day|days|week|weeks|"
               r"couple)\b).+)", re.IGNORECASE),
    re.compile(r"\b(?:i\s+(?:have|am having|have got|got|'ve got)|i'm having|having)\s+(?:a\s+|an\s+)?"
               r"((?:high\s+)?(?:fever|cold|flu|headache|migraine|stomach|back pain|toothache|injury|"
               r"doctor'?s? appointment|appointment|surgery|function|wedding|exam|interview|family emergency|"
               r"emergency).*)", re.IGNORECASE),
    re.compile(r"\b((?:i'?m|i am)\s+(?:not feeling well|unwell|sick|ill))\b", re.IGNORECASE),
)


def _tidy(reason: str) -> str:
    reason = reason.strip(" .,!;:-")
    return (reason[:1].upper() + reason[1:])[:200] if reason else ""


def extract_reason(message: str) -> str | None:
    for pattern in _REASON_PATTERNS:
        m = pattern.search(message)
        if m:
            reason = _CUT.split(m.group(1), maxsplit=1)[0]
            if len(reason.strip()) >= 2:
                return _tidy(reason)
    return None


def reason_from_answer(message: str) -> str:
    """The whole reply is the reason ("fever", "family function"), minus a "the reason is" lead-in."""
    found = extract_reason(message)
    if found:
        return found
    return _tidy(re.sub(r"^\s*(?:the\s+)?reason\s*(?:is)?\s*:?\s*", "", message, flags=re.IGNORECASE))


# ---------------------------------------------------------------- reading replies

_CANCEL = re.compile(r"^\s*(?:no|nope)\s*\.?\s*$|\b(?:cancel|stop|never\s?mind|forget it|don'?t send|do not send)\b",
                     re.IGNORECASE)
_SEND = re.compile(r"\b(?:yes|yep|yeah|sure|ok|okay|send|submit|go ahead|confirm|correct|looks good|do it)\b",
                   re.IGNORECASE)
_CHANGE = re.compile(r"\b(?:change|edit|different|wrong|modify)\b", re.IGNORECASE)
_QUESTION = re.compile(r"\?\s*$|^\s*(?:how|what|why|which|where|who|when|is|are|does|do|can|could|will)\b",
                       re.IGNORECASE)


def is_cancel(message: str) -> bool:
    return bool(_CANCEL.search(message))


def read_confirm(message: str) -> str | None:
    """'send', 'cancel', 'change_dates', 'change_reason', 'change_type' or None."""
    t = message.lower()
    if _CHANGE.search(t) or t.strip() in ("dates", "date", "reason", "type"):
        if "reason" in t:
            return "change_reason"
        if "type" in t or "kind" in t:
            return "change_type"
        return "change_dates"
    if is_cancel(t):
        return "cancel"
    if _SEND.search(t):
        return "send"
    return None


def answers_open_step(step: str, message: str, today: date | None = None) -> bool:
    """Does this message answer the question Atlas is waiting on (else it's a new question)?"""
    if is_cancel(message):
        return True
    if step == "type":
        return extract_type(message) is not None
    if step == "dates":
        found = extract_dates(message, today)
        return found["start"] is not None or found["duration"] is not None or not _QUESTION.search(message)
    if step == "reason":
        return not _QUESTION.search(message) or extract_reason(message) is not None
    if step == "confirm":
        return read_confirm(message) is not None
    return False


# ---------------------------------------------------------------- database

def _row(conn, sql: str, params: dict) -> dict | None:
    row = conn.execute(text(sql), params).mappings().first()
    return dict(row) if row else None


def create(user_id: str, run_id: str, details: dict) -> dict:
    with get_engine().begin() as conn:
        return _row(
            conn,
            """INSERT INTO leave_drafts (user_id, run_id, leave_type, start_date, end_date, duration_days, reason)
               VALUES (:u, :r, :t, :s, :e, :d, :reason) RETURNING *""",
            {"u": user_id, "r": run_id, "t": details.get("leave_type"), "s": details.get("start"),
             "e": details.get("end"), "d": details.get("duration"), "reason": details.get("reason")},
        )


def get_for_run(run_id: str) -> dict | None:
    with get_engine().connect() as conn:
        return _row(conn, "SELECT * FROM leave_drafts WHERE run_id = :r ORDER BY created_at DESC LIMIT 1", {"r": run_id})


def update(draft_id: str, **fields) -> dict:
    allowed = {"status", "leave_type", "start_date", "end_date", "duration_days", "reason", "leave_request_id"}
    sets = [f"{k} = :{k}" for k in fields if k in allowed]
    params = {k: v for k, v in fields.items() if k in allowed}
    with get_engine().begin() as conn:
        if sets:
            conn.execute(text(f"UPDATE leave_drafts SET {', '.join(sets)}, updated_at = now() WHERE id = :id"),
                         {**params, "id": draft_id})
        return _row(conn, "SELECT * FROM leave_drafts WHERE id = :id", {"id": draft_id})


def cancel_open_for_run(run_id: str) -> None:
    with get_engine().begin() as conn:
        conn.execute(text("""UPDATE leave_drafts SET status = 'cancelled', updated_at = now()
                             WHERE run_id = :r AND status LIKE 'awaiting_%'"""), {"r": run_id})


def open_step_for_run(run_id: str) -> str | None:
    """'type', 'dates', 'reason' or 'confirm' when this run is waiting inside a leave request."""
    draft = get_for_run(run_id)
    if not draft or not draft["status"].startswith("awaiting_"):
        return None
    return draft["status"].removeprefix("awaiting_")


def next_missing(draft: dict) -> str:
    if not draft.get("leave_type"):
        return "type"
    if not draft.get("start_date"):
        return "dates"
    if not draft.get("reason"):
        return "reason"
    return "confirm"


# ---------------------------------------------------------------- what Atlas says

def fmt_day(d: date) -> str:
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b %Y')}"


def fmt_range(start: date, end: date) -> str:
    days = (end - start).days + 1
    span = fmt_day(start) if start == end else f"{fmt_day(start)} to {fmt_day(end)}"
    return f"{span} ({days} day{'s' if days != 1 else ''})"


def balances_line(balances: list[dict]) -> str:
    order = ["sick", "casual", "annual", "parental"]
    left = {b["leave_type"]: b["remaining_days"] for b in balances}
    parts = [f"{LEAVE_LABEL[t].split()[0]} {_n(left[t])}" for t in order if t in left]
    return f"Days you have left: {', '.join(parts)}." if parts else ""


def _n(x) -> str:
    x = float(x)
    return str(int(x)) if x.is_integer() else f"{x:g}"


def type_prompt(balances: list[dict]) -> str:
    return f"I can send a leave request to HR for you. **What kind of leave do you need?**\n\n{balances_line(balances)}"


TYPE_OPTIONS = ["Sick leave", "Casual leave", "Annual leave", "Parental leave"]
TYPE_REASK = "Sorry, I didn't catch the type. Please choose **Sick**, **Casual**, **Annual** or **Parental** leave."


def dates_prompt(leave_type: str, duration: int | None, problem: str | None = None) -> str:
    lead = f"{problem} " if problem else ""
    if duration:
        return (f"{lead}**From which day** do you need the {duration} day{'s' if duration != 1 else ''} of "
                f"{LEAVE_LABEL[leave_type].lower()}? For example \"tomorrow\" or \"25 Nov\".")
    return (f"{lead}**Which day or days** do you need {LEAVE_LABEL[leave_type].lower()} for? For example "
            "\"tomorrow\", \"25 Nov\", \"Monday for 2 days\" or \"1 Dec to 3 Dec\".")


DATE_OPTIONS = ["Today", "Tomorrow", "Day after tomorrow"]


def overlap_problem(existing: dict) -> str:
    return (f"You already have {existing['leave_type']} leave {existing['status']} for "
            f"{fmt_range(existing['start_date'], existing['end_date'])}, which overlaps.")


def reason_prompt(leave_type: str) -> str:
    return "**What's the reason?** HR will see it. A few words is enough."


REASON_OPTIONS = {
    "sick": ["Not feeling well", "Doctor's appointment", "Family member is unwell"],
    "casual": ["Personal work", "Family function", "Urgent errand"],
    "annual": ["Family vacation", "Travelling home", "Personal time off"],
    "parental": ["Birth of my child", "Adoption"],
}


def confirm_prompt(draft: dict, balances: list[dict]) -> str:
    leave_type = draft["leave_type"]
    days = (draft["end_date"] - draft["start_date"]).days + 1
    left = next((b["remaining_days"] for b in balances if b["leave_type"] == leave_type), None)
    balance = ""
    if left is not None:
        balance = f"\n\nYou have **{_n(left)}** {leave_type} day{'s' if float(left) != 1 else ''} left."
        if days > float(left):
            balance += " This request is more than that, so HR may reject it."
    return (
        "Here's your leave request:\n\n"
        f"- **Type:** {LEAVE_LABEL[leave_type]}\n"
        f"- **Dates:** {fmt_range(draft['start_date'], draft['end_date'])}\n"
        f"- **Reason:** {draft['reason']}"
        f"{balance}\n\n"
        "**Shall I send it to HR for approval?**"
    )


CONFIRM_OPTIONS = ["Yes, send to HR", "Change dates", "Change reason", "Cancel"]
CONFIRM_REASK = "Shall I send it to HR? Choose **Yes, send to HR**, **Change dates**, **Change reason** or **Cancel**."
CANCELLED_REPLY = "Okay, I haven't sent anything to HR. If you need leave later, just ask me."


def submitted_reply(draft: dict) -> str:
    return (
        f"Done! Your {LEAVE_LABEL[draft['leave_type']].lower()} request for "
        f"{fmt_range(draft['start_date'], draft['end_date'])} has been sent to HR for approval.\n\n"
        "You'll get a notification here and an email as soon as HR approves or rejects it. "
        "You can also see it on your Overview page."
    )
