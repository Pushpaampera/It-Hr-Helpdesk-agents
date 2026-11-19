"""Clarifying questions for vague IT/HR questions.

"I have an issue with the laptop" names a subject but no symptom, so retrieval just picks whichever
laptop article scores highest (often "Blue screen error") and answers a problem the person never
mentioned. This catches that case before retrieval and asks what's actually happening instead, with
a few likely options the chat can show as one-click replies.

Deliberately a plain word check, not an LLM call: it must behave the same in LLM_MOCK_MODE and
never cost a model call. A question counts as vague only when, after dropping filler and generic
"problem" words, every word left is a name for ONE broad subject below. Anything more specific
("laptop keyboard not working", "VPN error 691") is answered directly as before.
"""
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Subject:
    key: str
    label: str
    words: frozenset[str]
    options: tuple[str, ...]


SUBJECTS: tuple[Subject, ...] = (
    Subject(
        "laptop", "your laptop",
        frozenset({"laptop", "laptops", "computer", "pc", "mac", "macbook", "notebook", "machine", "device", "desktop"}),
        ("It's running slow or overheating", "Blue screen or keeps restarting", "Battery drains fast",
         "Keyboard or trackpad not responding", "External monitor or dock not working", "It's lost or stolen"),
    ),
    Subject(
        "wifi", "Wi-Fi or the network",
        frozenset({"wifi", "wi-fi", "wireless", "internet", "network", "connection", "connectivity"}),
        ("Can't connect to the office Wi-Fi", "Wi-Fi keeps dropping", "Wi-Fi is very slow",
         "Forgot the Wi-Fi password", "Guest Wi-Fi for a visitor"),
    ),
    Subject(
        "email", "email",
        frozenset({"email", "emails", "mail", "outlook", "mailbox", "inbox", "calendar"}),
        ("Outlook isn't getting new emails", "Search can't find my emails", "Mailbox is full",
         "Meeting invites not showing", "Suspicious or phishing email"),
    ),
    Subject(
        "printer", "printing",
        frozenset({"printer", "printers", "printing", "print"}),
        ("Printer doesn't show up", "Paper keeps jamming", "Prints are faded or streaky",
         "Need to install a printer driver"),
    ),
    Subject(
        "mfa", "MFA / sign-in codes",
        frozenset({"mfa", "2fa", "authenticator", "otp"}),
        ("Lost my phone with the authenticator", "Moving to a new phone", "Locked out after too many tries",
         "Where are my backup codes?"),
    ),
    Subject(
        "account", "your account or login",
        frozenset({"account", "login", "log-in", "signin", "sign-in", "password", "sso"}),
        ("I need to reset my password", "My password expired", "Stuck in a login loop",
         "Locked out of my account"),
    ),
    Subject(
        "vpn", "the VPN",
        frozenset({"vpn"}),
        ("VPN won't connect (shows an error code)", "VPN connects then drops", "Using VPN with Remote Desktop"),
    ),
    Subject(
        "rdp", "Remote Desktop",
        frozenset({"rdp", "remote"}),
        ("Connection refused", "Black screen after connecting", "It's slow or laggy",
         "Multiple monitors not working"),
    ),
    Subject(
        "software", "software or apps",
        frozenset({"software", "app", "apps", "application", "applications", "program"}),
        ("Request a new software install", "Install blocked by company policy",
         "App stopped working / licence expired", "Mac app won't open"),
    ),
    Subject(
        "leave", "leave",
        frozenset({"leave", "leaves", "holiday", "holidays", "vacation", "pto", "time-off", "timeoff"}),
        ("How much annual leave do I have?", "Sick leave rules", "Casual leave", "Parental leave",
         "Carrying leave forward", "Cancel or change approved leave"),
    ),
    Subject(
        "pay", "pay",
        frozenset({"pay", "salary", "payroll", "payslip", "payslips", "paycheck", "wages"}),
        ("When is payday?", "Deductions on my payslip", "My payslip looks wrong",
         "Change my salary bank account"),
    ),
    Subject(
        "benefits", "benefits or insurance",
        frozenset({"benefits", "benefit", "insurance", "medical"}),
        ("Health insurance enrollment", "Adding dependents to cover", "Filing an insurance claim",
         "Wellness / gym benefit"),
    ),
    Subject(
        "tax", "tax",
        frozenset({"tax", "taxes"}),
        ("Annual tax declaration", "Missed the tax deadline", "Getting my tax statement"),
    ),
)

