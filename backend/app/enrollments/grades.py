"""Nilai akhir (instructor), tambah/keluarkan student, sertifikat."""

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.common.errors import assert_valid, conflict, not_found
from app.common.grading import grade_from_score, js_round
from app.common.pagination import paginate
from app.common.util import is_int, parse_uuid, to_int
from app.courses.models import Course
from app.enrollments.models import Certificate, Enrollment
from app.enrollments.service import apply_progress, assert_seats, find_enrollment
from app.quizzes.service import quiz_average_by_enrollment
from app.users.models import User


def grade_rows(db: Session, course: Course) -> list[dict]:
    enrollments = list(db.scalars(select(Enrollment).where(Enrollment.course_id == course.id)))
    averages = quiz_average_by_enrollment(db, course.id)
    return [
        {
            "enrollmentId": str(e.id),
            "studentId": str(e.user_id),
            "name": e.user.name,
            "nim": e.user.id_number or "",
            "email": e.user.email,
            "progress": js_round(float(e.progress_pct)),
            "quiz": averages.get(e.id),
            "finalScore": js_round(float(e.final_score)) if e.final_score is not None else None,
            "grade": e.grade_letter,
        }
        for e in enrollments
    ]


def list_grades(db: Session, course: Course, sort, page, page_size) -> dict:
    return paginate(grade_rows(db, course), page, page_size, sort, "name")


def save_grades(db: Session, course: Course, grades: list[dict]) -> list[dict]:
    """grades: [{ enrollmentId, finalScore: 0–100 | null }] → grade huruf otomatis (skala prototipe)."""
    if not grades:
        assert_valid({"grades": "Send at least one grade."})
    fields: dict[str, str] = {}
    parsed = []
    for g in grades:
        eid = parse_uuid((g or {}).get("enrollmentId"))
        enrollment = db.get(Enrollment, eid) if eid else None
        score = (g or {}).get("finalScore")
        key = str((g or {}).get("enrollmentId"))
        if not enrollment or enrollment.course_id != course.id:
            fields[key] = "Student is not enrolled in this course."
        elif score is not None and (not is_int(score) or not 0 <= to_int(score) <= 100):
            fields[key] = "Enter a whole number from 0 to 100."
        else:
            parsed.append((enrollment, None if score is None else to_int(score)))
    assert_valid(fields)
    for enrollment, score in parsed:
        enrollment.final_score = score
        enrollment.grade_letter = grade_from_score(score)
    db.commit()
    return grade_rows(db, course)


def candidates(db: Session, course: Course, q: str | None) -> list[dict]:
    """Student aktif yang belum terdaftar (untuk modal "Add students")."""
    enrolled = select(Enrollment.user_id).where(Enrollment.course_id == course.id)
    stmt = select(User).where(User.role == "student", User.is_active.is_(True), User.id.not_in(enrolled))
    if q and q.strip():
        needle = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                User.name.ilike(needle),
                User.email.ilike(needle),
                User.id_number.ilike(needle),
                User.department.ilike(needle),
            )
        )
    return [
        {"id": str(u.id), "name": u.name, "idNumber": u.id_number, "department": u.department, "email": u.email}
        for u in db.scalars(stmt.order_by(User.name).limit(200))
    ]


def batch_enroll(db: Session, course: Course, student_ids: list[str]) -> list[Enrollment]:
    """Instructor menambahkan student (boleh walau pendaftaran mandiri ditutup), tetap cek kapasitas."""
    if course.status != "active":
        raise conflict("COURSE_NOT_ACTIVE", "Students can be added after the course is approved by the administrator.")
    ids = list(dict.fromkeys(parse_uuid(i) for i in student_ids or []))
    if not ids:
        assert_valid({"studentIds": "Select at least one student."})
    invalid = 0
    for uid in ids:
        user = db.get(User, uid) if uid else None
        if not user or user.role != "student" or not user.is_active or find_enrollment(db, uid, course.id):
            invalid += 1
    if invalid:
        s = "s are" if invalid > 1 else " is"
        assert_valid({"studentIds": f"{invalid} selected student{s} not available (inactive or already enrolled)."})
    assert_seats(db, course, len(ids))
    created = []
    for uid in ids:
        enrollment = Enrollment(user_id=uid, course_id=course.id)
        db.add(enrollment)
        db.flush()
        apply_progress(db, enrollment)
        created.append(enrollment)
    db.commit()
    return created


def remove_enrollment(db: Session, enrollment: Enrollment) -> None:
    if db.scalar(select(Certificate.id).where(Certificate.enrollment_id == enrollment.id)):
        raise conflict(
            "ENROLLMENT_CERTIFIED",
            "This student already received a certificate for this course, so the enrollment is kept.",
        )
    db.delete(enrollment)
    db.commit()


def find_enrollment_by_id(db: Session, enrollment_id: str) -> Enrollment:
    uid = parse_uuid(enrollment_id)
    enrollment = db.get(Enrollment, uid) if uid else None
    if not enrollment:
        raise not_found("Enrollment")
    return enrollment


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
        "course": {"code": course.code or "", "title": course.title, "instructorName": course.instructor.name},
        "grade": enrollment.grade_letter,
    }
