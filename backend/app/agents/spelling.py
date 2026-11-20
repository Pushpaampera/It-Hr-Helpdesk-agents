"""Forgiving spelling for helpdesk words: "i want to put a sicck leave tomorow" is read as "i want to
put a sick leave tomorrow" before routing, the leave / password checks and the guide search.

Deliberately small and predictable (no LLM, same in LLM_MOCK_MODE): only words that are close to a
known helpdesk word are fixed — same first letter, at least 4 letters, and a close match (difflib).
Everyday English words that happen to look similar are left alone. The person's own words are
still what the chat shows and stores; only what the agents read is corrected.
"""
import difflib
import re

VOCABULARY = frozenset("""
leave leaves sick casual annual parental maternity paternity vacation holiday holidays
day days week weeks month today tomorrow yesterday morning afternoon
monday tuesday wednesday thursday friday saturday sunday
january february march april june july august september october november december
apply request cancel approve approved reject rejected reason because balance remaining
fever doctor medical hospital appointment wedding family emergency funeral surgery unwell
password passwords reset forgot forgotten expired unlock locked account login
laptop computer keyboard monitor printer mouse screen charger battery
outlook email mailbox internet network wireless software install update access
payroll payslip payslips salary bonus insurance benefits reimbursement travel
policy policies onboarding performance review
""".split())

# Real words that look like a helpdesk word but mean something else: never "fixed".
_KEEP = frozenset("""
lease live love lave sock seek slick pass passed past word world worse sake lake sure
apple reply real reach weak wake peak mouth monthly tray trial dates date data
""".split())

# Short forms and short typos people use in chat.
_SHORT = {
    "tmrw": "tomorrow", "tmr": "tomorrow", "tmrow": "tomorrow", "tomo": "tomorrow", "2moro": "tomorrow",
    "2morrow": "tomorrow", "tdy": "today", "2day": "today", "wek": "week", "wk": "week", "lv": "leave",
    "pwd": "password", "pswd": "password", "passwd": "password", "mon": "monday", "tue": "tuesday",
    "wed": "wednesday", "thu": "thursday", "thur": "thursday", "thurs": "thursday", "fri": "friday",
}

_WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9']*")


def _fix_word(word: str) -> str:
    low = word.lower()
    if low in _SHORT:
        return _SHORT[low]
    if not low[0].isalpha():
        return word
    if len(low) < 4 or low in VOCABULARY or low in _KEEP or "'" in low:
        return word
    candidates = [v for v in VOCABULARY if v[0] == low[0] and abs(len(v) - len(low)) <= 2]
    match = difflib.get_close_matches(low, candidates, n=1, cutoff=0.8)
    if not match:
        return word
    fixed = match[0]
    return fixed.capitalize() if word[0].isupper() else fixed


def correct(text: str) -> str:
    """The message with likely typos of helpdesk words fixed; everything else unchanged."""
    return _WORD.sub(lambda m: _fix_word(m.group(0)), text)
