"""Logika quiz (CRUD, attempt, penilaian di server)."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.grading import average, js_round
from app.enrollments.models import Enrollment
from app.quizzes.models import Quiz, QuizAttempt


def best_scores(db: Session, enrollment_ids: list[uuid.UUID]) -> dict[tuple[uuid.UUID, uuid.UUID], float]:
    """Skor terbaik per (enrollment, quiz) dari attempt yang sudah submitted."""
    best: dict[tuple[uuid.UUID, uuid.UUID], float] = {}
    rows = db.execute(
        select(QuizAttempt.enrollment_id, QuizAttempt.quiz_id, QuizAttempt.score).where(
            QuizAttempt.enrollment_id.in_(enrollment_ids),
            QuizAttempt.status == "submitted",
            QuizAttempt.score.is_not(None),
        )
    ).all()
    for enrollment_id, quiz_id, score in rows:
        key = (enrollment_id, quiz_id)
        best[key] = max(best.get(key, 0.0), float(score))
    return best


def quiz_average_by_enrollment(db: Session, course_id: uuid.UUID) -> dict[uuid.UUID, int | None]:
    """Rata-rata skor terbaik dari semua quiz course yang sudah dikerjakan (averageQuiz di prototipe)."""
    enrollment_ids = list(db.scalars(select(Enrollment.id).where(Enrollment.course_id == course_id)))
    quiz_ids = list(db.scalars(select(Quiz.id).where(Quiz.course_id == course_id)))
    best = best_scores(db, enrollment_ids)
    result: dict[uuid.UUID, int | None] = {}
    for eid in enrollment_ids:
        scores = [best[(eid, qid)] for qid in quiz_ids if (eid, qid) in best]
        result[eid] = js_round(average(scores)) if scores else None
    return result
