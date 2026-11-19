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
