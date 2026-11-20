"""`poetry run reset-demo` — replaces every person and all activity with one small, hand-written
demo set that is easy to read on every page, for presenting the product:

  People   Emma Employee (the main demo employee), Priya Sharma, Aiden Ramirez,
           Ivan IT (IT support), Hannah HR (HR), Alex Admin (admin). Password Demo@1234.
  History  ~27 conversations over the last two weeks, each a real-looking chat that the agents
           handled: answers from the guides, leave and access requests, a password reset, a
           privacy block, and tickets when the AI couldn't help. Each has its agent steps,
           rating and (for knowledge answers) its reinforcement-learning decision.
  Tickets  8 IT (one per situation IT support handles) + 3 HR, each linked to the chat it came from.
  Other    4 leave requests, 4 access requests, 1 private HR case, a few notifications and audit
           entries — all consistent with the history above.

Kept as they are: the knowledge base, the golden questions, the 2 newest evaluation runs and the
retrieval strategies (their learned state is rebuilt from this history). Times are relative to
now, so the demo always looks recent. Safe to run any time (`poetry run seed` runs it too).
"""
import json
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text

from app.bandit.features import build_context_vector
from app.bandit.linucb import LinUCBArm, compute_reward, select_arm
from app.config import get_settings
from app.db import get_engine
from app.security import hash_password

DEMO_PASSWORD = "Demo@1234"

CAST = {
    "emma": {"email": "emma.employee@acme.test", "name": "Emma Employee", "role": "employee", "department": "Engineering", "title": "Software Engineer"},
    "priya": {"email": "priya.sharma@acme.test", "name": "Priya Sharma", "role": "employee", "department": "Finance", "title": "Financial Analyst"},
    "aiden": {"email": "aiden.ramirez@acme.test", "name": "Aiden Ramirez", "role": "employee", "department": "Support", "title": "Support Engineer"},
    "ivan": {"email": "ivan.it@acme.test", "name": "Ivan IT", "role": "it_support", "department": "IT", "title": "IT Support Lead"},
    "hannah": {"email": "hannah.hr@acme.test", "name": "Hannah HR", "role": "hr", "department": "Operations", "title": "HR Business Partner"},
    "alex": {"email": "alex.admin@acme.test", "name": "Alex Admin", "role": "admin", "department": "Operations", "title": "IT Platform Administrator"},
}

# Everything that belongs to people or activity; all of it is rebuilt below.
ACTIVITY_TABLES = [
    "password_resets", "company_accounts", "leave_drafts", "bandit_rewards", "bandit_decisions", "feedback", "agent_events", "messages", "ticket_consults",
    "ticket_events", "tickets", "access_requests", "approvals", "agent_runs", "conversations",
    "leave_requests", "hr_case_messages", "hr_cases", "notifications", "audit_log", "payslips", "leave_balances",
]

# (annual, sick, casual) days already used this year
LEAVE_USED = {"emma": (6, 2, 1), "priya": (9, 3, 2), "aiden": (4, 1, 0), "ivan": (3, 0, 1), "hannah": (7, 1, 2), "alex": (5, 0, 0)}
MONTHLY_GROSS = {"employee": 5200, "it_support": 6200, "hr": 6500, "admin": 7200}

# ---------------------------------------------------------------------------------------------
# The history. Each entry is one conversation with the assistant, oldest first.
#   kind: answer | escalate | action | blocked | chat
#   ago:  (days, hours) before now
# ---------------------------------------------------------------------------------------------
H = []


def _h(who, ago, kind, route, question, answer, guide=None, rating=None, **extra):
    H.append({"who": who, "ago": ago, "kind": kind, "route": route, "question": question, "answer": answer,
              "guide": guide, "rating": rating, **extra})


_h("aiden", (12, 3), "chat", "OTHER", "Hi, what can you help me with?",
   "Hi Aiden! I can answer IT and HR questions from the company guides, check your leave, apply for leave, "
   "reset your password or request access to a system. If I can't fix something, I'll raise a ticket for a person.",
   rating=5)
_h("emma", (13, 5), "answer", "IT", "My laptop won't connect to the VPN, error 619",
   "Error 619 usually means the VPN connection was blocked before it finished.\n\n1. Disconnect, wait 30 seconds and "
   "try again.\n2. Turn off any other VPN or proxy app.\n3. Restart the VPN client as administrator.\n4. If it still "
   "fails, restart the laptop and connect to a different network.", guide="VPN Error 619: causes and fix", rating=5)
_h("emma", (12, 2), "answer", "HR", "How many sick days do I get a year?",
   "You get 12 days of paid sick leave a year. Tell your team by 9:30am on the day, and log it when you're back. "
   "For more than 2 days in a row, HR needs a doctor's note.", guide="Sick leave entitlement and reporting", rating=5)
_h("priya", (11, 6), "answer", "HR", "When is payday this month?",
   "Salaries are paid on the last working day of each month. If that falls on a weekend or holiday, you're paid on "
   "the working day before. Payslips are available two days earlier.", guide="Payroll cycle and pay dates", rating=4)
