"""Context feature vector for the RAG-level LinUCB bandit (see app/bandit/linucb.py).

Dimension is fixed at 12:
  [dept_IT, dept_HR,
   len_short, len_medium, len_long,
   contains_error_code,
   contains_policy_keyword,
   hour_morning, hour_afternoon, hour_evening, hour_night,
   supervisor_confidence]
"""
import re

FEATURE_NAMES = [
    "dept_IT", "dept_HR",
    "len_short", "len_medium", "len_long",
    "contains_error_code",
    "contains_policy_keyword",
    "hour_morning", "hour_afternoon", "hour_evening", "hour_night",
    "supervisor_confidence",
]
DIM = len(FEATURE_NAMES)

_ERROR_CODE_RE = re.compile(r"\berror\b|\bERR-\d+\b|\b0x[0-9A-F]+\b|\b\d{3,4}\b", re.IGNORECASE)
_POLICY_KEYWORDS = {
    "policy", "leave", "payroll", "payslip", "benefits", "insurance", "reimbursement",
    "onboarding", "parental", "carry-forward", "tax",
}


def _length_bucket(query: str) -> str:
    words = len(query.split())
    if words <= 5:
        return "short"
    if words <= 15:
        return "medium"
    return "long"


def _hour_bucket(hour: int) -> str:
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 22:
        return "evening"
    return "night"


def build_context_vector(dept: str, query: str, hour: int, supervisor_confidence: float) -> list[float]:
    vec = [0.0] * DIM
    idx = {name: i for i, name in enumerate(FEATURE_NAMES)}

    if dept == "IT":
        vec[idx["dept_IT"]] = 1.0
    elif dept == "HR":
        vec[idx["dept_HR"]] = 1.0

    vec[idx[f"len_{_length_bucket(query)}"]] = 1.0
    vec[idx["contains_error_code"]] = 1.0 if _ERROR_CODE_RE.search(query) else 0.0
    vec[idx["contains_policy_keyword"]] = (
        1.0 if any(kw in query.lower() for kw in _POLICY_KEYWORDS) else 0.0
    )
    vec[idx[f"hour_{_hour_bucket(hour)}"]] = 1.0
    vec[idx["supervisor_confidence"]] = max(0.0, min(1.0, supervisor_confidence))
    return vec
