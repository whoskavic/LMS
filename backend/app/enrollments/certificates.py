"""Sertifikat kelulusan: course menerbitkan sertifikat, punya modul, dan progress 100%."""

import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enrollments.models import Certificate, Enrollment

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # tanpa huruf/angka yang mirip (O/0, I/1)


def new_code(course_code: str | None) -> str:
    prefix = "".join(ch for ch in (course_code or "COURSE").upper() if ch.isalnum())[:8] or "COURSE"
    random_part = "".join(secrets.choice(ALPHABET) for _ in range(12))
    return f"LRN-{prefix}-{random_part}"  # maks. 4 + 8 + 1 + 12 = 25 karakter


def is_eligible(enrollment: Enrollment) -> bool:
    return bool(enrollment.course.issues_certificate) and enrollment.progress_pct >= 100


def issue_certificate_if_eligible(db: Session, enrollment: Enrollment) -> Certificate | None:
    existing = db.scalar(select(Certificate).where(Certificate.enrollment_id == enrollment.id))
    if existing or not is_eligible(enrollment):
        return existing
    certificate = Certificate(enrollment_id=enrollment.id, code=new_code(enrollment.course.code))
    if enrollment.completed_at:
        certificate.issued_at = enrollment.completed_at
    db.add(certificate)
    db.flush()
    return certificate
