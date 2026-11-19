"""Central config loaded from .env at the repo root. No secret ever has a default value here."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), env_file_encoding="utf-8", extra="ignore")

    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    DATABASE_URL: str = ""
    JWT_SECRET: str = "dev-insecure-secret-change-me"
    JWT_EXPIRE_MINUTES: int = 480
    FRONTEND_ORIGIN: str = "http://localhost:5173"
    LLM_MOCK_MODE: bool = False

    GROQ_SUPERVISOR_MODEL: str = "llama-3.1-8b-instant"
    GROQ_ACTION_MODEL: str = "openai/gpt-oss-20b"
    GROQ_TICKETING_MODEL: str = "openai/gpt-oss-20b"
    GEMINI_IT_MODEL: str = "gemini-flash-lite-latest"
    GEMINI_HR_MODEL: str = "gemini-flash-lite-latest"

    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIMS: int = 384
    CROSS_ENCODER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""

    APP_PORT: int = 8000

    # Direct HR contact shown to employees for confidential matters (complaints, conflicts,
    # personal issues). Not secrets. HR_CONTACT_PHONE is optional: leave it empty to hide it.
    HR_CONTACT_EMAIL: str = "hr@acme.test"
    HR_CONTACT_PHONE: str = ""
    HR_CONTACT_HOURS: str = "Monday to Friday, 9:00 to 17:00"

    # Outgoing email for notifications (leave decisions, approvals, HR case updates). Leave
    # SMTP_HOST empty to turn email off: in-app notifications still work. SMTP_SECURITY is
    # "starttls" (port 587), "ssl" (port 465) or "none".
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_SECURITY: str = "starttls"
    # Demo helper: when set, every email goes to this one address instead of the user's own
    # (the seeded users have made-up @acme.test addresses). Leave empty in real use.
    EMAIL_REDIRECT_ALL_TO: str = ""
    # Public address of the site, used for the "Open HelpDesk" link inside emails.
    APP_PUBLIC_URL: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