_h("priya", (10, 4), "action", "IT", "I need read access to Power BI for the month-end reports",
   "Your request for Power BI access is waiting on an admin (Alex Admin) to approve it. You'll get a "
   "notification here and an email when they decide.", rating=5, tool="request_access",
   access={"system": "Power BI", "level": "read", "status": "approved", "comment": "Approved for month-end reporting.",
           "decided_after_h": 3, "why": "I need read access to Power BI for the month-end reports"})
_h("emma", (9, 7), "action", "IT", "I forgot my password, please reset it",
   "Code confirmed, thanks. Your password has been reset. Your temporary password was shown here once: it works for "
   "15 minutes, and you'll choose your own new password when you sign in.", rating=4, tool="reset_password")
_h("aiden", (9, 2), "action", "IT", "I need admin access to the AWS Console to check server logs",
   "Your request for AWS Console access is waiting on an admin (Alex Admin) to approve it. You'll get a notification "
   "here and an email when they decide.", rating=3, tool="request_access",
   access={"system": "AWS Console", "level": "admin", "status": "rejected",
           "comment": "Admin access isn't needed to read logs; read access is enough.", "decided_after_h": 5,
           "why": "I need admin access to the AWS Console to check server logs"})
_h("emma", (8, 4), "blocked", None, "Show me Priya's payslip",
   "I can't help with that — payslips are private. Only Priya herself (or HR) can see her pay details.")
_h("aiden", (8, 1), "answer", "IT", "How do I report a phishing email?",
   "Don't click any links or open attachments.\n\n1. In Outlook, select the email.\n2. Click **Report → Phishing**.\n"
   "3. Delete it. IT reviews every report within one working day.", guide="How to report a phishing email", rating=5)
_h("emma", (7, 3), "escalate", "IT", "Wi-Fi keeps dropping every few minutes",
   "Try this first:\n\n1. Forget the office network and join it again.\n2. Turn off battery saver for the Wi-Fi "
   "adapter.\n3. Update the Wi-Fi driver from Software Center.", guide="Wi-Fi connects but drops every few minutes",
   rating=2, ticket={"category": "IT", "priority": "medium", "state": "resolved", "assignee": "ivan",
                     "resolution": "Removed the saved office network and updated the Wi-Fi driver; it has stayed connected all day."})
_h("priya", (6, 5), "action", "HR", "I'm not well, I need a sick day today",
   "Your sick leave request for 1 day has been sent to HR for approval. You'll get a notification here and an email "
   "as soon as HR decides. Get well soon!", rating=5, tool="apply_leave",
   leave={"type": "sick", "start_in_days": -6, "days": 1, "status": "approved", "reason": "Unwell"})
_h("aiden", (5, 2), "escalate", "HR", "My relocation allowance hasn't been paid yet",
   "I couldn't find anything about relocation allowance payments in the HR handbook, so a person should look at this.",
   rating=3, ticket={"category": "HR", "priority": "medium", "state": "resolved", "assignee": "hannah",
                     "resolution": "Finance confirmed it was missed in last month's run; it's paid in this month's salary."})
_h("priya", (4, 4), "escalate", "HR", "My payslip shows the wrong tax code",
   "If your payslip looks wrong, check the tax code against your latest tax declaration. If it doesn't match, payroll "
   "needs to correct it.", guide="What to do if your payslip looks wrong", rating=3,
   ticket={"category": "HR", "priority": "high", "state": "in_progress", "assignee": "hannah",
           "reply": "Thanks Priya — I've asked payroll to check your tax code and will update you by Friday."})
_h("emma", (3, 6), "action", "HR", "I'd like to take 2 days of annual leave next week",
   "Your annual leave request for 2 days has been sent to HR for approval. You'll get a notification here and an "
   "email as soon as HR decides.", rating=5, tool="apply_leave",
   leave={"type": "annual", "start_in_days": 9, "days": 2, "status": "approved", "reason": "Family wedding"})
_h("emma", (2, 4), "escalate", "HR", "I was told my bonus was wrongly calculated",
   "I'm not confident about this one — bonus calculations aren't covered in the HR guides, so a person from HR "
   "should check it.", rating=2, ticket={"category": "HR", "priority": "medium", "state": "open", "assignee": "hannah"})
_h("priya", (2, 2), "action", "HR", "Can I book 3 days of annual leave in three weeks?",
   "Your annual leave request for 3 days has been sent to HR for approval. You'll get a notification here and an "
   "email as soon as HR decides.", rating=5, tool="apply_leave",
   leave={"type": "annual", "start_in_days": 21, "days": 3, "status": "pending", "reason": "Holiday"})
