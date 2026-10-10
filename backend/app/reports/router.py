from fastapi import APIRouter
from sqlalchemy import select

from app.auth.deps import DB, CurrentUser
from app.courses.models import Course

router = APIRouter(tags=["meta"])


@router.get("/meta/notifications")
def notifications(user: CurrentUser, db: DB) -> list[dict]:
    """Notifikasi topbar, diturunkan dari data (tanpa tabel notifikasi)."""
    items: list[dict] = []
    if user.role == "admin":
        pending = db.scalars(select(Course).where(Course.status == "pending").order_by(Course.submitted_at.desc()))
        items = [
            {"text": f"{c.code or ''} {c.title} is waiting for approval".strip(), "time": "Pending"} for c in pending
        ]
    elif user.role == "instructor":
        mine = db.scalars(
            select(Course)
            .where(Course.instructor_id == user.id, Course.status.in_(("pending", "rejected")))
            .order_by(Course.updated_at.desc())
        )
        for c in mine:
            state = "is waiting for admin approval" if c.status == "pending" else "was rejected — revise and resubmit"
            items.append({"text": f"{c.title} {state}", "time": c.status.title()})
    return items[:5]
