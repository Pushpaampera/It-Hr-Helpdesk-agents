"""Generates leave balances, payslips, tickets, approvals/access requests, and 300 historical
agent runs (with events, feedback, and bandit decisions/rewards) so every dashboard chart looks
alive the moment the app is first opened (master prompt section 11).
"""
import random
import uuid
from datetime import datetime, timedelta, timezone

from app.bandit.features import build_context_vector
from app.bandit.linucb import LinUCBArm, compute_reward, select_arm

IT_SAMPLE_QUERIES = [
    ("My laptop won't connect to the VPN, error 619", "619"),
    ("Getting VPN error 691 when I try to log in", "691"),
    ("VPN error 800, can't reach the gateway at all", "800"),
    ("My laptop battery drains so fast now", None),
    ("Laptop keeps overheating and the fan is so loud", None),
    ("Got a blue screen with a stop code this morning", None),
    ("Docking station won't show my external monitors", None),
    ("Wi-Fi keeps dropping every few minutes", None),
    ("Outlook isn't syncing new emails at all", None),
    ("I lost my phone with my MFA app on it", None),
    ("Locked out of my account after too many MFA tries", None),
    ("Printer keeps jamming on the same spot", None),
    ("Need a new software license approved", None),
    ("Forgot my password, can you reset it", None),
    ("Stuck in a login redirect loop with SSO", None),
    ("RDP connection refused to my office desktop", None),
    ("OneDrive isn't syncing my files", None),
    ("I think I clicked a phishing link", None),
    ("My laptop is super slow today, not sure why", None),
    ("Wi-Fi is really slow compared to usual", None),
]
HR_SAMPLE_QUERIES = [
    ("How many sick days do I have left", None),
    ("What is the parental leave policy", None),
    ("Apply for 3 days of casual leave next week", None),
    ("How does annual leave carry-forward work", None),
    ("When is the next pay date", None),
    ("My payslip looks wrong this month", None),
    ("How do I submit my tax declaration", None),
    ("What's covered under the wellness benefit", None),
    ("How do I book business travel", None),
    ("What's the work from home policy", None),
    ("When is my performance review", None),
    ("How do I add my spouse to health insurance", None),
    ("I need to change my bank account for salary", None),
    ("What happens if I miss the tax declaration deadline", None),
    ("Can I take half a day of casual leave", None),
]
OTHER_QUERIES = [
    "Can you help me with something",
    "I have a question",
    "Not sure who to ask about this",
]

TICKET_SUMMARY_TEMPLATES_IT = [
    "User reported: {q}. Runbook steps were tried but the issue persists; escalated to IT for hands-on follow-up.",
    "User reported: {q}. No confident match found in the knowledge base for this specific case.",
]
TICKET_SUMMARY_TEMPLATES_HR = [
    "User asked: {q}. This requires a human judgment call HR should review directly.",
    "User asked: {q}. Routed to HR with full context since no policy article fully covers this case.",
]

PRIORITIES = ["low", "medium", "high", "urgent"]
PRIORITY_WEIGHTS = [0.35, 0.4, 0.2, 0.05]
TICKET_STATUSES = ["open", "in_progress", "waiting", "resolved", "closed"]
TICKET_STATUS_WEIGHTS = [0.15, 0.15, 0.1, 0.35, 0.25]

