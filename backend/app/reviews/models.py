import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.models import Timestamps, UUIDPk
from app.db import Base


class Review(UUIDPk, Timestamps, Base):
    """Ulasan course: satu per enrollment, rating 1–5 + komentar opsional."""

    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="rating_range"),
        Index("ix_reviews_course_id_created_at", "course_id", "created_at"),
    )

    enrollment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("enrollments.id", ondelete="CASCADE"), unique=True)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text)

    user = relationship("User", lazy="joined")
