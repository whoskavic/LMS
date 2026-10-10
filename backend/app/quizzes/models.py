import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.models import Timestamps, UUIDPk, check_in
from app.db import Base

ATTEMPT_STATUSES = ("in_progress", "submitted", "expired")


class Quiz(UUIDPk, Timestamps, Base):
    __tablename__ = "quizzes"
    __table_args__ = (
        CheckConstraint("duration_minutes > 0", name="duration_positive"),
        CheckConstraint("max_attempts >= 1", name="max_attempts_min"),
        CheckConstraint("passing_score >= 0 AND passing_score <= 100", name="passing_score_range"),
    )

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    module_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    max_attempts: Mapped[int] = mapped_column(Integer)
    # Tambahan dari prototipe
    passing_score: Mapped[int] = mapped_column(Integer, default=70, server_default=sa_text("70"))

    questions = relationship(
        "Question", order_by="Question.position", cascade="all, delete-orphan", passive_deletes=True
    )


class Question(UUIDPk, Base):
    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint("points >= 1", name="points_min"),
        Index("ix_questions_quiz_id_position", "quiz_id", "position"),
    )

    quiz_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    points: Mapped[int] = mapped_column(Integer, default=1, server_default=sa_text("1"))
    position: Mapped[int] = mapped_column(Integer)

    options = relationship(
        "QuestionOption",
        order_by="QuestionOption.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class QuestionOption(UUIDPk, Base):
    __tablename__ = "question_options"
    __table_args__ = (
        Index("ix_question_options_question_id_position", "question_id", "position"),
        Index(
            "uq_question_options_one_correct",
            "question_id",
            unique=True,
            postgresql_where=sa_text("is_correct = true"),
        ),
    )

    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_text("false"))
    position: Mapped[int] = mapped_column(Integer)


class QuizAttempt(UUIDPk, Base):
    __tablename__ = "quiz_attempts"
    __table_args__ = (
        UniqueConstraint("enrollment_id", "quiz_id", "attempt_number"),
        CheckConstraint(check_in("status", ATTEMPT_STATUSES), name="status"),
        Index(
            "uq_quiz_attempts_one_in_progress",
            "enrollment_id",
            "quiz_id",
            unique=True,
            postgresql_where=sa_text("status = 'in_progress'"),
        ),
    )

    enrollment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("enrollments.id", ondelete="CASCADE"))
    quiz_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"))
    attempt_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="in_progress")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))

    answers = relationship("AttemptAnswer", cascade="all, delete-orphan", passive_deletes=True)


class AttemptAnswer(UUIDPk, Base):
    __tablename__ = "attempt_answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id"),)

    attempt_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quiz_attempts.id", ondelete="CASCADE"))
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"))
    selected_option_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("question_options.id", ondelete="SET NULL"))
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