# Words that carry no information about WHAT is wrong: pronouns, articles, and generic "it's
# broken / I need help" phrasing. Symptom words ("slow", "keyboard", "battery", "won't turn on")
# are intentionally NOT here, so their presence makes a question specific.
_FILLER = frozenset("""
a an the my our your his her their its it it's this that these those some any
i i'm im me we us you he she they there here
is am are was were be been being do does did have has had having get gets got getting
with about regarding re on in of for to from at by and or but so
issue issues problem problems trouble troubles question questions query concern doubt doubts
help helping assist assistance support
not working work works broken wrong bad faulty error errors weird strange odd
something anything thing things stuff
facing experiencing seeing having
can could would will please pls plz hi hello hey hii team sir madam
quick small little some one
company office work's new old
check checking look looking into see fix fixing sort solve resolve figure out tell know let
what what's whats why happening happened going wrong kindly just suddenly sudden today now again
""".split())

_TOKEN = re.compile(r"[a-z0-9][a-z0-9'\-]*")
_MAX_WORDS = 16


def find_vague_subject(query: str) -> Subject | None:
    """The single broad subject a vague question is about, or None when it's specific enough
    to answer (or isn't about any known subject)."""
    tokens = _TOKEN.findall(query.lower())
    if not tokens or len(tokens) > _MAX_WORDS:
        return None
    if any(ch.isdigit() for t in tokens for ch in t):
        return None  # error/stop codes make it specific
    content = [t for t in tokens if t not in _FILLER]
    if not content:
        return None
    matches = {s.key: s for s in SUBJECTS for t in content if t in s.words}
    if len(matches) != 1:
        return None
    subject = next(iter(matches.values()))
    if all(t in subject.words for t in content):
        return subject
    return None


def single_subject(query: str) -> Subject | None:
    """The one known subject a message mentions, or None (none, or several). Used when the
    supervisor has judged a message vague but the word check above didn't catch it."""
    keys = subjects_mentioned(query)
    if len(keys) != 1:
        return None
    return next(s for s in SUBJECTS if s.key in keys)


def subjects_mentioned(text: str) -> set[str]:
    tokens = set(_TOKEN.findall(text.lower()))
    return {s.key for s in SUBJECTS if tokens & s.words}


_HR_SUBJECTS = frozenset({"leave", "pay", "benefits", "tax"})


def clarifying_reply(subject: Subject) -> str:
    if subject.key in _HR_SUBJECTS:
        return (
            f"I can help with {subject.label}. What would you like to know? Pick one of the "
            f"options below, or ask in your own words."
        )
    return (
        f"I can help with {subject.label}. So I give you the right steps rather than a guess, "
        f"what's happening? Pick one of the options below, or describe it in your own words "
        f"(for example, any error message you see)."
    )


def generic_clarifying_reply() -> str:
    return (
        "I'd like to help, but I need a little more detail first. What exactly is happening? "
        "For example: what you were trying to do, what you see (any error message), and when it started."
    )


def combine_with_followup(original_query: str, followup: str) -> str | None:
    """The question to answer after the person replies to a clarifying question: their original
    question plus the detail they just gave. Returns None when the reply is really a new,
    unrelated question (it names a different subject), so it's answered on its own."""
    original_subjects = subjects_mentioned(original_query)
    reply_subjects = subjects_mentioned(followup)
    if reply_subjects and not (reply_subjects & original_subjects):
        return None
    return f"{original_query.strip().rstrip('.?!')}: {followup.strip()}"
