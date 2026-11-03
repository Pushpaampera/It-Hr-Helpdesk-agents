"""poetry run seed — generates all Phase 2 seed data. Idempotent: if users already exist,
it reports that and exits without duplicating anything (re-run safely at any time).
"""
import sys
import time
import uuid

import psycopg
from psycopg.types.json import Json

from app.config import get_settings
from app.rag.chunker import chunk_article
from app.rag.embedder import embed_texts
from app.rag.strategies import STRATEGIES
from app.seed.generators.golden import golden_questions
from app.seed.generators.knowledge import hr_articles, it_articles
from app.seed.generators.ops import (
    generate_access_requests_and_approvals,
    generate_historical_runs,
    generate_leave_balances,
    generate_leave_requests,
    generate_payslips,
    generate_tickets,
)
from app.seed.generators.users import generate_users
from app.security import hash_password


def _dsn() -> str:
    settings = get_settings()
    if not settings.DATABASE_URL:
        print("DATABASE_URL is not set. Fill in .env before running 'poetry run seed'.")
        sys.exit(1)
    return settings.DATABASE_URL.replace("postgresql+psycopg://", "postgresql://", 1)


def run_seed() -> None:
    t0 = time.time()
    with psycopg.connect(_dsn(), autocommit=False) as conn:
        from pgvector.psycopg import register_vector

        register_vector(conn)

        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM users")
            if cur.fetchone()[0] > 0:
                print("[seed] users table is not empty — seed already applied, skipping (idempotent).")
                return

        print("[seed] generating users ...")
        user_specs = generate_users()
        ids_by_email = {u["email"]: str(uuid.uuid4()) for u in user_specs}
        demo_password_hash = hash_password("Demo@1234")

        # Insert with manager_id NULL first (managers may reference users not yet inserted),
        # then a second pass fills in manager_id once every row exists.
        users_rows = []
        manager_updates = []
        for u in user_specs:
            manager_id = ids_by_email.get(u["manager_email"]) if u.get("manager_email") else None
            uid = ids_by_email[u["email"]]
            users_rows.append((
                uid, u["name"], u["email"], demo_password_hash, u["role"],
                u["department"], u["title"], u["email"].split("@")[0],
            ))
            if manager_id:
                manager_updates.append((manager_id, uid))
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO users (id, name, email, password_hash, role, department, title, avatar_seed)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                users_rows,
            )
            cur.executemany("UPDATE users SET manager_id = %s WHERE id = %s", manager_updates)
        users = []
        for u in user_specs:
            users.append({
                "id": ids_by_email[u["email"]], "name": u["name"], "email": u["email"],
                "role": u["role"], "department": u["department"],
                "manager_id": ids_by_email.get(u["manager_email"]) if u.get("manager_email") else None,
            })
        print(f"[seed] inserted {len(users)} users")

        print("[seed] seeding bandit arms ...")
        arm_ids: dict[str, str] = {}
        with conn.cursor() as cur:
            for name, cfg in STRATEGIES.items():
                arm_id = str(uuid.uuid4())
                arm_ids[name] = arm_id
                cur.execute(
                    "INSERT INTO bandit_arms (id, name, config) VALUES (%s,%s,%s)",
                    (arm_id, name, Json(cfg)),
                )

        print("[seed] generating + chunking + embedding knowledge articles ...")
        it_list = it_articles()
        hr_list = hr_articles()
        for a in it_list:
            a["dept"] = "IT"
        for a in hr_list:
            a["dept"] = "HR"
        articles = it_list + hr_list

        article_rows = []
        article_ids = []
        for a in articles:
            aid = str(uuid.uuid4())
            article_ids.append(aid)
            article_rows.append((
                aid, a["dept"], a["category"], a["title"], a["body"], a["error_codes"], a["source_name"],
            ))
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO knowledge_articles (id, dept, category, title, body, error_codes, source_name)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                article_rows,
            )
        print(f"[seed] inserted {len(article_rows)} knowledge articles ({len(it_list)} IT, {len(hr_list)} HR)")

        chunk_specs = []
        chunk_texts = []
        for aid, a in zip(article_ids, articles, strict=True):
            for c in chunk_article(a["title"], a["body"]):
                chunk_specs.append({
                    "id": str(uuid.uuid4()), "article_id": aid, "chunk_index": c.chunk_index,
                    "text": c.text, "metadata": {"section": c.section, "dept": a["dept"], "category": a["category"]},
                })
                chunk_texts.append(c.text)

        print(f"[seed] embedding {len(chunk_texts)} chunks locally (all-MiniLM-L6-v2) ...")
        embeddings = embed_texts(chunk_texts)
        with conn.cursor() as cur:
            rows = [
                (c["id"], c["article_id"], c["chunk_index"], c["text"], emb, Json(c["metadata"]))
                for c, emb in zip(chunk_specs, embeddings, strict=True)
            ]
            cur.executemany(
                """INSERT INTO kb_chunks (id, article_id, chunk_index, text, embedding, metadata)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                rows,
            )
        print(f"[seed] inserted {len(chunk_specs)} kb_chunks with embeddings")

        print("[seed] generating leave balances and payslips ...")
        leave_balances = generate_leave_balances([u["id"] for u in users], __import__("random").Random(1))
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO leave_balances (user_id, leave_type, total_days, used_days) VALUES (%s,%s,%s,%s)",
                [(r["user_id"], r["leave_type"], r["total_days"], r["used_days"]) for r in leave_balances],
            )
        payslips = generate_payslips(users, __import__("random").Random(2))
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO payslips (user_id, month, gross, net, deductions) VALUES (%s,%s,%s,%s,%s)",
                [(r["user_id"], r["month"], r["gross"], r["net"], Json(r["deductions"])) for r in payslips],
            )
        print(f"[seed] inserted {len(leave_balances)} leave balance rows, {len(payslips)} payslips")

        print("[seed] generating tickets ...")
        import random as _random

        tickets, ticket_events = generate_tickets(users, _random.Random(3), count=200)
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO tickets (id, number, user_id, run_id, category, priority, status, summary,
                   context, assignee_id, resolved_at, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                [(t["id"], t["number"], t["user_id"], t["run_id"], t["category"], t["priority"], t["status"],
                  t["summary"], Json(t["context"]), t["assignee_id"], t["resolved_at"], t["created_at"])
                 for t in tickets],
            )
            cur.executemany(
                "INSERT INTO ticket_events (ticket_id, actor, type, note, created_at) VALUES (%s,%s,%s,%s,%s)",
                [(e["ticket_id"], e["actor"], e["type"], e["note"], e["created_at"]) for e in ticket_events],
            )
            # Seeded tickets use hand-assigned numbers (TCK-1000..TCK-1199) rather than
            # ticket_number_seq, so the sequence must be advanced past them here — otherwise
            # Tess (app/agents/ticketing.py) would mint a number that already exists the first
            # time a ticket is created live. See docs/06_DECISIONS.md.
            cur.execute("SELECT setval('ticket_number_seq', 1199, true)")
        print(f"[seed] inserted {len(tickets)} tickets, {len(ticket_events)} ticket events")

        employees = [u for u in users if u["role"] == "employee"]

        print("[seed] generating access requests and approvals ...")
        access_requests, approvals = generate_access_requests_and_approvals(employees, _random.Random(4), count=80)
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO approvals (id, run_id, requester_id, approver_id, type, payload, status,
                   comment, decided_at, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                [(a["id"], a["run_id"], a["requester_id"], a["approver_id"], a["type"], Json(a["payload"]),
                  a["status"], a["comment"], a["decided_at"], a["created_at"]) for a in approvals],
            )
            cur.executemany(
                """INSERT INTO access_requests (user_id, system, access_level, justification, status,
                   approval_id, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                [(r["user_id"], r["system"], r["access_level"], r["justification"], r["status"],
                  r["approval_id"], r["created_at"]) for r in access_requests],
            )
        print(f"[seed] inserted {len(approvals)} approvals, {len(access_requests)} access requests")

        print("[seed] generating historical leave requests ...")
        leave_requests = generate_leave_requests(employees, _random.Random(5), count=150)
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, days, reason,
                   status, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                [(r["user_id"], r["leave_type"], r["start_date"], r["end_date"], r["days"], r["reason"],
                  r["status"], r["created_at"]) for r in leave_requests],
            )
        print(f"[seed] inserted {len(leave_requests)} leave requests")

        print("[seed] generating 300 historical agent runs with events, feedback and bandit history ...")
        runs, events, feedback_rows, decisions, rewards, arm_state = generate_historical_runs(users, _random.Random(6), count=300)

        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO agent_runs (id, conversation_id, user_id, query, route, status,
                   total_latency_ms, tokens_in, tokens_out, cost_usd, outcome, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                [(r["id"], r["conversation_id"], r["user_id"], r["query"], r["route"], r["status"],
                  r["total_latency_ms"], r["tokens_in"], r["tokens_out"], r["cost_usd"], r["outcome"],
                  r["created_at"]) for r in runs],
            )
            cur.executemany(
                """INSERT INTO agent_events (run_id, seq, agent, status, action, caption, detail, model,
                   latency_ms, tokens_in, tokens_out, ts) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                [(e["run_id"], e["seq"], e["agent"], e["status"], e["action"], e["caption"], Json(e["detail"]),
                  e["model"], e["latency_ms"], e["tokens_in"], e["tokens_out"], e["ts"]) for e in events],
            )
            cur.executemany(
                "INSERT INTO feedback (run_id, rating, resolved, comment, created_at) VALUES (%s,%s,%s,%s,%s)",
                [(f["run_id"], f["rating"], f["resolved"], f["comment"], f["created_at"]) for f in feedback_rows],
            )
            cur.executemany(
                """INSERT INTO bandit_decisions (id, run_id, context, arm_id, ucb_scores, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                [(d["id"], d["run_id"], Json(d["context"]), arm_ids[d["arm_id_name"]], Json(d["ucb_scores"]),
                  d["created_at"]) for d in decisions],
            )
            cur.executemany(
                "INSERT INTO bandit_rewards (decision_id, reward, created_at) VALUES (%s,%s,%s)",
                [(rw["decision_id"], rw["reward"], rw["created_at"]) for rw in rewards],
            )
            for name, state in arm_state.items():
                cur.execute(
                    """INSERT INTO bandit_state (arm_id, a_matrix, b_vector, pulls)
                       VALUES (%s,%s,%s,%s)""",
                    (arm_ids[name], Json(state["a_matrix"]), Json(state["b_vector"]),
                     sum(1 for d in decisions if d["arm_id_name"] == name)),
                )
        print(
            f"[seed] inserted {len(runs)} agent runs, {len(events)} agent events, "
            f"{len(feedback_rows)} feedback rows, {len(decisions)} bandit decisions"
        )

        print("[seed] generating golden question set ...")
        gq = golden_questions()
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO golden_questions (question, expected_route, expected_answer,
                   expected_sources, needs_action, should_escalate) VALUES (%s,%s,%s,%s,%s,%s)""",
                [(g["question"], g["expected_route"], g["expected_answer"], g["expected_sources"],
                  g["needs_action"], g["should_escalate"]) for g in gq],
            )
        print(f"[seed] inserted {len(gq)} golden questions")

        conn.commit()

    elapsed = time.time() - t0
    print(f"[seed] done in {elapsed:.1f}s")


# All seeded tables except schema_migrations, in an order TRUNCATE ... CASCADE can safely clear
# in one statement regardless of FK direction.
_SEED_TABLES = [
    "eval_results", "eval_runs", "golden_questions", "bandit_rewards", "bandit_decisions",
    "bandit_state", "bandit_arms", "feedback", "agent_events", "agent_runs", "messages",
    "conversations", "leave_requests", "access_requests", "approvals", "ticket_events",
    "tickets", "payslips", "leave_balances", "kb_chunks", "knowledge_articles", "audit_log",
    "users",
]


def reset_and_reseed() -> None:
    """Wipes every demo data table and reseeds from scratch. Used by the admin 'reset demo'
    button (Phase 10B) so a presenter can return the showcase to its pristine state between
    runs. Never touches schema_migrations — the schema itself is untouched."""
    print("[seed] resetting demo data ...")
    with psycopg.connect(_dsn(), autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(f"TRUNCATE TABLE {', '.join(_SEED_TABLES)} CASCADE")
            cur.execute("ALTER SEQUENCE ticket_number_seq RESTART WITH 1000")
        conn.commit()
    print("[seed] demo data wiped, reseeding ...")
    run_seed()
