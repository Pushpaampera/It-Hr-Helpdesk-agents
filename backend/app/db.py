"""SQLAlchemy engine/session, plus the pgvector extension bootstrap."""
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


def _psycopg_url(raw: str) -> str:
    """Normalize a postgresql:// URL to use the psycopg3 driver."""
    if raw.startswith("postgresql://"):
        return raw.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw


settings = get_settings()
_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        if not settings.DATABASE_URL:
            raise RuntimeError(
                "DATABASE_URL is not set. Copy .env.example to .env and fill in your "
                "Postgres connection string before running migrate/seed/dev."
            )
        _engine = create_engine(_psycopg_url(settings.DATABASE_URL), pool_pre_ping=True, future=True)
    return _engine


def get_sessionmaker():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), autoflush=False, autocommit=False, future=True)
    return _SessionLocal


def get_db() -> Generator[Session, None, None]:
    SessionLocal = get_sessionmaker()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    SessionLocal = get_sessionmaker()
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def ensure_pgvector_extension() -> tuple[bool, str]:
    """Run CREATE EXTENSION IF NOT EXISTS vector. Returns (ok, message).

    Never silently falls back to another database. If this fails on permissions,
    the caller must print a clear message and stop.
    """
    engine = get_engine()
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        return True, "pgvector extension is enabled"
    except Exception as exc:  # noqa: BLE001
        return False, (
            "Could not enable the pgvector extension (CREATE EXTENSION vector). "
            "This usually means the connected database role lacks the CREATEDB/superuser "
            "privilege needed to install extensions. Ask a database admin to run "
            "'CREATE EXTENSION vector;' once on this database, then retry. "
            f"Underlying error: {exc}"
        )


def check_db_connection() -> tuple[bool, str]:
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, "connected"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)
