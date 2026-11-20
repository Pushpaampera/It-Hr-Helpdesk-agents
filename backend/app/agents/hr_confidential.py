"""Spots private HR matters typed into the chat — complaints about someone, fights or conflict
with colleagues, harassment, discrimination, concerns about a manager, personal or wellbeing
problems, safety worries — and asking to talk to HR directly.

These are NOT handled by the AI agents. The chat router (app/routers/chat.py) checks this first,
before any agent, LLM call or run logging, and instead:
  * replies with care and points the person to the private "Talk to HR" page and HR's direct
    contact details;
  * never stores what they typed in chat history, agent runs or events — IT support and admins can
    read those, and these matters must be seen by HR only.

Deterministic regex, no LLM: it has to work in LLM_MOCK_MODE, and a private message must never
be sent to an external model just to classify it. Patterns are tuned to stay quiet on ordinary
helpdesk questions ("how do I report a phishing email", "bereavement leave policy")."""
import re
from dataclasses import dataclass

# People a complaint can be about.
_PERSON = (
    r"(?:my |a |the |our |one of my |this |that )?"
    r"(?:colleague|co-?worker|teammate|team ?mate|team ?lead|manager|boss|supervisor|senior|junior|"
    r"lead|peer|employee|staff member|someone|somebody|person|guy|girl|man|woman|him|her|them)s?"
)

_P = lambda pattern: re.compile(pattern, re.IGNORECASE)  # noqa: E731


@dataclass(frozen=True)
class ConfidentialMatch:
    category: str  # matches hr_cases.category
    urgent: bool
    crisis: bool = False  # risk of self-harm: lead with immediate-support wording


# Order matters: the first match wins, most serious first.
_RULES: list[tuple[str, bool, bool, list[re.Pattern]]] = [
    ("safety", True, True, [
        _P(r"\b(kill(ing)? myself|suicid\w*|end(ing)? (it all|my life)|take my (own )?life|"
           r"hurt(ing)? myself|self[- ]harm\w*|don'?t want to (live|be alive)|no reason to live)\b"),
    ]),
    ("safety", True, False, [
        _P(r"\b(threaten(ed|ing)? to (hurt|kill|beat|hit|attack)|(hit|slapped|punched|pushed|attacked|assaulted|grabbed) me|"
           r"(physical|sexual)(ly)? (assault|abuse)\w*|domestic (violence|abuse)|weapon|"
           r"(feel|am|i'?m) (unsafe|not safe|scared for my (life|safety))|afraid for my safety|stalk(ing|ed|s)? me)\b"),
    ]),
    ("harassment", True, False, [
        _P(r"\b(sexual(ly)? harass\w*|inappropriate(ly)? touch\w*|unwanted (advances|touching|contact)|"
           r"touch(ed|es|ing) me inappropriately)\b"),
    ]),
    ("harassment", False, False, [
        _P(r"\bharass\w*|\bbull(y|ies|ied|ying)\b|\bintimidat\w*|\b(creepy|inappropriate) (comments?|messages?|behaviou?r)\b|"
           r"\bmakes? me (feel )?uncomfortable\b|\bpick(s|ing|ed)? on me\b|\btarget(s|ing|ed) me\b"),
    ]),
    ("discrimination", False, False, [
        _P(r"\bdiscriminat\w*|\bracis[mt]\w*|\bsexis[mt]\w*|\bhomophob\w*|\btransphob\w*|\bcasteis[mt]\b|"
           r"\b(treated|treating) (me )?(unfairly|differently) because\b|"
           r"\bbecause (of )?(i'?m|i am|my) (a )?(woman|pregnant|black|muslim|hindu|christian|gay|disabled|old|young|"
           r"race|religion|gender|age|disability|pregnancy|caste|accent|skin)\b"),
    ]),
    ("misconduct", False, False, [
        _P(r"\bwhistle ?blow\w*|\b(steal(ing|s)?|stole|fraud|bribe\w*|embezzl\w*|fake (bills|expenses|timesheets))\b.{0,40}\b(colleague|co-?worker|manager|boss|someone|he|she|they)\b|"
           r"\b(colleague|co-?worker|manager|boss|someone|he|she|they)\b.{0,40}\b(steal(ing|s)?|stole|fraud|bribe\w*|embezzl\w*)\b|"
           r"\bmisconduct\b|\bunethical\b|\bcode of conduct (violation|breach)\b"),
    ]),
    ("manager_concern", False, False, [
        _P(r"\b(my )?(manager|boss|supervisor|team ?lead)\b.{0,50}\b(yell\w*|shout\w*|scream\w*|insult\w*|humiliat\w*|"
           r"threaten\w*|unfair(ly)? (to|towards) me|abus\w*|retaliat\w*|ignor(es|ing) me|blam(es|ing) me|rude|toxic|micromanag\w*)\b"),
        _P(r"\b(problem|issue|trouble|conflict|complaint)s? (with|about|against) (my )?(manager|boss|supervisor|team ?lead)\b"),
    ]),
    ("colleague_conflict", False, False, [
        _P(rf"\b(fight(ing)?|fought|argu(ment|ing|ed)|conflict|dispute|clash(ed|ing)?|problem|issue|trouble|beef|falling out|fell out)s? "
           rf"(with|between (me|us) and) {_PERSON}\b"),
        _P(r"\b(yell(s|ed|ing)?|shout(s|ed|ing)?|scream(s|ed|ing)?|swore|swearing|curs(ed|ing)) at me\b|"
           r"\b(insult(s|ed|ing)?|humiliat(es|ed|ing)|belittl(es|ed|ing)|mock(s|ed|ing)|abus(es|ed|ing)|threaten(s|ed|ing)?) me\b|"
           r"\b(is|was|keeps being|has been) (rude|abusive|aggressive|hostile|toxic) (to|towards|with) me\b|"
           r"\bnot getting along with\b|\bcan'?t work with\b|\btoxic (colleague|co-?worker|teammate|team|workplace|environment)\b"),
    ]),
    ("other", False, False, [
        # Complaints / reports in general (the specific kinds above are checked first).
        _P(rf"\b(complain(t|ts|ing)?|grievance)s?\b.{{0,40}}\b(about|against|regarding|on)\b|"
           rf"\b(file|raise|make|lodge|submit|register) (a |an )?(formal )?(complaint|grievance)\b|"
           rf"\breport {_PERSON}\b|\breport(ing)? (him|her|them|my (colleague|co-?worker|manager|boss|teammate))\b"),
    ]),
    ("personal_wellbeing", False, False, [
        _P(r"\b(personal|private|family) (problem|issue|matter|situation|crisis)s?\b|"
           r"\b(mental health|depress(ed|ion)|anxiety|anxious|panic attacks?|burn(ed|t)? ?out|can'?t cope|"
           r"overwhelmed|going through a (hard|tough|difficult) time|struggling (mentally|emotionally|with (stress|life|my mental))|"
           r"(so|very|really|too) stressed|stress(ed)? (at|from|because of) work|"
           r"getting (a )?divorce)\b"),
    ]),
    ("other", False, False, [
        # Asking to reach HR directly.
        _P(r"\b(talk|speak|chat|meet|reach|contact|connect me)( to| with)? (someone (in|from) )?(the )?hr( team| department| person| rep\w*)?\b|"
           r"\bhr('?s)? (email|e-mail|phone|number|contact|helpline)\b|\bhow (do|can) i (contact|reach) hr\b|"
           r"\b(confidential|private|anonymous)(ly)? (complaint|matter|issue|report|chat|talk)\b"),
    ]),
]


