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

    # People's activity (history, tickets, leave, approvals, ...) is one small hand-written set.
    from app.seed.generators.demo_data import reset_demo

    print(f"[seed] demo data: {reset_demo()}")
    elapsed = time.time() - t0
    print(f"[seed] done in {elapsed:.1f}s")


def reset_and_reseed() -> None:
    """Returns the showcase to its pristine state between demo runs (admin 'reset demo'): replaces
    all people and activity with the small demo set. The knowledge base, golden questions and
    schema are kept, so it takes a second instead of re-embedding every article."""
    from app.seed.generators.demo_data import reset_demo

    print(f"[seed] demo data reset: {reset_demo()}")
