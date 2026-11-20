"""Phase 4: JWT login/logout/me. Role checks are enforced server-side (app/deps.py), never
only in the UI.

Temporary passwords (issued by the assistant's verified reset or by IT support, see
app/mock_apis/it_system.py) work for 15 minutes and only to choose a new password: signing in with
one returns `must_change_password: true` and a token that is good for nothing but
POST /api/auth/change-password (enforced in app/deps.py)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.mock_apis import log_action
from app.models.user import User
from app.security import create_access_token, hash_password, password_problem, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    department: str
    title: str
    manager_id: str | None = None
    # True only for a session signed in with a temporary password: the app shows nothing but
    # the "choose a new password" screen.
    must_change_password: bool = False


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id), name=user.name, email=user.email, role=user.role,
        department=user.department, title=user.title,
        manager_id=str(user.manager_id) if user.manager_id else None,
        must_change_password=bool(getattr(user, "password_change_required", False)),
    )


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    email = req.email.strip()
    user = db.execute(text("SELECT * FROM users WHERE email = :email"), {"email": email}).mappings().first()
    if user is None or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user["is_active"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This account is deactivated")

    must_change = bool(user["must_change_password"])
    expires = user["temp_password_expires_at"]
    if must_change and expires and datetime.now(timezone.utc) > expires:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "This temporary password has expired (they work for 15 minutes). If you're still signed in "
            "somewhere, ask the assistant to reset your password again; otherwise contact IT support.",
        )

    token = create_access_token(subject=str(user["id"]), role=user["role"], name=user["name"],
                                password_change_only=must_change)
    return LoginResponse(
        access_token=token,
        user=UserOut(
            id=str(user["id"]), name=user["name"], email=user["email"], role=user["role"],
            department=user["department"], title=user["title"],
            manager_id=str(user["manager_id"]) if user["manager_id"] else None,
            must_change_password=must_change,
        ),
    )


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password", response_model=LoginResponse)
def change_password(req: ChangePasswordRequest, current_user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """Chooses a new password (required after signing in with a temporary one). Returns a normal,
    full session token."""
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current (temporary) password isn't right.")
    if current_user.must_change_password and current_user.temp_password_expires_at \
            and datetime.now(timezone.utc) > current_user.temp_password_expires_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "This temporary password has expired. Please ask for a new password reset.")
    if problem := password_problem(req.new_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, problem)
    if req.new_password == req.current_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please choose a password different from the temporary one.")

    current_user.password_hash = hash_password(req.new_password)
    current_user.must_change_password = False
    current_user.temp_password_expires_at = None
    current_user.password_change_required = False
    db.commit()
    log_action(str(current_user.id), "change_password", "user", str(current_user.id), {})

    token = create_access_token(subject=str(current_user.id), role=current_user.role, name=current_user.name)
    return LoginResponse(access_token=token, user=_user_out(current_user))


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    # JWTs are stateless and not server-tracked (no deny-list) — logout is a client-side
    # no-op acknowledgement: the frontend drops the token.
    return {"success": True}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return _user_out(current_user)
