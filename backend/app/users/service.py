"""Logika manajemen user (admin) dan profil."""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.common.errors import assert_valid, conflict, not_found
from app.common.pagination import paginate
from app.courses.models import Course
from app.enrollments.models import Enrollment
from app.users import rules
from app.users.models import ROLES, User
from app.users.schemas import ProfileUpdate, UserCreate, UserOut, UserRow, UserUpdate


def clean(value: str | None) -> str:
    return (value or "").strip()


def get_user(db: Session, user_id: str) -> User:
    try:
        user = db.get(User, uuid.UUID(str(user_id)))
    except ValueError:
        user = None
    if not user:
        raise not_found("User")
    return user


def course_counts(db: Session, users: list[User]) -> dict[uuid.UUID, int]:
    """Jumlah course yang diajar (instructor) atau diikuti (student)."""
    ids = [u.id for u in users]
    teaching = dict(
        db.execute(
            select(Course.instructor_id, func.count())
            .where(Course.instructor_id.in_(ids))
            .group_by(Course.instructor_id)
        ).all()
    )
    enrolled = dict(
        db.execute(
            select(Enrollment.user_id, func.count()).where(Enrollment.user_id.in_(ids)).group_by(Enrollment.user_id)
        ).all()
    )
    return {u.id: (teaching.get(u.id, 0) if u.role == "instructor" else enrolled.get(u.id, 0)) for u in users}


def user_rows(db: Session, users: list[User]) -> list[dict]:
    counts = course_counts(db, users)
    return [
        UserRow(**UserOut.of(u).model_dump(), courses=None if u.role == "admin" else counts[u.id]).model_dump(
            by_alias=True
        )
        for u in users
    ]


def list_users(
    db: Session,
    role: str | None,
    q: str | None,
    status: str | None,
    sort: str | None,
    page: int | None,
    page_size: int | None,
) -> dict:
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if status in ("Active", "Inactive"):
        stmt = stmt.where(User.is_active == (status == "Active"))
    if q and q.strip():
        needle = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.name.ilike(needle), User.email.ilike(needle)))
    users = list(db.scalars(stmt))
    return paginate(user_rows(db, users), page, page_size, sort, "name")


def assert_unique(db: Session, email: str, except_id: uuid.UUID | None = None):
    base = select(User.id).where(User.id != except_id) if except_id else select(User.id)
    if db.scalar(base.where(func.lower(User.email) == email.lower())):
        raise conflict("CONFLICT", "Some values are already in use.", {"email": "This email is already registered."})


def create_user(db: Session, data: UserCreate) -> User:
    assert_valid({"role": "" if data.role in ROLES else "Choose a valid role."})
    name, email = clean(data.name), clean(data.email).lower()
    assert_valid(
        {
            "name": rules.name_error(name),
            "email": rules.email_error(email),
            "status": "" if data.status in ("Active", "Inactive") else "Choose Active or Inactive.",
            "password": rules.password_error(data.password),
        }
    )
    assert_unique(db, email)
    user = User(
        role=data.role,
        name=name,
        email=email,
        is_active=data.status == "Active",
        password_hash=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    return user


def update_user(db: Session, actor: User, user_id: str, data: UserUpdate) -> User:
    target = get_user(db, user_id)
    current_status = "Active" if target.is_active else "Inactive"
    name = clean(data.name if data.name is not None else target.name)
    email = clean(data.email if data.email is not None else target.email).lower()
    status = data.status if data.status is not None else current_status
    status_error = ""
    if status not in ("Active", "Inactive"):
        status_error = "Choose Active or Inactive."
    elif target.id == actor.id and status != "Active":
        status_error = "You cannot deactivate your own account."
    assert_valid({"name": rules.name_error(name), "email": rules.email_error(email), "status": status_error})
    assert_unique(db, email, target.id)
    target.name, target.email = name, email
    target.is_active = status == "Active"
    db.commit()
    return target


def delete_user(db: Session, actor: User, user_id: str) -> None:
    target = get_user(db, user_id)
    if target.id == actor.id:
        raise conflict("CANNOT_DELETE_SELF", "You cannot delete your own account.")
    teaching = db.scalar(select(func.count()).select_from(Course).where(Course.instructor_id == target.id))
    if teaching:
        s = "s" if teaching > 1 else ""
        raise conflict(
            "USER_HAS_COURSES",
            f"{target.name} still teaches {teaching} course{s}. "
            "Delete or archive those courses first, or deactivate the account instead.",
        )
    enrolled = db.scalar(select(func.count()).select_from(Enrollment).where(Enrollment.user_id == target.id))
    if enrolled:
        s = "s" if enrolled > 1 else ""
        raise conflict(
            "USER_HAS_ENROLLMENTS",
            f"{target.name} has {enrolled} course enrollment{s}. Deactivate the account instead to keep their history.",
        )
    db.delete(target)
    db.commit()


def update_profile(db: Session, user: User, data: ProfileUpdate) -> User:
    name = clean(data.name if data.name is not None else user.name)
    assert_valid({"name": rules.name_error(name)})
    user.name = name
    if user.role == "instructor":
        apply_instructor_profile(user, data.headline, data.bio)
    db.commit()
    return user


HEADLINE_MAX, BIO_MAX = 120, 2000


def apply_instructor_profile(user: User, headline: str | None, bio: str | None) -> None:
    """Set headline/bio instructor (None = tidak diubah, string kosong = dikosongkan)."""
    headline = clean(headline) if headline is not None else None
    bio = bio.strip() if bio is not None else None
    assert_valid(
        {
            "headline": f"Headline must be at most {HEADLINE_MAX} characters."
            if headline and len(headline) > HEADLINE_MAX
            else "",
            "bio": f"Bio must be at most {BIO_MAX} characters." if bio and len(bio) > BIO_MAX else "",
        }
    )
    if headline is not None:
        user.headline = headline or None
    if bio is not None:
        user.bio = bio or None