ACCESS_SYSTEMS = ["Finance System", "Salesforce", "AWS Console", "Payroll System", "Internal Wiki Admin"]
ACCESS_LEVELS = ["read", "write", "admin"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _random_past_dt(rng: random.Random, days_back: int) -> datetime:
    delta = timedelta(
        days=rng.randint(0, days_back),
        hours=rng.randint(7, 20),
        minutes=rng.randint(0, 59),
    )
    return _now() - delta


def generate_leave_balances(user_ids: list[str], rng: random.Random) -> list[dict]:
    rows = []
    for uid in user_ids:
        rows.append({"user_id": uid, "leave_type": "annual", "total_days": 24, "used_days": rng.randint(0, 18)})
        rows.append({"user_id": uid, "leave_type": "sick", "total_days": 12, "used_days": rng.randint(0, 8)})
        rows.append({"user_id": uid, "leave_type": "casual", "total_days": 7, "used_days": rng.randint(0, 6)})
        rows.append({"user_id": uid, "leave_type": "parental", "total_days": 112, "used_days": 0})
    return rows


def generate_payslips(users: list[dict], rng: random.Random) -> list[dict]:
    rows = []
    base_by_role = {"employee": 5200, "manager": 7800, "hr": 6500, "admin": 7200}
    months = []
    today = _now()
    for i in range(3, 0, -1):
        m = (today.replace(day=1) - timedelta(days=1)) if i == 1 else today
        # simple month label generation: step back i months from current
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        months.append(f"{year}-{month:02d}")

    for u in users:
        base = base_by_role.get(u["role"], 5000) + rng.randint(-300, 600)
        for month in months:
            tax = round(base * 0.22, 2)
            pension = round(base * 0.06, 2)
            insurance = round(base * 0.03, 2)
            gross = base
            net = round(gross - tax - pension - insurance, 2)
            rows.append({
                "user_id": u["id"], "month": month, "gross": gross, "net": net,
                "deductions": {"tax": tax, "pension": pension, "insurance": insurance},
            })
    return rows


def generate_access_requests_and_approvals(employees: list[dict], rng: random.Random, count: int = 80) -> tuple[list[dict], list[dict]]:
    approvals = []
    access_requests = []
    status_weights = [0.70, 0.15, 0.15]  # approved, rejected, pending
    for _ in range(count):
        user = rng.choice(employees)
        approver_id = user.get("manager_id")
        if not approver_id:
            continue
        status = rng.choices(["approved", "rejected", "pending"], weights=status_weights)[0]
        approval_id = str(uuid.uuid4())
        created_at = _random_past_dt(rng, 60)
        decided_at = created_at + timedelta(hours=rng.randint(1, 48)) if status != "pending" else None
        system = rng.choice(ACCESS_SYSTEMS)
        level = rng.choice(ACCESS_LEVELS)
        approvals.append({
            "id": approval_id,
            "run_id": None,
            "requester_id": user["id"],
            "approver_id": approver_id,
            "type": "access_request",
            "payload": {"system": system, "access_level": level},
            "status": status,
            "comment": "Approved for project work." if status == "approved" else (
                "Not needed for current role." if status == "rejected" else None
            ),
            "decided_at": decided_at,
            "created_at": created_at,
        })
        access_requests.append({
            "user_id": user["id"],
            "system": system,
            "access_level": level,
            "justification": f"Needed for ongoing work involving {system}.",
            "status": status,
            "approval_id": approval_id,
            "created_at": created_at,
        })
    return access_requests, approvals


def generate_leave_requests(employees: list[dict], rng: random.Random, count: int = 150) -> list[dict]:
    rows = []
    leave_types = ["annual", "sick", "casual", "parental"]
    status_weights = [0.75, 0.15, 0.10]
    for _ in range(count):
        user = rng.choice(employees)
        leave_type = rng.choices(leave_types, weights=[0.5, 0.25, 0.2, 0.05])[0]
        days = rng.choice([0.5, 1, 1, 2, 3, 5]) if leave_type != "parental" else rng.choice([28, 56, 112])
        created_at = _random_past_dt(rng, 60)
        start = created_at + timedelta(days=rng.randint(1, 30))
        end = start + timedelta(days=max(int(days) - 1, 0))
        status = rng.choices(["approved", "pending", "rejected"], weights=status_weights)[0]
        rows.append({
            "user_id": user["id"], "leave_type": leave_type,
            "start_date": start.date(), "end_date": end.date(), "days": days,
            "reason": "Personal", "status": status, "created_at": created_at,
        })
    return rows


def generate_tickets(users: list[dict], rng: random.Random, count: int = 200) -> tuple[list[dict], list[dict]]:
    tickets = []
    ticket_events = []
    assignable = [u for u in users if u["role"] in ("hr", "admin", "manager")]
    for i in range(count):
        user = rng.choice(users)
        is_it = rng.random() < 0.55
        if is_it:
            q, code = rng.choice(IT_SAMPLE_QUERIES)
            category = "IT"
            summary = rng.choice(TICKET_SUMMARY_TEMPLATES_IT).format(q=q)
        else:
            q, _ = rng.choice(HR_SAMPLE_QUERIES)
            category = "HR"
            summary = rng.choice(TICKET_SUMMARY_TEMPLATES_HR).format(q=q)

        status = rng.choices(TICKET_STATUSES, weights=TICKET_STATUS_WEIGHTS)[0]
        priority = rng.choices(PRIORITIES, weights=PRIORITY_WEIGHTS)[0]
        created_at = _random_past_dt(rng, 60)
        resolved_at = created_at + timedelta(hours=rng.randint(1, 72)) if status in ("resolved", "closed") else None
        assignee = rng.choice(assignable) if status != "open" and assignable else None

        ticket_id = str(uuid.uuid4())
        number = f"TCK-{1000 + i}"
        tickets.append({
            "id": ticket_id, "number": number, "user_id": user["id"], "run_id": None,
            "category": category, "priority": priority, "status": status, "summary": summary,
            "context": {"original_question": q}, "assignee_id": assignee["id"] if assignee else None,
            "resolved_at": resolved_at, "created_at": created_at,
        })
        ticket_events.append({
            "ticket_id": ticket_id, "actor": "tess", "type": "created",
            "note": "Ticket created automatically after the request could not be fully resolved.",
            "created_at": created_at,
        })
        if status in ("resolved", "closed") and assignee:
            ticket_events.append({
                "ticket_id": ticket_id, "actor": assignee["name"], "type": "resolved",
                "note": "Resolved and confirmed with the requester.", "created_at": resolved_at,
            })
        elif status == "in_progress" and assignee:
            ticket_events.append({
                "ticket_id": ticket_id, "actor": assignee["name"], "type": "status_change",
                "note": "Picked up and being worked on.",
                "created_at": created_at + timedelta(hours=rng.randint(1, 10)),
            })
    return tickets, ticket_events


def generate_historical_runs(
    users: list[dict], rng: random.Random, count: int = 300
) -> tuple[list[dict], list[dict], list[dict], list[dict], list[dict]]:
    """Returns (agent_runs, agent_events, feedback, bandit_decisions, bandit_rewards).

    Also incrementally updates in-memory LinUCBArm state per strategy so bandit_state can be
    seeded already "warmed up" (see docs/06_DECISIONS.md) — lexical_heavy tends to win for
    error-code queries, semantic_heavy for vague ones, matching the master prompt's intent.
    """
    runs, events, feedback_rows, decisions, rewards = [], [], [], [], []
    arms = {
        "lexical_heavy": LinUCBArm(),
        "semantic_heavy": LinUCBArm(),
        "hybrid_rerank": LinUCBArm(),
    }

    employees = [u for u in users if u["role"] == "employee"]

    for _ in range(count):
        user = rng.choice(employees)
        roll = rng.random()
        if roll < 0.45:
            route, (q, code) = "IT", rng.choice(IT_SAMPLE_QUERIES)
        elif roll < 0.85:
            route, (q, code) = "HR", rng.choice(HR_SAMPLE_QUERIES)
        else:
            route, q, code = "OTHER", rng.choice(OTHER_QUERIES), None

        created_at = _random_past_dt(rng, 60)
        hour = created_at.hour
        confidence = round(rng.uniform(0.6, 0.98), 2) if route != "OTHER" else round(rng.uniform(0.3, 0.54), 2)

        run_id = str(uuid.uuid4())
        seq = 1

        def emit(agent: str, status: str, action: str, caption: str, latency_ms: int, model: str | None = None, tin: int = 0, tout: int = 0):
            nonlocal seq
            events.append({
                "run_id": run_id, "seq": seq, "agent": agent, "status": status, "action": action,
                "caption": caption, "detail": {}, "model": model, "latency_ms": latency_ms,
                "tokens_in": tin, "tokens_out": tout, "ts": created_at + timedelta(milliseconds=sum_latency(seq, latency_ms)),
            })
            seq += 1

        def sum_latency(current_seq: int, this_latency: int) -> int:
            return current_seq * 150 + this_latency

        emit("guard", "completed", "privacy_check", "Gus checked the request and found nothing sensitive.", 15)
        emit("supervisor", "completed", "route", f"Sage read the message and routed it to {route}.", 180,
             model="llama-3.1-8b-instant", tin=120, tout=20)

        resolved = True
        status = "resolved"
        outcome = "resolved"
        needs_action = False
        unresolved = False

        if route in ("IT", "HR"):
            context_vec = build_context_vector(route, q, hour, confidence)
            arm_name, ucb_scores = select_arm(context_vec, arms)
            agent_name = "it_support" if route == "IT" else "hr_policy"
            friendly = "Iris" if route == "IT" else "Hana"
            model = "gemini-flash-lite"
            emit(agent_name, "retrieving", "hybrid_search", f"{friendly} is checking the {route} knowledge base.", 420, model=model, tin=400)
            unresolved = rng.random() < (0.12 if code else 0.2)
            if unresolved:
                resolved = False
                status = "escalated"
                outcome = "escalated"
                emit(agent_name, "completed", "answer", f"{friendly} couldn't find a confident answer.", 300, model=model, tout=80)
                emit("ticketing", "completed", "create_ticket", "Tess created a ticket with the full context for a human to review.", 200,
                     model="openai/gpt-oss-20b", tin=200, tout=60)
            else:
                emit(agent_name, "completed", "answer", f"{friendly} answered with a cited source.", 650, model=model, tout=180)
                needs_action = route == "HR" and rng.random() < 0.15
                if needs_action:
                    emit("action", "tool_call", "apply_leave", "Atlas applied the leave request.", 300,
                         model="openai/gpt-oss-20b", tin=150, tout=40)

            decision_id = str(uuid.uuid4())
            decisions.append({
                "id": decision_id, "run_id": run_id, "context": {"dept": route, "query": q, "hour": hour},
                "arm_id_name": arm_name, "ucb_scores": ucb_scores, "created_at": created_at,
            })
            rating = rng.choices([5, 4, 3, 2, 1], weights=[0.4, 0.3, 0.15, 0.1, 0.05])[0] if resolved else rng.choices([3, 2, 1], weights=[0.2, 0.4, 0.4])[0]
            reward = compute_reward(rating, resolved)
            arms[arm_name].update(context_vec, reward)
            rewards.append({"decision_id": decision_id, "reward": reward, "created_at": created_at})
            feedback_rows.append({
                "run_id": run_id, "rating": rating, "resolved": resolved,
                "comment": None, "created_at": created_at,
            })
        else:
            emit("supervisor", "completed", "clarify", "Sage wasn't confident and asked a clarifying question.", 100)
            rating = rng.choices([4, 3, 2], weights=[0.3, 0.4, 0.3])[0]
            resolved = rng.random() < 0.5
            status = "resolved" if resolved else "failed"
            outcome = status
            feedback_rows.append({
                "run_id": run_id, "rating": rating, "resolved": resolved,
                "comment": None, "created_at": created_at,
            })

        total_latency = seq * 200 + rng.randint(100, 900)
        runs.append({
            "id": run_id, "user_id": user["id"], "conversation_id": None, "query": q,
            "route": route, "status": status, "total_latency_ms": total_latency,
            "tokens_in": sum(e["tokens_in"] for e in events if e["run_id"] == run_id),
            "tokens_out": sum(e["tokens_out"] for e in events if e["run_id"] == run_id),
            "cost_usd": round(rng.uniform(0.0005, 0.01), 5), "outcome": outcome,
            "created_at": created_at,
        })

    arm_state = {name: arm.to_json() for name, arm in arms.items()}
    return runs, events, feedback_rows, decisions, rewards, arm_state  # type: ignore[return-value]
