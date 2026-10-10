from sqlalchemy import Boolean, CheckConstraint, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.common.models import Timestamps, UUIDPk, check_in
from app.db import Base

ROLES = ("admin", "instructor", "student")


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(check_in("role", ROLES), name="role"),
        Index("uq_users_id_number", "id_number", unique=True, postgresql_where=text("id_number IS NOT NULL")),
    )

    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    # Tambahan dari prototipe (NIM / NIDN / Staff ID dan departemen) — lihat docs/DECISIONS.md ADR-006
    id_number: Mapped[str | None] = mapped_column(String(20))
    department: Mapped[str | None] = mapped_column(String(60))
