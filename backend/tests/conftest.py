"""Shared test setup: tests never send real email or call real LLMs, whatever is in .env
(notifications are still written to the database, with email_status 'not_configured'; agents use
the deterministic LLM_MOCK_MODE templates so results are repeatable and need no API keys)."""
import pytest

from app.config import get_settings


@pytest.fixture(autouse=True, scope="session")
def _no_real_email_or_llm():
    settings = get_settings()
    smtp_host, mock_mode = settings.SMTP_HOST, settings.LLM_MOCK_MODE
    settings.SMTP_HOST = ""
    settings.LLM_MOCK_MODE = True
    yield
    settings.SMTP_HOST = smtp_host
    settings.LLM_MOCK_MODE = mock_mode


@pytest.fixture(autouse=True, scope="session")
def _restore_demo_data_afterwards():
    """The tests run against the real dev database and leave chats, leave requests, approvals and
    tickets behind. Put the small hand-written demo set back when they finish, so the app is always
    clean to present (seed/generators/demo_data.py; same as `poetry run reset-demo`)."""
    yield
    from app.db import check_db_connection

    if check_db_connection()[0]:
        from app.seed.generators.demo_data import reset_demo

        reset_demo()
