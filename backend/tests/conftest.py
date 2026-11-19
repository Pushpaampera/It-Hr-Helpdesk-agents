"""Shared test setup: tests never send real email, whatever SMTP settings are in .env
(notifications are still written to the database, with email_status 'not_configured')."""
import pytest

from app.config import get_settings


@pytest.fixture(autouse=True, scope="session")
def _no_real_email():
    settings = get_settings()
    smtp_host = settings.SMTP_HOST
    settings.SMTP_HOST = ""
    yield
    settings.SMTP_HOST = smtp_host