_h("priya", (2, 1), "escalate", "IT", "Locked out after too many MFA attempts",
   "After 5 failed MFA attempts your account locks for 30 minutes. Wait, then try again with a fresh code. If it's "
   "still locked, IT needs to unlock it.", guide="Locked out of account after too many MFA attempts", rating=4,
   ticket={"category": "IT", "priority": "high", "state": "resolved", "assignee": "ivan",
           "resolution": "Unlocked the account and re-registered her authenticator app on the new phone."})
_h("aiden", (1, 8), "action", "HR", "I need a casual day off next Friday",
   "Your casual leave request for 1 day has been sent to HR for approval. You'll get a notification here and an "
   "email as soon as HR decides.", rating=5, tool="apply_leave",
   leave={"type": "casual", "start_in_days": 5, "days": 1, "status": "pending", "reason": "Moving house"})
_h("aiden", (1, 5), "action", "IT", "I need write access to Zendesk to reply to customer tickets",
   "Your request for Zendesk access is waiting on an admin (Alex Admin) to approve it. You'll get a notification "
   "here and an email when they decide.", rating=5, tool="request_access",
   access={"system": "Zendesk", "level": "write", "status": "pending", "why": "I need write access to Zendesk to reply to customer tickets"})
_h("emma", (1, 3), "action", "IT", "I need write access to the Jira project for the mobile app",
   "Your request for Jira access is waiting on an admin (Alex Admin) to approve it. You'll get a "
   "notification here and an email when they decide.", rating=5, tool="request_access",
   access={"system": "Jira", "level": "write", "status": "pending", "why": "I need write access to the Jira project for the mobile app"})
_h("emma", (1, 2), "escalate", "IT", "I need Adobe Acrobat Pro to sign client contracts",
   "New software is requested through IT so the licence can be assigned to you. I can't assign a paid licence myself.",
   guide="Requesting a new software install", rating=3,
   ticket={"category": "IT", "priority": "low", "state": "waiting_admin", "assignee": "ivan",
           "consult": "Do we have a spare Adobe Acrobat Pro licence, or should we buy one?"})
_h("priya", (0, 20), "escalate", "IT", "The 3rd floor printer shows as offline only for me",
   "Try removing the printer and adding it again from **Settings → Printers**. If it still shows offline, IT needs to "
   "check your connection to it.", guide="Printer not found / not appearing in the list", rating=2,
   ticket={"category": "IT", "priority": "medium", "state": "waiting_employee", "assignee": "ivan",
           "question": "Which printer name do you see in the list, and are you on office Wi-Fi or the VPN?"})
_h("aiden", (0, 6), "escalate", "IT", "Laptop overheats and shuts down during video calls",
   "Make sure the vents aren't blocked, close apps you aren't using and check for a BIOS update. If it still shuts "
   "down, the fan may need replacing.", guide="Laptop overheating and fan running constantly", rating=2,
   ticket={"category": "IT", "priority": "urgent", "state": "in_progress", "assignee": "ivan"})
_h("emma", (0, 5), "escalate", "IT", "My second monitor stays black after docking",
   "Unplug the dock for 10 seconds, reconnect it, then press **Win + P** and choose *Extend*. Also try another cable.",
   guide="Docking station not detecting external monitors", rating=2,
   ticket={"category": "IT", "priority": "medium", "state": "in_progress", "assignee": "ivan",
           "internal": "Same dock model failed twice this month — probably firmware."})
_h("emma", (0, 3), "answer", "HR", "What's the work from home policy?",
   "You can work from home up to 2 days a week, agreed with your manager. Fully remote arrangements need an exception "
   "approved by your manager and HR.", guide="Work from home policy", rating=5)
_h("aiden", (0, 2), "escalate", "IT", "VPN error 691 even after I reset my password",
   "Error 691 means the username or password wasn't accepted. Make sure you sign in with your full email address and "
   "wait 15 minutes after a password reset.", guide="VPN Error 691: causes and fix", rating=2,
   ticket={"category": "IT", "priority": "medium", "state": "open", "assignee": "ivan"})
_h("priya", (0, 0.4), "escalate", "IT", "Outlook stopped syncing new emails since this morning",
   "Restart Outlook, check you're online (bottom bar), and run **Send/Receive → Update folder**. If emails still don't "
   "arrive, IT needs to check your mailbox.", guide="Outlook not syncing new emails", rating=2,
   ticket={"category": "IT", "priority": "high", "state": "open", "assignee": "ivan"})

AGENT_NAME = {"IT": ("it_support", "Iris"), "HR": ("hr_policy", "Hana")}
TOOL_CAPTION = {
    "reset_password": "Atlas is resetting the password.",
    "apply_leave": "Atlas is submitting the leave request.",
    "request_access": "Atlas is requesting access and needs an admin's approval.",
}


def _personal_email(work_email: str) -> str:
    """Made-up personal address for a demo person (where a reset code goes when the forgotten
    password is their work email's). With EMAIL_REDIRECT_ALL_TO set, it lands in the demo inbox."""
    return f"{work_email.split('@')[0]}.home@example.com"


