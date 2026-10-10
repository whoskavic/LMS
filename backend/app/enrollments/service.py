"""Logika enrollment & progress."""

from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.courses.models import Course, Module
from app.enrollments.models import Enrollment, ModuleProgress


def compute_progress(db: Session, enrollment: Enrollment) -> Decimal:
    """progress_pct = modul selesai / jumlah modul course × 100."""
    total = db.scalar(select(func.count()).select_from(Module).where(Module.course_id == enrollment.course_id)) or 0
    if not total:
        return Decimal(0)
    done = (
        db.scalar(
            select(func.count())
            .select_from(ModuleProgress)
            .join(Module, Module.id == ModuleProgress.module_id)
            .where(ModuleProgress.enrollment_id == enrollment.id, Module.course_id == enrollment.course_id)
        )
        or 0
    )
    return (Decimal(min(done, total)) * 100 / Decimal(total)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def apply_progress(db: Session, enrollment: Enrollment) -> None:
    """Hitung ulang progress; saat mencapai 100 status menjadi completed (tetap completed setelahnya)."""
    enrollment.progress_pct = compute_progress(db, enrollment)
    if enrollment.progress_pct >= 100 and enrollment.status != "completed":
        enrollment.status = "completed"
        enrollment.completed_at = datetime.now(UTC)
        from app.enrollments.certificates import issue_certificate_if_eligible

        issue_certificate_if_eligible(db, enrollment)


def recompute_course_progress(db: Session, course: Course) -> None:
    for enrollment in db.scalars(select(Enrollment).where(Enrollment.course_id == course.id)):
        apply_progress(db, enrollment)
