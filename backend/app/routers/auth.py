"""Phase 4: JWT login/logout/me. Role checks are enforced server-side (app/deps.py), never
only in the UI."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.security import create_access_token, verify_password

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


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id), name=user.name, email=user.email, role=user.role,
        department=user.department, title=user.title,
        manager_id=str(user.manager_id) if user.manager_id else None,
    )


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(text("SELECT * FROM users WHERE email = :email"), {"email": req.email}).mappings().first()
    if user is None or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user["is_active"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This account is deactivated")

    token = create_access_token(subject=str(user["id"]), role=user["role"], name=user["name"])
    return LoginResponse(
        access_token=token,
        user=UserOut(
            id=str(user["id"]), name=user["name"], email=user["email"], role=user["role"],
            department=user["department"], title=user["title"],
            manager_id=str(user["manager_id"]) if user["manager_id"] else None,
        ),
    )


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    # JWTs are stateless and not server-tracked (no deny-list) — logout is a client-side
    # no-op acknowledgement: the frontend drops the token.
    return {"success": True}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return _user_out(current_user)
