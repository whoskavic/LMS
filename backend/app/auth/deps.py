"""Dependency FastAPI: user yang login dan pembatasan role."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.auth.security import decode_token
from app.common.errors import ApiError, forbidden
from app.db import get_db
from app.users.models import User

DB = Annotated[Session, Depends(get_db)]


def _token(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def get_current_user(db: DB, authorization: Annotated[str | None, Header()] = None) -> User:
    token = _token(authorization)
    user_id = decode_token(token) if token else None
    user = db.get(User, user_id) if user_id else None
    if not user:
        raise ApiError(401, "UNAUTHENTICATED", "Please sign in to continue.")
    if not user.is_active:
        raise ApiError(401, "ACCOUNT_INACTIVE", "Your account has been deactivated. Please contact the administrator.")
    return user


def get_optional_user(db: DB, authorization: Annotated[str | None, Header()] = None) -> User | None:
    """User yang login bila ada token valid; None untuk pengunjung publik."""
    token = _token(authorization)
    user_id = decode_token(token) if token else None
    user = db.get(User, user_id) if user_id else None
    return user if user and user.is_active else None


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def require_roles(*roles: str) -> Callable[[User], User]:
    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise forbidden("Your role cannot access this endpoint.")
        return user

    return checker