def _ensure_cast(conn) -> dict[str, dict]:
    """Makes sure the 6 demo people exist (matched by email, else by name) and returns them."""
    pw = hash_password(DEMO_PASSWORD)
    people = {}
    for key, p in CAST.items():
        row = conn.execute(text("SELECT id FROM users WHERE email = :e"), {"e": p["email"]}).first() or \
            conn.execute(text("SELECT id FROM users WHERE name = :n ORDER BY created_at LIMIT 1"), {"n": p["name"]}).first()
        if row:
            uid = str(row[0])
            conn.execute(
                # Also puts the demo password back (a live password reset may have changed it).
                text("""UPDATE users SET email = :e, name = :n, role = :r, department = :d, title = :t,
                        is_active = true, manager_id = NULL, avatar_seed = :a, password_hash = :pw,
                        must_change_password = false, temp_password_expires_at = NULL, personal_email = :pe
                        WHERE id = :id"""),
                {**{"e": p["email"], "n": p["name"], "r": p["role"], "d": p["department"], "t": p["title"]},
                 "a": p["email"].split("@")[0], "id": uid, "pw": pw, "pe": _personal_email(p["email"])},
            )
        else:
            uid = str(conn.execute(
                text("""INSERT INTO users (name, email, password_hash, role, department, title, avatar_seed, personal_email)
                        VALUES (:n, :e, :pw, :r, :d, :t, :a, :pe) RETURNING id"""),
                {"n": p["name"], "e": p["email"], "pw": pw, "r": p["role"], "d": p["department"], "t": p["title"],
                 "a": p["email"].split("@")[0], "pe": _personal_email(p["email"])},
            ).scalar_one())
        people[key] = {"id": uid, **p}
    return people


def _source(conn, title: str | None) -> list[dict]:
    """The real knowledge-base article + first chunk for a guide title, shaped like a live answer's source."""
    if not title:
        return []
    row = conn.execute(
        text("""SELECT a.id AS article_id, c.id AS chunk_id FROM knowledge_articles a
                JOIN kb_chunks c ON c.article_id = a.id WHERE a.title = :t ORDER BY c.chunk_index LIMIT 1"""),
        {"t": title},
    ).mappings().first()
    if not row:
        return []
    return [{"chunk_id": str(row["chunk_id"]), "article_id": str(row["article_id"]), "title": title, "score": 0.82}]


