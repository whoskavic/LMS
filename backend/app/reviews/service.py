"""Ulasan course: satu ulasan per enrollment, rating 1–5 dan komentar opsional (maks 1000 karakter).

Agregat rating (rata-rata + jumlah) dihitung lewat query, tidak disimpan di tabel courses.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import LEARNER_ROLES
from app.common.errors import ApiError, assert_valid, conflict, forbidden, not_found
from app.common.pagination import clamp_page
from app.common.util import parse_uuid
from app.courses.models import Course
from app.courses.service import find_course, is_owner, iso
from app.enrollments.models import Enrollment
from app.reviews.models import Review
from app.reviews.schemas import ReviewIn
from app.users.models import User

COMMENT_MAX = 1000


def rating_stats(db: Session, course_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[float | None, int]]:
    """(rata-rata rating dibulatkan 1 desimal, jumlah ulasan) per course."""
    if not course_ids:
        return {}
    rows = db.execute(
        select(Review.course_id, func.avg(Review.rating), func.count())
        .where(Review.course_id.in_(course_ids))
        .group_by(Review.course_id)
    ).all()
    found = {cid: (round(float(avg), 1), int(n)) for cid, avg, n in rows}
    return {cid: found.get(cid, (None, 0)) for cid in course_ids}


def review_view(r: Review) -> dict:
    return {
        "id": str(r.id),
        "courseId": str(r.course_id),
        "userId": str(r.user_id),
        "userName": r.user.name if r.user else "Learner",
        "rating": r.rating,
        "comment": r.comment or "",
        "createdAt": iso(r.created_at),
        "updatedAt": iso(r.updated_at),
    }


def _public_course(db: Session, course_id: str) -> Course:
    course = find_course(db, course_id)
    if course.status != "active":
        raise not_found("Course")
    return course


def list_reviews(db: Session, course_id: str, page: int | None, page_size: int | None) -> dict:
    """Ulasan terbaru dulu + ringkasan (rata-rata, jumlah, distribusi bintang 5→1)."""
    course = _public_course(db, course_id)
    base = select(Review).where(Review.course_id == course.id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    page, size = clamp_page(total, page, page_size, default_size=10)
    rows = db.scalars(base.order_by(Review.created_at.desc(), Review.id).offset((page - 1) * size).limit(size))
    counts = dict(
        db.execute(
            select(Review.rating, func.count()).where(Review.course_id == course.id).group_by(Review.rating)
        ).all()
    )
    average, count = rating_stats(db, [course.id])[course.id]
    return {
        "items": [review_view(r) for r in rows.unique()],
        "total": total,
        "page": page,
        "pageSize": size,
        "summary": {
            "average": average,
            "count": count,
            "distribution": [{"stars": s, "count": int(counts.get(s, 0))} for s in (5, 4, 3, 2, 1)],
        },
    }


def _validate(body: ReviewIn) -> tuple[int, str | None]:
    rating = body.rating
    comment = (body.comment or "").strip() or None
    assert_valid(
        {
            "rating": "" if isinstance(rating, int) and 1 <= rating <= 5 else "Choose a rating from 1 to 5 stars.",
            "comment": f"Review must be at most {COMMENT_MAX} characters."
            if comment and len(comment) > COMMENT_MAX
            else "",
        }
    )
    return rating, comment


def my_review(db: Session, user: User, course: Course) -> Review | None:
    return db.scalar(select(Review).where(Review.user_id == user.id, Review.course_id == course.id))


def create_review(db: Session, user: User, course_id: str, body: ReviewIn) -> Review:
    course = _public_course(db, course_id)
    if user.role not in LEARNER_ROLES:
        raise forbidden("Only learners can review courses.")
    if is_owner(user, course):
        raise forbidden("You cannot review your own course.")
    enrollment = db.scalar(select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == course.id))
    if not enrollment:
        raise ApiError(403, "NOT_ENROLLED", "Enroll in this course before writing a review.")
    if db.scalar(select(Review.id).where(Review.enrollment_id == enrollment.id)):
        raise conflict("ALREADY_REVIEWED", "You have already reviewed this course. Edit your review instead.")
    rating, comment = _validate(body)
    review = Review(enrollment_id=enrollment.id, course_id=course.id, user_id=user.id, rating=rating, comment=comment)
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


def find_review(db: Session, review_id: str) -> Review:
    uid = parse_uuid(review_id)
    review = db.get(Review, uid) if uid else None
    if not review:
        raise not_found("Review")
    return review


def update_review(db: Session, user: User, review_id: str, body: ReviewIn) -> Review:
    review = find_review(db, review_id)
    if review.user_id != user.id:
        raise forbidden("You can only edit your own review.")
    review.rating, review.comment = _validate(body)
    db.commit()
    db.refresh(review)
    return review


def delete_review(db: Session, user: User, review_id: str) -> None:
    review = find_review(db, review_id)
    if review.user_id != user.id and user.role != "admin":
        raise forbidden("You can only delete your own review.")
    db.delete(review)
    db.commit()