_POLICY_QUESTION = re.compile(r"\b(leave|policy|policies|days? off|time off|holiday|entitle\w*)\b", re.IGNORECASE)


def detect(message: str) -> ConfidentialMatch | None:
    text = message.strip()
    if not text:
        return None
    for category, urgent, crisis, patterns in _RULES:
        if any(p.search(text) for p in patterns):
            # "Can I take leave for a personal matter?" is a leave-policy question for Hana, not
            # a private case — only wellbeing matches are softened this way, never complaints.
            if category == "personal_wellbeing" and _POLICY_QUESTION.search(text):
                continue
            return ConfidentialMatch(category=category, urgent=urgent, crisis=crisis)
    return None


CATEGORY_LABELS = {
    "harassment": "Harassment or bullying",
    "discrimination": "Discrimination",
    "colleague_conflict": "Conflict with a colleague",
    "manager_concern": "Concern about my manager",
    "misconduct": "Misconduct or wrongdoing",
    "personal_wellbeing": "Personal or wellbeing matter",
    "safety": "My safety",
    "other": "Something else",
}


def reply_for(match: ConfidentialMatch, first_name: str, hr_email: str) -> str:
    """The assistant's reply. It never repeats the person's words or anyone's name back."""
    name = f", {first_name}" if first_name else ""
    if match.crisis:
        return (
            f"I'm really sorry you're feeling this way{name}. You don't have to go through this alone.\n\n"
            "**If you might act on these thoughts or you're in danger right now, please call your local "
            "emergency number immediately**, or reach out to someone you trust or a local crisis line.\n\n"
            f"Ampera's HR team can also support you confidentially. You can contact them directly at **{hr_email}**, "
            "or use the private **Talk to HR** page. I've marked it as urgent for you. "
            "Only the HR team can see what you write there."
        )
    if match.category == "safety":
        return (
            f"I'm sorry this is happening{name}. Your safety comes first: **if you are in immediate danger, call your "
            "local emergency number now.**\n\n"
            f"Please tell HR straight away, either directly at **{hr_email}** or through the private **Talk to HR** "
            "page (already marked urgent). Only the HR team can read it. Your manager, IT support and admins cannot."
        )
    opener = {
        "harassment": f"I'm sorry you're dealing with this{name}. Nobody should be treated that way at work.",
        "discrimination": f"I'm sorry you've experienced this{name}. Being treated unfairly is something HR takes seriously.",
        "colleague_conflict": f"I'm sorry things are difficult with a colleague{name}. HR can help sort this out fairly.",
        "manager_concern": f"Thanks for trusting me with this{name}. Concerns about a manager go to HR, not to your manager.",
        "misconduct": f"Thank you for speaking up{name}. Reporting a concern like this is the right thing to do.",
        "personal_wellbeing": f"I'm sorry you're going through this{name}. HR can help, confidentially, with support and options.",
        "other": f"Of course{name}. This is something the HR team should handle personally.",
    }[match.category]
    return (
        f"{opener}\n\n"
        "This is a private matter, so I won't handle the details here, and I haven't saved what you just typed. "
        "Please take it straight to HR:\n\n"
        "- **Talk to HR privately**: open a confidential case. **Only the HR team can read it.** Your manager, IT support and "
        "admins cannot. You can stay anonymous if you prefer.\n"
        f"- **Contact HR directly**: **{hr_email}**\n\n"
        "HR will reply to you on the same page, and you can follow your case there."
    )
