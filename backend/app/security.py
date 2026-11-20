"""Password hashing and JWT issuance/verification."""
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# A session signed in with a temporary password may only choose a new password.
PASSWORD_CHANGE_MINUTES = 30


def create_access_token(subject: str, role: str, name: str, password_change_only: bool = False) -> str:
    """`password_change_only`: the token works for nothing but choosing a new password (signed
    in with a temporary password). It is short-lived."""
    minutes = PASSWORD_CHANGE_MINUTES if password_change_only else settings.JWT_EXPIRE_MINUTES
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {"sub": subject, "role": role, "name": name, "exp": expire}
    if password_change_only:
        payload["pwd_change"] = True
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        return None


PASSWORD_RULES = "at least 8 characters, with an upper-case letter, a lower-case letter and a number"


def password_problem(password: str) -> str | None:
    """Why a new password isn't acceptable, or None if it's fine."""
    if len(password) < 8:
        return "Your new password needs at least 8 characters."
    if len(password) > 128:
        return "Please keep your new password under 128 characters."
    if not any(c.isupper() for c in password):
        return "Your new password needs an upper-case letter."
    if not any(c.islower() for c in password):
        return "Your new password needs a lower-case letter."
    if not any(c.isdigit() for c in password):
        return "Your new password needs a number."
    return None