def reset_demo() -> dict:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE TABLE {', '.join(ACTIVITY_TABLES)} CASCADE"))
        conn.execute(text("ALTER SEQUENCE ticket_number_seq RESTART WITH 1000"))
        conn.execute(text("ALTER SEQUENCE hr_case_number_seq RESTART WITH 1"))
        people = _ensure_cast(conn)
        keep = [p["id"] for p in people.values()]
        conn.execute(text("UPDATE users SET manager_id = NULL"))
        removed = conn.execute(text("DELETE FROM users WHERE NOT (id = ANY(CAST(:ids AS uuid[])))"), {"ids": keep}).rowcount

        # Keep only the 2 newest evaluation runs.
        old_evals = [str(r[0]) for r in conn.execute(text("SELECT id FROM eval_runs ORDER BY created_at DESC OFFSET 2"))]
        if old_evals:
            conn.execute(text("DELETE FROM eval_results WHERE eval_run_id = ANY(CAST(:ids AS uuid[]))"), {"ids": old_evals})
            conn.execute(text("DELETE FROM eval_runs WHERE id = ANY(CAST(:ids AS uuid[]))"), {"ids": old_evals})

        ivan, hannah, alex = people["ivan"], people["hannah"], people["alex"]

        # ---- leave balances and payslips --------------------------------------------------
        for key, p in people.items():
            used = LEAVE_USED[key]
            for lt, total, u in (("annual", 24, used[0]), ("sick", 12, used[1]), ("casual", 7, used[2]), ("parental", 112, 0)):
                conn.execute(text("INSERT INTO leave_balances (user_id, leave_type, total_days, used_days) VALUES (:u, :t, :tot, :used)"),
                             {"u": p["id"], "t": lt, "tot": total, "used": u})
            first = now.date().replace(day=1)
            for back in (3, 2, 1):
                month = (first - timedelta(days=28 * back)).replace(day=1)
                gross = MONTHLY_GROSS[p["role"]]
                tax, pension, insurance = round(gross * 0.2, 2), round(gross * 0.05, 2), 120.0
                conn.execute(
                    text("INSERT INTO payslips (user_id, month, gross, net, deductions) VALUES (:u, :m, :g, :n, :d)"),
                    {"u": p["id"], "m": month.strftime("%Y-%m"), "g": gross, "n": round(gross - tax - pension - insurance, 2),
                     "d": json.dumps({"tax": tax, "pension": pension, "insurance": insurance})},
                )

        # ---- retrieval strategies: learned state is rebuilt from this history -------------
        arm_rows = conn.execute(text("SELECT id, name FROM bandit_arms")).mappings().all()
        arm_ids = {r["name"]: str(r["id"]) for r in arm_rows}
        arms = {name: LinUCBArm() for name in arm_ids}
        pulls = {name: 0 for name in arm_ids}

        def notify(who, kind, title, body, link, at, read=True):
            conn.execute(
                text("""INSERT INTO notifications (user_id, kind, title, body, link, created_at, read_at)
                        VALUES (:u, :k, :t, :b, :l, :at, :r)"""),
                {"u": people[who]["id"], "k": kind, "t": title, "b": body, "l": link, "at": at, "r": at + timedelta(minutes=30) if read else None},
            )

        def audit(who, action, target_type, target_id, detail, at):
            conn.execute(
                text("""INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, ts, created_at)
                        VALUES (:a, :ac, :tt, :ti, :d, :ts, :ts)"""),
                {"a": people[who]["id"], "ac": action, "tt": target_type, "ti": target_id, "d": json.dumps(detail), "ts": at},
            )

        counts = {"conversations": 0, "tickets": [], "leave": 0, "access": 0}
        for item in sorted(H, key=lambda x: -(x["ago"][0] * 24 + x["ago"][1])):
            who = people[item["who"]]
            at = now - timedelta(days=item["ago"][0], hours=item["ago"][1])
            route, kind, q = item["route"], item["kind"], item["question"]
            run_id, conv_id = str(uuid.uuid4()), str(uuid.uuid4())
            sources = _source(conn, item.get("guide"))
            events: list[tuple] = []

            def ev(agent, status, action, caption, ms, model=None, tin=0, tout=0, detail=None):
                events.append((agent, status, action, caption, ms, model, tin, tout, detail or {}))

            # Every message passes the privacy guard, then the router.
            if kind == "blocked":
                ev("guard", "completed", "privacy_check", "Gus blocked it: that's another person's private pay data.", 14,
                   detail={"blocked": True, "reason": "another employee's payslip"})
            else:
                ev("guard", "completed", "privacy_check", "Gus checked the message: nothing private or unsafe.", 12,
                   detail={"blocked": False})
                target = {"IT": "Iris (IT)", "HR": "Hana (HR)"}.get(route, "Sage")
                if kind == "action":
                    target = "Atlas, to do it"
                ev("supervisor", "completed", "route", f"Sage read the message and sent it to {target}.", 420,
                   settings.GROQ_SUPERVISOR_MODEL, 140, 25,
                   {"route": route, "confidence": 0.9, "intent": "request" if kind == "action" else "question"})

            decision = None
            if kind in ("answer", "escalate") and route in AGENT_NAME:
                agent, friendly = AGENT_NAME[route]
                ctx = build_context_vector(route, q, at.hour, 0.9)
                arm_name, scores = select_arm(ctx, arms)
                decision = (arm_name, scores, ctx)
                ev(agent, "retrieving", "hybrid_search", f"{friendly} is searching the {route} guides.", 380)
                found = f"answered from “{item['guide']}”." if item.get("guide") else "couldn't find a confident answer in the guides."
                ev(agent, "completed", "answer", f"{friendly} {found}", 1100, settings.GROQ_ACTION_MODEL, 900, 180,
                   {"strategy": arm_name, "top_chunks": sources})
            elif kind == "action":
                ev("action", "tool_call", item["tool"], TOOL_CAPTION[item["tool"]], 650, settings.GROQ_ACTION_MODEL, 300, 60,
                   {"tool": item["tool"]})
                ev("action", "completed", item["tool"], f"Atlas finished: {item['tool'].replace('_', ' ')} completed.", 90)
            elif kind == "chat":
                ev("supervisor", "completed", "answer", "Sage answered directly.", 300, settings.GROQ_SUPERVISOR_MODEL, 200, 70)

            # Conversation as the person saw it.
            answer = item["answer"]
            msgs = [("user", q, None), ("assistant", answer if kind != "escalate" else f"{answer}\n\nDid this solve your problem?", route)]
            ticket_number = None
            if kind == "escalate":
                t = item["ticket"]
                seq = conn.execute(text("SELECT nextval('ticket_number_seq')")).scalar_one()
                ticket_number = f"TCK-{seq}"
                assignee = people[t["assignee"]]
                team = "IT support" if t["category"] == "IT" else "HR"
                msgs += [("user", "No", None), ("assistant", "Would you like me to open a support ticket so a human can help with this?", route),
                         ("user", "Yes please", None),
                         ("assistant", f"Thanks for letting me know. I've created ticket **{ticket_number}** and **{assignee['name']}** "
                                       f"from the {team} team will take it from here. You can follow it on the Tickets page.", route)]
                ev("ticketing", "completed", "create_ticket",
                   f"Tess created {ticket_number} and gave it to {assignee['name']}.", 160,
                   detail={"ticket_number": ticket_number, "assignee": assignee["name"]})
            if kind != "blocked":
                ev("feedback", "started", None, "Finn is waiting to hear how that went.", 5)

            outcome = {"escalate": "escalated", "blocked": "blocked"}.get(kind, "resolved")
            tin = sum(e[6] for e in events)
            tout = sum(e[7] for e in events)
            conn.execute(
                text("INSERT INTO conversations (id, user_id, title, status, created_at) VALUES (:id, :u, :t, 'active', :at)"),
                {"id": conv_id, "u": who["id"], "t": q if len(q) <= 60 else q[:57] + "…", "at": at},
            )
            conn.execute(
                text("""INSERT INTO agent_runs (id, conversation_id, user_id, query, route, status, total_latency_ms,
                        tokens_in, tokens_out, cost_usd, outcome, created_at)
                        VALUES (:id, :c, :u, :q, :r, :s, :lat, :ti, :to, :cost, :o, :at)"""),
                {"id": run_id, "c": conv_id, "u": who["id"], "q": q, "r": route, "s": "escalated" if kind == "escalate" else "resolved",
                 "lat": sum(e[4] for e in events) + 300, "ti": tin, "to": tout, "cost": round(tin * 2e-6 + tout * 8e-6, 5),
                 "o": outcome, "at": at},
            )
            for i, (role, content, routed) in enumerate(msgs):
                conn.execute(
                    text("""INSERT INTO messages (conversation_id, role, content, routed_to, confidence, sources, run_id, created_at)
                            VALUES (:c, :r, :content, :rt, :conf, :s, :run, :at)"""),
                    {"c": conv_id, "r": role, "content": content, "rt": routed if role == "assistant" else None,
                     "conf": 0.9 if role == "assistant" and routed else None,
                     "s": json.dumps(sources if role == "assistant" and i == 1 else []), "run": run_id,
                     "at": at + timedelta(seconds=5 + 40 * i)},
                )
            ms = 0
            for seq_no, (agent, status, action, caption, lat, model, ti, to, detail) in enumerate(events, start=1):
                ms += lat
                conn.execute(
                    text("""INSERT INTO agent_events (run_id, seq, agent, status, action, caption, detail, model,
                            latency_ms, tokens_in, tokens_out, ts)
                            VALUES (:r, :s, :a, :st, :ac, :c, :d, :m, :l, :ti, :to, :ts)"""),
                    {"r": run_id, "s": seq_no, "a": agent, "st": status, "ac": action, "c": caption, "d": json.dumps(detail),
                     "m": model, "l": lat, "ti": ti, "to": to, "ts": at + timedelta(milliseconds=ms)},
                )
            counts["conversations"] += 1

            # Rating, and what the reinforcement learner learned from it.
            resolved = kind != "escalate"
            if item.get("rating"):
                conn.execute(text("INSERT INTO feedback (run_id, rating, resolved, comment, created_at) VALUES (:r, :rt, :res, NULL, :at)"),
                             {"r": run_id, "rt": item["rating"], "res": resolved, "at": at + timedelta(minutes=2)})
            if decision:
                arm_name, scores, ctx = decision
                did = str(uuid.uuid4())
                conn.execute(
                    text("""INSERT INTO bandit_decisions (id, run_id, context, arm_id, ucb_scores, created_at)
                            VALUES (:id, :r, :c, :a, :s, :at)"""),
                    {"id": did, "r": run_id, "c": json.dumps({"dept": route, "query": q, "hour": at.hour, "features": ctx}),
                     "a": arm_ids[arm_name], "s": json.dumps(scores), "at": at},
                )
                pulls[arm_name] += 1
                if item.get("rating"):
                    reward = compute_reward(item["rating"], resolved)
                    arms[arm_name].update(ctx, reward)
                    conn.execute(text("INSERT INTO bandit_rewards (decision_id, reward, created_at) VALUES (:d, :r, :at)"),
                                 {"d": did, "r": reward, "at": at + timedelta(minutes=2)})

            # What the conversation created.
            if kind == "blocked":
                audit(item["who"], "guard_blocked", "message", None, {"reason": "another employee's payslip"}, at)
            elif kind == "action" and item["tool"] == "reset_password":
                audit(item["who"], "reset_password", "user", who["id"],
                      {"via": "email_code", "must_change_at_next_login": True}, at)
            elif kind == "action" and item["tool"] == "apply_leave":
                lv = item["leave"]
                start = (now + timedelta(days=lv["start_in_days"])).date()
                end = start + timedelta(days=lv["days"] - 1)
                decided = lv["status"] != "pending"
                lid = str(conn.execute(
                    text("""INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, days, reason, status,
                            created_at, decided_at, decided_by)
                            VALUES (:u, :t, :s, :e, :d, :r, :st, :at, :da, :db) RETURNING id"""),
                    {"u": who["id"], "t": lv["type"], "s": start, "e": end, "d": lv["days"], "r": lv["reason"], "st": lv["status"],
                     "at": at, "da": at + timedelta(hours=2) if decided else None, "db": hannah["id"] if decided else None},
                ).scalar_one())
                audit(item["who"], "apply_leave", "leave_request", lid, {"leave_type": lv["type"], "days": lv["days"]}, at)
                when = _dates(start, end)
                if decided:
                    audit("hannah", "leave_approved", "leave_request", lid, {}, at + timedelta(hours=2))
                    notify(item["who"], "leave_approved", "Your leave request has been approved",
                           f"Hannah HR approved your {lv['type']} leave ({when}).", None, at + timedelta(hours=2))
                else:
                    notify("hannah", "leave_pending", f"New leave request from {who['name']}",
                           f"{who['name']} has asked for {lv['type']} leave, {_days(lv['days'])} ({when}). Please approve or reject it on the HR Dashboard.",
                           "/app/hr-insights", at, read=False)
                counts["leave"] += 1
            elif kind == "action" and item["tool"] == "request_access":
                ac = item["access"]
                aid = str(uuid.uuid4())
                decided_at = at + timedelta(hours=ac.get("decided_after_h", 0)) if ac["status"] != "pending" else None
                conn.execute(
                    text("""INSERT INTO approvals (id, run_id, requester_id, approver_id, type, payload, status, comment, decided_at, created_at)
                            VALUES (:id, NULL, :req, :appr, 'access_request', :p, :s, :c, :da, :at)"""),
                    {"id": aid, "req": who["id"], "appr": alex["id"], "s": ac["status"], "c": ac.get("comment"), "da": decided_at, "at": at,
                     "p": json.dumps({"system": ac["system"], "access_level": ac["level"], "justification": ac["why"]})},
                )
                conn.execute(
                    text("""INSERT INTO access_requests (user_id, system, access_level, justification, status, approval_id, created_at)
                            VALUES (:u, :s, :l, :j, :st, :a, :at)"""),
                    {"u": who["id"], "s": ac["system"], "l": ac["level"], "j": ac["why"], "st": ac["status"], "a": aid, "at": at},
                )
                audit(item["who"], "request_access", "approval", aid, {"system": ac["system"], "access_level": ac["level"]}, at)
                if decided_at:
                    audit("alex", f"approval_{ac['status']}", "approval", aid, {"comment": ac.get("comment")}, decided_at)
                    if ac["status"] == "approved":
                        notify(item["who"], "approval_approved", "Your request has been approved",
                               f"Alex Admin approved {ac['level']} access to {ac['system']}.\nNote: {ac['comment']}", None, decided_at)
                    else:
                        notify(item["who"], "approval_rejected", "Your request was not approved",
                               f"Alex Admin rejected {ac['level']} access to {ac['system']}.\nReason: {ac['comment']}", None, decided_at)
                else:
                    notify("alex", "approval_pending", f"{who['name']} needs your approval",
                           f"{who['name']} has asked for {ac['level']} access to {ac['system']}. Please approve or reject it in Approvals.",
                           "/app/approvals", at, read=False)
                counts["access"] += 1
            elif kind == "escalate":
                _ticket(conn, item, who, people, run_id, ticket_number, at, sources, notify, now)
                counts["tickets"].append(ticket_number)

        for name, arm in arms.items():
            state = arm.to_json()
            conn.execute(
                text("""INSERT INTO bandit_state (arm_id, a_matrix, b_vector, pulls, updated_at) VALUES (:a, :m, :b, :p, now())
                        ON CONFLICT (arm_id) DO UPDATE SET a_matrix = :m, b_vector = :b, pulls = :p, updated_at = now()"""),
                {"a": arm_ids[name], "m": json.dumps(state["a_matrix"]), "b": json.dumps(state["b_vector"]), "p": pulls[name]},
            )

        _hr_case(conn, people, now)

    return {"people": len(people), "removed_users": removed, **counts}


