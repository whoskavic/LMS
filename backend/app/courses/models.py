import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.models import CreatedAt, Timestamps, UUIDPk, check_in
from app.db import Base

COURSE_STATUSES = ("draft", "pending", "active", "rejected", "archived")
MODULE_TYPES = ("lecture", "practice")


class Category(UUIDPk, CreatedAt, Base):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(80), unique=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)


class Course(UUIDPk, Timestamps, Base):
    __tablename__ = "courses"
    __table_args__ = (
        CheckConstraint("price >= 0", name="price_non_negative"),
        CheckConstraint(check_in("status", COURSE_STATUSES), name="status"),
        Index("ix_courses_status", "status"),
        Index("ix_courses_category_id", "category_id"),
        Index("ix_courses_instructor_id", "instructor_id"),
        Index("ix_courses_title_trgm", "title", postgresql_using="gin", postgresql_ops={"title": "gin_trgm_ops"}),
        Index(
            "ix_courses_description_trgm",
            "description",
            postgresql_using="gin",
            postgresql_ops={"description": "gin_trgm_ops"},
        ),
        Index("uq_courses_code", "code", unique=True, postgresql_where=text("code IS NOT NULL")),
    )

    instructor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(220), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    price: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    status: Mapped[str] = mapped_column(String(20), default="draft", server_default=text("'draft'"))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Tambahan dari prototipe — lihat docs/DECISIONS.md ADR-006
    code: Mapped[str | None] = mapped_column(String(12))
    semester: Mapped[str | None] = mapped_column(String(40))
    duration_weeks: Mapped[int | None] = mapped_column(Integer)
    start_date: Mapped[date | None] = mapped_column(Date)
    max_students: Mapped[int | None] = mapped_column(Integer)
    color: Mapped[str | None] = mapped_column(String(9))
    enrollment_open: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    issues_certificate: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))

    instructor = relationship("User", lazy="joined")
    category = relationship("Category", lazy="joined")


class CourseStatusLog(UUIDPk, CreatedAt, Base):
    __tablename__ = "course_status_logs"
    __table_args__ = (Index("ix_course_status_logs_course_id_created_at", "course_id", "created_at"),)

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text)

    actor = relationship("User", lazy="joined")


class Module(UUIDPk, Timestamps, Base):
    __tablename__ = "modules"
    __table_args__ = (
        CheckConstraint(check_in("type", MODULE_TYPES), name="type"),
        Index("ix_modules_course_id_position", "course_id", "position"),
    )

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(20))
    content: Mapped[str | None] = mapped_column(Text)
    video_url: Mapped[str | None] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(Integer)
    # Tambahan dari prototipe
    minutes: Mapped[int | None] = mapped_column(Integer)
    tasks: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
