"""Poetry script entry points: migrate, seed, simulate-feedback, search, eval, dev."""
import re
import sys
from pathlib import Path

import psycopg

from app.config import REPO_ROOT, get_settings
from app.db import ensure_pgvector_extension

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"


def _psycopg_dsn(database_url: str) -> str:
    # psycopg (v3) accepts the plain postgresql:// scheme directly.
    return database_url.replace("postgresql+psycopg://", "postgresql://", 1)


def migrate() -> None:
    settings = get_settings()
    if not settings.DATABASE_URL:
        print(
            "DATABASE_URL is not set.\n"
            "Copy .env.example to .env at the repo root and fill in your own Postgres "
            "connection string (postgresql://user:pass@host:port/dbname), then re-run "
            "'poetry run migrate'."
        )
        sys.exit(1)

    ok, msg = ensure_pgvector_extension()
    if not ok:
        print(f"FATAL: {msg}")
        sys.exit(1)
    print(f"[migrate] {msg}")

    dsn = _psycopg_dsn(settings.DATABASE_URL)
    with psycopg.connect(dsn, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            cur.execute("SELECT version FROM schema_migrations")
            applied = {row[0] for row in cur.fetchall()}
        conn.commit()

        files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        if not files:
            print("[migrate] no migration files found")
            return

        for path in files:
            version = path.stem
            if version in applied:
                print(f"[migrate] {version} already applied, skipping")
                continue
            sql = path.read_text()
            print(f"[migrate] applying {version} ...")
            try:
                with conn.cursor() as cur:
                    cur.execute(sql)
                    cur.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (version,))
                conn.commit()
                print(f"[migrate] {version} OK")
            except Exception as exc:  # noqa: BLE001
                conn.rollback()
                if "hnsw" in str(exc).lower() or "access method" in str(exc).lower():
                    print(
                        f"[migrate] {version}: HNSW index unsupported by this pgvector "
                        "version, falling back to ivfflat ..."
                    )
                    fallback_sql = re.sub(
                        r"USING hnsw \(embedding vector_cosine_ops\)",
                        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)",
                        sql,
                    )
                    with conn.cursor() as cur:
                        cur.execute(fallback_sql)
                        cur.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (version,))
                    conn.commit()
                    print(f"[migrate] {version} OK (ivfflat fallback)")
                else:
                    print(f"[migrate] {version} FAILED: {exc}")
                    raise

    print("[migrate] all migrations applied")


def seed() -> None:
    from app.seed.seed import run_seed

    run_seed()


def simulate_feedback() -> None:
    import argparse

    from app.bandit.simulator import run_simulation

    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=500)
    args, _ = parser.parse_known_args(sys.argv[1:])
    run_simulation(args.n)


def search() -> None:
    import argparse

    from app.rag.retriever import retrieve

    parser = argparse.ArgumentParser()
    parser.add_argument("query")
    parser.add_argument("--strategy", default="hybrid_rerank")
    parser.add_argument("--dept", default=None)
    args, _ = parser.parse_known_args(sys.argv[1:])
    results = retrieve(args.query, strategy=args.strategy, dept=args.dept)
    for i, r in enumerate(results, 1):
        print(f"{i}. [{r['score']:.3f}] {r['title']}  ({r['article_id']})")
        print(f"   {r['text'][:160].strip()}...")


def run_eval_cmd() -> None:
    from app.eval.run_eval import run_eval

    run_eval()


def dev() -> None:
    import uvicorn

    settings = get_settings()
    # Chat answers stream over long-lived connections (and a chat waiting on an approval keeps
    # its stream open). Without a limit, an auto-reload after a code change waits for every open
    # browser tab's stream to end, so the server hangs until those tabs are closed.
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.APP_PORT, reload=True, timeout_graceful_shutdown=3)
