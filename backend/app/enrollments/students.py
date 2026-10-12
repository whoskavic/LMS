"""Daftar peserta course (read-only untuk instructor/admin) dan verifikasi sertifikat.

Input nilai akhir, batch enroll, dan kandidat student dihapus (ADR-009): learner enroll sendiri.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.errors import not_found
from app.common.grading import js_round
from app.common.pagination import paginate
from app.courses.models import Course
from app.enrollments.models import Certificate, Enrollment
from app.quizzes.service import best_quiz_score_by_enrollment


def student_rows(db: Session, course: Course) -> list[dict]:
    enrollments = list(db.scalars(select(Enrollment).where(Enrollment.course_id == course.id)))
    best = best_quiz_score_by_enrollment(db, course.id)
    certified = set(
        db.scalars(select(Certificate.enrollment_id).where(Certificate.enrollment_id.in_([e.id for e in enrollments])))
    )
    from app.courses.service import iso

    rows = []
    for e in enrollments:
        progress = js_round(float(e.progress_pct))
        rows.append(
            {
                "enrollmentId": str(e.id),
                "studentId": str(e.user_id),
                "name": e.user.name,
                "email": e.user.email,
                "progress": progress,
                "bestQuiz": best.get(e.id),
                "completed": e.status == "completed" or progress >= 100,
                "certificate": e.id in certified,
                "enrolledAt": iso(e.enrolled_at),
                "completedAt": iso(e.completed_at),
            }
        )
    return rows


def list_students(db: Session, course: Course, q, sort, page, page_size) -> dict:
    rows = student_rows(db, course)
    if q and q.strip():
        needle = q.strip().lower()
        rows = [r for r in rows if needle in r["name"].lower() or needle in r["email"].lower()]
    return paginate(rows, page, page_size, sort, "name")


def verify_certificate(db: Session, code: str) -> dict:
    certificate = db.scalar(select(Certificate).where(Certificate.code == (code or "").strip().upper()))
    if not certificate:
        raise not_found("Certificate")
    enrollment = db.get(Enrollment, certificate.enrollment_id)
    course = enrollment.course
    from app.courses.service import iso

    return {
        "valid": True,
        "number": certificate.code,
        "issuedAt": iso(certificate.issued_at),
        "studentName": enrollment.user.name,
        "course": {"title": course.title, "slug": course.slug, "instructorName": course.instructor.name},
    }
