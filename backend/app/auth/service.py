from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.schemas import PasswordChange, RegisterIn
from app.auth.security import hash_password, verify_password
from app.common.errors import ApiError, assert_valid, conflict
from app.users import rules
from app.users.models import User

PUBLIC_ROLES = ("student", "instructor")


def login(db: Session, email: str, password: str) -> User:
    email = (email or "").strip().lower()
    assert_valid(
        {
            "email": "" if email else "Email is required.",
            "password": "" if password else "Password is required.",
        }
    )
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if not user or not verify_password(password, user.password_hash):
        raise ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
    if not user.is_active:
        raise ApiError(403, "ACCOUNT_INACTIVE", "This account is inactive. Please contact the administrator.")
    return user


def register(db: Session, data: RegisterIn) -> User:
    name, email = data.name.strip(), data.email.strip().lower()
    assert_valid(
        {
            "name": rules.name_error(name),
            "email": rules.email_error(email),
            "password": rules.password_error(data.password),
            "role": "" if data.role in PUBLIC_ROLES else "Choose Student or Instructor.",
        }
    )
    if db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise conflict(
            "CONFLICT", "This email is already registered.", {"email": "This email is already registered."}
        )
    user = User(
        name=name, email=email, role=data.role, password_hash=hash_password(data.password), is_active=True
    )
    db.add(user)
    db.commit()
    return user


def change_password(db: Session, user: User, data: PasswordChange) -> None:
    current_error = ""
    if not data.current:
        current_error = "Enter your current password."
    elif not verify_password(data.current, user.password_hash):
        current_error = "Current password is incorrect."
    next_error = rules.password_error(data.next) or (
        "The new password must be different from the current one." if data.next == data.current else ""
    )
    assert_valid({"current": current_error, "next": next_error})
    user.password_hash = hash_password(data.next)
    db.commit()
