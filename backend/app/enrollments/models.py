import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.models import UUIDPk, check_in, utcnow
from app.db import Base

ENROLLMENT_STATUSES = ("active", "completed")


class Enrollment(UUIDPk, Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id"),
        CheckConstraint(check_in("status", ENROLLMENT_STATUSES), name="status"),
        CheckConstraint("progress_pct >= 0 AND progress_pct <= 100", name="progress_pct_range"),
        CheckConstraint("final_score >= 0 AND final_score <= 100", name="final_score_range"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20), default="active", server_default=text("'active'"))
    progress_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal(0), server_default=text("0"))
    final_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    grade_letter: Mapped[str | None] = mapped_column(String(2))
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user = relationship("User", lazy="joined")
    course = relationship("Course", lazy="joined")


class ModuleProgress(UUIDPk, Base):
    __tablename__ = "module_progress"
    __table_args__ = (UniqueConstraint("enrollment_id", "module_id"),)

    enrollment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("enrollments.id", ondelete="CASCADE"))
    module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())


class Certificate(UUIDPk, Base):
    __tablename__ = "certificates"

    enrollment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("enrollments.id", ondelete="RESTRICT"), unique=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