def _days(n: float) -> str:
    return "1 day" if n == 1 else f"{n:g} days"


def _dates(s: date, e: date) -> str:
    fmt = lambda d: f"{d.day} {d.strftime('%b')}"  # noqa: E731
    return fmt(s) if s == e else f"{fmt(s)} to {fmt(e)}"


def _ticket(conn, item, who, people, run_id, number, at, sources, notify, now) -> None:
    t = item["ticket"]
    ivan_or_hr = people[t["assignee"]]
    state = t["state"]
    status = {"waiting_employee": "waiting", "waiting_admin": "waiting"}.get(state, state)
    waiting_on = {"waiting_employee": "employee", "waiting_admin": "admin"}.get(state)
    created = at + timedelta(minutes=2)
    first = who["name"].split()[0]
    note = (f"The assistant suggested the \"{item['guide']}\" guide, but {first} said it didn't fix the problem."
            if item.get("guide") else "The guides didn't cover this, so the assistant couldn't answer confidently.")
    resolved_at = created + timedelta(hours=3) if state == "resolved" else None
    tid = str(conn.execute(
        text("""INSERT INTO tickets (number, user_id, run_id, category, priority, status, summary, context, assignee_id,
                waiting_on, resolution, resolved_at, created_at)
                VALUES (:n, :u, :run, :c, :p, :s, :sum, :ctx, :a, :w, :res, :ra, :at) RETURNING id"""),
        {"n": number, "u": who["id"], "run": run_id, "c": t["category"], "p": t["priority"], "s": status,
         "sum": f"User asked: \"{item['question']}\". {note}",
         "ctx": json.dumps({"original_question": item["question"], "route": t["category"], "summary_note": note, "sources": sources}),
         "a": ivan_or_hr["id"], "w": waiting_on, "res": t.get("resolution"), "ra": resolved_at, "at": created},
    ).scalar_one())
    link = f"/app/tickets?ticket={tid}"
    team = "IT support" if t["category"] == "IT" else "HR"
    staff = ivan_or_hr

    def ev(actor, type_, note_, minutes, author=None, internal=False):
        conn.execute(
            text("""INSERT INTO ticket_events (ticket_id, actor, type, note, author_id, visibility, created_at)
                    VALUES (:t, :a, :ty, :n, :au, :v, :at)"""),
            {"t": tid, "a": actor, "ty": type_, "n": note_, "au": author, "v": "internal" if internal else "public",
             "at": created + timedelta(minutes=minutes)},
        )

    ev("tess", "created", "Ticket created automatically by Tess with the full conversation context.", 0)
    ev("tess", "assigned", f"Assigned to {staff['name']} ({team}).", 0)
    if status != "open":
        ev(staff["name"], "assigned", f"{staff['name']} took this ticket.", 15, staff["id"])
    if t.get("internal"):
        ev(staff["name"], "internal_note", t["internal"], 40, staff["id"], internal=True)
    if t.get("reply"):
        ev(staff["name"], "message", t["reply"], 45, staff["id"])
    if t.get("question"):
        ev(staff["name"], "question", t["question"], 30, staff["id"])
        notify(item["who"], "ticket_message", f"{staff['name']} needs more information on {number}", t["question"], link,
               created + timedelta(minutes=30), read=False)
    if t.get("consult"):
        conn.execute(
            text("""INSERT INTO ticket_consults (ticket_id, requested_by, target_role, question, created_at)
                    VALUES (:t, :r, 'admin', :q, :at)"""),
            {"t": tid, "r": staff["id"], "q": t["consult"], "at": created + timedelta(minutes=30)},
        )
        ev(staff["name"], "consult_asked", f"Asked admin: {t['consult']}", 30, staff["id"], internal=True)
        notify("alex", "ticket_consult", f"{staff['name']} ({team}) needs your help on {number}", t["consult"], link,
               created + timedelta(minutes=30), read=False)
    if state == "resolved":
        ev(staff["name"], "resolved", t["resolution"], 180, staff["id"])
        notify(item["who"], "ticket_resolved", f"Your ticket {number} is resolved",
               f"{staff['name']} resolved it: {t['resolution']}", link, resolved_at)
    if status == "open":
        notify(t["assignee"], "ticket_assigned", f"New {t['category']} ticket {number}",
               f"The AI assistant couldn't solve this one: \"{item['question']}\". Priority: {t['priority']}.", link, created, read=False)


