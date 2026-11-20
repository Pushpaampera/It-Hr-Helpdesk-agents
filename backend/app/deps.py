"""Shared FastAPI dependencies: current user extraction and role enforcement.

Role checks happen here, in the backend, never only in the UI (hard constraint 10).
"""
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

# The only things a session signed in with a temporary password may do.
PASSWORD_CHANGE_PATHS = ("/api/auth/me", "/api/auth/change-password", "/api/auth/logout")


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_access_token(creds.credentials)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, payload["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    # Signed in with a temporary password: nothing else works until a new password is chosen.
    # (A session that was already open when the password was reset keeps working.)
    user.password_change_required = bool(payload.get("pwd_change")) and user.must_change_password
    if user.password_change_required and request.url.path not in PASSWORD_CHANGE_PATHS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Please choose a new password first.")
    return user


def require_roles(*roles: str):
    def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role in {roles}")
        return user

    return _check


def ensure_self_or_roles(user: User, resource_user_id: str, *roles: str) -> None:
    """Allows access when `user` owns the resource (resource_user_id matches) or has one of
    the given elevated roles. Raises 403 otherwise. Used inline by routers that return a mix
    of "my own data" and "elevated staff can see everyone's data"."""
    if str(user.id) == str(resource_user_id):
        return
    if user.role in roles:
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have access to this resource")
