"""Impor semua model agar terdaftar di Base.metadata (dipakai Alembic dan test)."""

from app.courses.models import Category, Course, CourseStatusLog, Module
from app.enrollments.models import Certificate, Enrollment, ModuleProgress
from app.quizzes.models import AttemptAnswer, Question, QuestionOption, Quiz, QuizAttempt
from app.reviews.models import Review
from app.users.models import User

__all__ = [
    "AttemptAnswer",
    "Category",
    "Certificate",
    "Course",
    "CourseStatusLog",
    "Enrollment",
    "Module",
    "ModuleProgress",
    "Question",
    "QuestionOption",
    "Quiz",
    "QuizAttempt",
    "Review",
    "User",
]
