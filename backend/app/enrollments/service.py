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
        enrollment.completed_at = enrollment.completed_at or datetime.now(UTC)
        from app.enrollments.certificates import issue_certificate_if_eligible

        issue_certificate_if_eligible(db, enrollment)


def recompute_course_progress(db: Session, course: Course) -> None:
    for enrollment in db.scalars(select(Enrollment).where(Enrollment.course_id == course.id)):
        apply_progress(db, enrollment)


# ---------------------------------------------------------------------------
# Representasi & aksi enrollment
# ---------------------------------------------------------------------------
def _iso(value):
    from app.courses.service import iso

    return iso(value)


def completed_module_ids(db: Session, enrollment: Enrollment) -> list[str]:
    rows = db.scalars(
        select(ModuleProgress.module_id)
        .join(Module, Module.id == ModuleProgress.module_id)
        .where(ModuleProgress.enrollment_id == enrollment.id)
        .order_by(Module.position)
    )
    return [str(r) for r in rows]


def enrollment_view(db: Session, e: Enrollment, quiz_average: int | None = None, with_modules: bool = False) -> dict:
    from app.common.grading import js_round
    from app.enrollments.models import Certificate

    course = e.course
    modules = list(
        db.execute(
            select(Module.id, Module.minutes).where(Module.course_id == course.id).order_by(Module.position, Module.id)
        ).all()
    )
    total = len(modules)
    done_ids = completed_module_ids(db, e)
    done_set = set(done_ids)
    # Modul berikutnya yang belum selesai (tombol "Continue learning")
    next_index = next((i for i, (mid, _) in enumerate(modules) if str(mid) not in done_set), None)
    progress = js_round(float(e.progress_pct))
    certificate = db.scalar(select(Certificate).where(Certificate.enrollment_id == e.id))
    view = {
        "id": str(e.id),
        "studentId": str(e.user_id),
        "courseId": str(course.id),
        "course": {
            "id": str(course.id),
            "title": course.title,
            "slug": course.slug,
            "status": course.status.title(),
            "color": course.color,
            "thumbnailUrl": course.thumbnail_url,
            "certificate": course.issues_certificate,
            "totalMinutes": sum(m or 0 for _, m in modules),
            "instructorId": str(course.instructor_id),
            "instructorName": course.instructor.name if course.instructor else "Unassigned",
        },
        "completedModules": min(len(done_ids), total),
        "totalModules": total,
        "progress": progress,
        "learningStatus": "Completed" if e.status == "completed" or (total and progress >= 100) else "Active",
        "nextModuleId": str(modules[next_index][0]) if next_index is not None else None,
        "nextModuleNumber": next_index + 1 if next_index is not None else None,
        "quizAverage": quiz_average,
        "certificate": {"number": certificate.code, "date": _iso(certificate.issued_at)} if certificate else None,
        "enrolledAt": _iso(e.enrolled_at),
        "completedAt": _iso(e.completed_at),
    }
    if with_modules:
        view["completedModuleIds"] = done_ids
    return view


def enrollment_views(db: Session, enrollments: list[Enrollment]) -> list[dict]:
    from app.quizzes.service import quiz_average_by_enrollment

    averages: dict = {}
    for course_id in {e.course_id for e in enrollments}:
        averages.update(quiz_average_by_enrollment(db, course_id))
    return [enrollment_view(db, e, averages.get(e.id)) for e in enrollments]


def find_enrollment(db: Session, user_id, course_id) -> Enrollment | None:
    return db.scalar(select(Enrollment).where(Enrollment.user_id == user_id, Enrollment.course_id == course_id))


def enroll(db: Session, user, course: Course) -> Enrollment:
    """Daftar sendiri ke course gratis: Active, belum terdaftar, bukan milik sendiri (selalu terbuka — ADR-009)."""
    from app.common.errors import conflict

    if course.instructor_id == user.id:
        raise conflict("OWN_COURSE", "You cannot enroll in your own course. Manage it from your instructor dashboard.")
    if course.status != "active":
        raise conflict("COURSE_NOT_ACTIVE", "Only approved (active) courses accept new students.")
    if find_enrollment(db, user.id, course.id):
        raise conflict("ALREADY_ENROLLED", "You are already enrolled in this course.")
    enrollment = Enrollment(user_id=user.id, course_id=course.id)
    db.add(enrollment)
    db.flush()
    apply_progress(db, enrollment)
    db.commit()
    return enrollment


def complete_module(db: Session, user, enrollment_id: str, module_id: str) -> Enrollment:
    """Tandai modul selesai. Modul harus diselesaikan berurutan; idempoten untuk modul yang sudah selesai."""
    from app.common.errors import assert_valid, conflict, not_found
    from app.common.util import parse_uuid

    eid = parse_uuid(enrollment_id)
    enrollment = db.get(Enrollment, eid) if eid else None
    if not enrollment or enrollment.user_id != user.id:
        raise not_found("Enrollment")
    if enrollment.course.status == "archived":
        raise conflict("COURSE_ARCHIVED", "This course is archived. Modules are read-only.")
    modules = list(
        db.scalars(select(Module).where(Module.course_id == enrollment.course_id).order_by(Module.position, Module.id))
    )
    target = next((i for i, m in enumerate(modules) if str(m.id) == str(parse_uuid(module_id))), None)
    if target is None:
        assert_valid({"moduleId": "Module not found in this course."})
    done = set(completed_module_ids(db, enrollment))
    if str(modules[target].id) in done:
        return enrollment
    first_open = next((i for i, m in enumerate(modules) if str(m.id) not in done), len(modules))
    if target > first_open:
        raise conflict("MODULE_LOCKED", f"Complete module {first_open + 1} first.")
    db.add(ModuleProgress(enrollment_id=enrollment.id, module_id=modules[target].id))
    db.flush()
    apply_progress(db, enrollment)
    db.commit()
    return enrollment


def my_enrollments(db: Session, user, status, q, sort, page, page_size) -> dict:
    from app.common.pagination import paginate

    enrollments = list(db.scalars(select(Enrollment).where(Enrollment.user_id == user.id)))
    items = enrollment_views(db, enrollments)
    if status:
        items = [e for e in items if e["learningStatus"] == status]
    if q and q.strip():
        needle = q.strip().lower()
        items = [
            e
            for e in items
            if any(needle in (v or "").lower() for v in (e["course"]["title"], e["course"]["instructorName"]))
        ]
    return paginate([{**e, "title": e["course"]["title"]} for e in items], page, page_size, sort, "title")
