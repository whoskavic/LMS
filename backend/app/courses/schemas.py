from typing import Any

from app.common.schemas import CamelModel

STATUS_LABEL = {s: s.title() for s in ("draft", "pending", "active", "rejected", "archived")}
STATUS_VALUE = {v: k for k, v in STATUS_LABEL.items()}
TYPE_LABEL = {"lecture": "Lecture", "practice": "Practice"}
TYPE_VALUE = {v: k for k, v in TYPE_LABEL.items()}


class CourseIn(CamelModel):
    """Input form course. Semua opsional: Draft cukup judul (aturan lengkap di service)."""

    title: Any = None
    description: Any = None
    category: Any = None
    semester: Any = None
    duration: Any = None
    start_date: Any = None
    code: Any = None
    max_students: Any = None
    enrollment_open: Any = None
    certificate: Any = None
    thumbnail_url: Any = None


class TransitionIn(CamelModel):
    action: str = ""
    reason: str | None = None


class ModuleIn(CamelModel):
    title: Any = None
    type: Any = None
    minutes: Any = None
    content: Any = None
    tasks: Any = None
    video_url: Any = None


class OrderIn(CamelModel):
    ids: list[str] = []


class CategoryIn(CamelModel):
    name: str = ""