def _hr_case(conn, people, now) -> None:
    """One private HR case, so the Private Cases page has something to show."""
    aiden, hannah = people["aiden"], people["hannah"]
    at = now - timedelta(days=4, hours=2)
    seq = conn.execute(text("SELECT nextval('hr_case_number_seq')")).scalar_one()
    cid = str(conn.execute(
        text("""INSERT INTO hr_cases (number, reporter_id, anonymous, category, subject, description, people_involved,
                urgency, preferred_contact, status, assigned_hr_id, created_at, updated_at)
                VALUES (:n, :r, false, 'colleague_conflict', :s, :d, :p, 'normal', 'portal', 'in_review', :h, :at, :up) RETURNING id"""),
        {"n": f"HR-{seq:04d}", "r": aiden["id"], "h": hannah["id"], "at": at, "up": at + timedelta(hours=20),
         "s": "A teammate keeps presenting my work as theirs",
         "d": "In the last two team meetings a teammate presented the support dashboard I built as their own work.",
         "p": "A teammate in Support"},
    ).scalar_one())
    for body, role, author, hours in [
        ("Thanks for telling us, Aiden. Could we meet on Thursday to talk it through? Nothing will be shared without your OK.", "hr", hannah["id"], 20),
        ("Yes, Thursday works for me. Thank you.", "employee", aiden["id"], 22),
    ]:
        conn.execute(
            text("INSERT INTO hr_case_messages (case_id, author_id, author_role, body, created_at) VALUES (:c, :a, :r, :b, :at)"),
            {"c": cid, "a": author, "r": role, "b": body, "at": at + timedelta(hours=hours)},
        )


def main() -> None:
    print(f"[reset-demo] {reset_demo()}")
