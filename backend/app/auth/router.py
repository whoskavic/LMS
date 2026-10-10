from fastapi import APIRouter
from sqlalchemy import func, select

from app.auth import service
from app.auth.deps import DB, CurrentUser
from app.auth.schemas import LoginIn, PasswordChange, RegisterIn, TokenOut
from app.auth.security import create_token
from app.common.grading import gpa
from app.common.schemas import Ok
from app.courses.models import Course
from app.enrollments.models import Enrollment
from app.users.models import User
from app.users.schemas import ProfileUpdate, UserOut
from app.users.service import update_profile

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=TokenOut, response_model_by_alias=True)
def login(body: LoginIn, db: DB):
    """Login dengan email + password. Mengembalikan JWT dan data user."""
    user = service.login(db, body.email, body.password)
    return TokenOut(token=create_token(user.id), user=UserOut.of(user))


@router.post("/auth/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: DB):
    """Registrasi publik sebagai student atau instructor (admin hanya lewat seed)."""
    user = service.register(db, body)
    return TokenOut(token=create_token(user.id), user=UserOut.of(user))


@router.post("/auth/logout", response_model=Ok)
def logout():
    """JWT stateless: klien cukup menghapus token. Endpoint disediakan agar kontrak sama dengan mock."""
    return Ok()


@router.get("/auth/me", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut.of(user)


@router.post("/auth/password", response_model=Ok)
def change_password(body: PasswordChange, user: CurrentUser, db: DB):
    service.change_password(db, user, body)
    return Ok()


@router.patch("/me", response_model=UserOut, tags=["users"])
def update_me(body: ProfileUpdate, user: CurrentUser, db: DB):
    return UserOut.of(update_profile(db, user, body))


@router.get("/me/stats", tags=["users"])
def my_stats(user: CurrentUser, db: DB) -> dict:
    if user.role == "student":
        grades = list(db.scalars(select(Enrollment.grade_letter).where(Enrollment.user_id == user.id)))
        return {"role": "student", "courses": len(grades), "gpa": gpa(grades)}
    if user.role == "instructor":
        taught = db.scalar(select(func.count()).select_from(Course).where(Course.instructor_id == user.id))
        return {"role": "instructor", "coursesTaught": taught}
    return {"role": "admin", "usersManaged": db.scalar(select(func.count()).select_from(User))}
