"""Logika course: kategori, CRUD course, alur status, modul, dan katalog publik.

Aturan bisnis dan validasi dipindah dari MockServer (assets/js/api/transport-local.js),
dengan penyesuaian dari prompt (hapus permanen hanya Draft tanpa enrollment, reject wajib alasan).
"""

import re
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth.deps import LEARNER_ROLES
from app.common.errors import ApiError, assert_valid, conflict, forbidden, not_found
from app.common.grading import average, js_round
from app.common.pagination import clamp_page, paginate
from app.common.util import clean, is_int, parse_uuid, slugify, to_int
from app.courses.models import Category, Course, CourseStatusLog, Module
from app.courses.schemas import STATUS_LABEL, STATUS_VALUE, TYPE_LABEL, TYPE_VALUE, CourseIn, ModuleIn
from app.enrollments.models import Enrollment
from app.users.models import User

COURSE_COLORS = ["#c7d2fe", "#bbf7d0", "#fbcfe8", "#fef3c7", "#bae6fd", "#ddd6fe", "#fed7aa", "#cffafe"]
CODE_PATTERN = re.compile(r"^[A-Z]{2,5}-?\d{3}$")
URL_PATTERN = re.compile(r"^https?://\S+$")

# Mesin status course — izin per action (PERANCANGAN §2)
TRANSITIONS = {
    "submit": {"role": "instructor", "from": ("draft", "rejected"), "to": "pending"},
    "approve": {"role": "admin", "from": ("pending",), "to": "active"},
    "reject": {"role": "admin", "from": ("pending",), "to": "rejected"},
    "archive": {"role": "admin", "from": ("active",), "to": "archived"},
    "restore": {"role": "admin", "from": ("archived",), "to": "active"},
}


def now() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    return value.isoformat()


# ---------------------------------------------------------------------------
# Kategori
# ---------------------------------------------------------------------------
def category_view(c: Category, courses: int | None = None) -> dict:
    view = {"id": str(c.id), "name": c.name, "slug": c.slug}
    if courses is not None:
        view["courses"] = courses
    return view


def list_categories(db: Session) -> list[dict]:
    counts = dict(db.execute(select(Course.category_id, func.count()).group_by(Course.category_id)).all())
    return [category_view(c, counts.get(c.id, 0)) for c in db.scalars(select(Category).order_by(Category.name))]


def _category_name_error(db: Session, name: str, except_id: uuid.UUID | None = None) -> str:
    if not name:
        return "Category name is required."
    if len(name) > 80:
        return "Category name must be at most 80 characters."
    stmt = select(Category.id).where(func.lower(Category.name) == name.lower())
    if except_id:
        stmt = stmt.where(Category.id != except_id)
    return "This category already exists." if db.scalar(stmt) else ""


def create_category(db: Session, name: str) -> Category:
    name = clean(name)
    assert_valid({"name": _category_name_error(db, name)})
    category = Category(name=name, slug=_unique_slug(db, Category, name, 100))
    db.add(category)
    db.commit()
    return category


def get_category(db: Session, category_id: str) -> Category:
    category = db.get(Category, parse_uuid(category_id)) if parse_uuid(category_id) else None
    if not category:
        raise not_found("Category")
    return category


def update_category(db: Session, category_id: str, name: str) -> Category:
    category = get_category(db, category_id)
    name = clean(name)
    assert_valid({"name": _category_name_error(db, name, category.id)})
    category.name = name
    db.commit()
    return category


def delete_category(db: Session, category_id: str) -> None:
    db.delete(get_category(db, category_id))  # course.category_id → NULL (ON DELETE SET NULL)
    db.commit()


def _unique_slug(db: Session, model, text: str, max_length: int) -> str:
    base = slugify(text, max_length - 6)
    slug, n = base, 2
    while db.scalar(select(model.id).where(model.slug == slug)):
        slug, n = f"{base}-{n}", n + 1
    return slug


# ---------------------------------------------------------------------------
# Representasi course
# ---------------------------------------------------------------------------
def enrollment_stats(db: Session, course_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    """Jumlah student, rata-rata progress (dibulatkan seperti prototipe), dan jumlah selesai per course."""
    rows = db.execute(
        select(Enrollment.course_id, Enrollment.progress_pct).where(Enrollment.course_id.in_(course_ids))
    ).all()
    grouped: dict[uuid.UUID, list[int]] = {cid: [] for cid in course_ids}
    for course_id, pct in rows:
        grouped[course_id].append(js_round(float(pct)))
    return {
        cid: {
            "students": len(values),
            "avgProgress": js_round(average(values)),
            "completed": sum(1 for v in values if v == 100),
        }
        for cid, values in grouped.items()
    }


def rejection_reasons(db: Session, courses: list[Course]) -> dict[uuid.UUID, str | None]:
    ids = [c.id for c in courses if c.status == "rejected"]
    if not ids:
        return {}
    logs = db.scalars(
        select(CourseStatusLog)
        .where(CourseStatusLog.course_id.in_(ids), CourseStatusLog.to_status == "rejected")
        .order_by(CourseStatusLog.created_at)
    )
    return {log.course_id: log.note for log in logs}


def course_views(db: Session, courses: list[Course]) -> list[dict]:
    stats = enrollment_stats(db, [c.id for c in courses])
    reasons = rejection_reasons(db, courses)
    views = []
    for c in courses:
        s = stats[c.id]
        views.append(
            {
                "id": str(c.id),
                "slug": c.slug,
                "code": c.code or "",
                "title": c.title,
                "description": c.description or "",
                "category": c.category.name if c.category else "",
                "categoryId": str(c.category_id) if c.category_id else None,
                "semester": c.semester or "",
                "duration": c.duration_weeks,
                "startDate": iso(c.start_date) or "",
                "maxStudents": c.max_students,
                "color": c.color,
                "thumbnailUrl": c.thumbnail_url,
                "price": c.price,
                "enrollmentOpen": c.enrollment_open,
                "certificate": c.issues_certificate,
                "status": STATUS_LABEL[c.status],
                "instructorId": str(c.instructor_id),
                "instructorName": c.instructor.name if c.instructor else "Unassigned",
                "students": s["students"],
                "avgProgress": s["avgProgress"],
                "seatsLeft": max(0, c.max_students - s["students"]) if c.max_students else 0,
                "rejectionReason": reasons.get(c.id),
                "submittedAt": iso(c.submitted_at),
                "publishedAt": iso(c.published_at),
                "createdAt": iso(c.created_at),
                "updatedAt": iso(c.updated_at),
            }
        )
    return views


def course_view(db: Session, course: Course) -> dict:
    return course_views(db, [course])[0]


# ---------------------------------------------------------------------------
# Akses
# ---------------------------------------------------------------------------
def find_course(db: Session, course_id: str) -> Course:
    uid = parse_uuid(course_id)
    course = db.get(Course, uid) if uid else None
    if not course:
        raise not_found("Course")
    return course


def is_owner(user: User, course: Course) -> bool:
    return user.role == "instructor" and course.instructor_id == user.id


def is_enrolled(db: Session, user: User, course: Course) -> bool:
    return bool(
        db.scalar(select(Enrollment.id).where(Enrollment.user_id == user.id, Enrollment.course_id == course.id))
    )


def viewable_course(db: Session, user: User, course_id: str) -> Course:
    """Admin semua; instructor miliknya; learner (student/instructor) yang terdaftar atau course aktif yang terbuka."""
    course = find_course(db, course_id)
    if user.role == "admin" or is_owner(user, course):
        return course
    if user.role in LEARNER_ROLES and (
        is_enrolled(db, user, course) or (course.status == "active" and course.enrollment_open)
    ):
        return course
    if user.role == "student":
        raise not_found("Course")
    raise forbidden("You do not have access to this course.")


def owned_course(db: Session, user: User, course_id: str) -> Course:
    course = find_course(db, course_id)
    if not is_owner(user, course):
        raise forbidden("Only the course instructor can change this course.")
    return course


def managed_course(db: Session, user: User, course_id: str) -> Course:
    course = find_course(db, course_id)
    if user.role != "admin" and not is_owner(user, course):
        raise forbidden("You do not have access to this course.")
    return course


# ---------------------------------------------------------------------------
# Validasi & input course (courseErrors di MockServer)
# ---------------------------------------------------------------------------
def normalize_code(code: str) -> str:
    return code.upper().replace("-", "")


def course_input(body: CourseIn) -> dict:
    data = body.model_dump(exclude_unset=True)
    for key in ("title", "description", "category", "semester", "start_date", "thumbnail_url"):
        if key in data:
            data[key] = clean(data[key])
    if "code" in data:
        data["code"] = re.sub(r"\s", "", clean(data["code"]).upper())
    for key in ("duration", "max_students"):
        if key in data:
            raw = data[key]
            data[key] = None if raw in ("", None) else (to_int(raw) if is_int(raw) else raw)
    for key in ("enrollment_open", "certificate"):
        if key in data:
            data[key] = bool(data[key])
    return data


def course_errors(db: Session, c: dict, complete: bool, is_new: bool, enrolled: int = 0) -> dict[str, str]:
    def filled(v) -> bool:
        return v not in (None, "")

    def check(key: str, rule) -> str:
        value = c.get(key)
        return rule(value) if complete or filled(value) else ""

    def duration(v):
        if not filled(v):
            return "Duration is required."
        if not isinstance(v, int) or v < 1 or v > 52:
            return "Duration must be a whole number between 1 and 52 weeks."
        return ""

    def start_date(v):
        if not v:
            return "Start date is required."
        try:
            parsed = date.fromisoformat(v)
        except ValueError:
            return "Use the format YYYY-MM-DD."
        return "Start date cannot be in the past." if is_new and parsed < date.today() else ""

    def max_students(v):
        if not filled(v):
            return "Maximum students is required."
        if not isinstance(v, int) or v < 1 or v > 500:
            return "Enter a whole number between 1 and 500."
        return f"Cannot be lower than current enrollment ({enrolled})." if v < enrolled else ""

    def category(v):
        if not v:
            return "Please choose a category."
        exists = db.scalar(select(Category.id).where(func.lower(Category.name) == v.lower()))
        return "" if exists else "Please choose a category from the list."

    title = c.get("title") or ""
    return {
        "title": "Course title is required."
        if not title
        else "Title must be at least 5 characters."
        if len(title) < 5
        else "Title must be at most 100 characters."
        if len(title) > 100
        else "",
        "description": check(
            "description",
            lambda v: (
                "Description is required."
                if not v
                else f"Description must be at least 20 characters ({len(v)}/20)."
                if len(v) < 20
                else "Description must be at most 500 characters."
                if len(v) > 500
                else ""
            ),
        ),
        "category": check("category", category),
        "semester": check("semester", lambda v: "" if v else "Please choose a semester."),
        "duration": check("duration", duration),
        "startDate": check("start_date", start_date),
        "code": check(
            "code",
            lambda v: (
                "Course code is required."
                if not v
                else ""
                if CODE_PATTERN.match(v)
                else "Use a format like DES-405 or CS101."
            ),
        ),
        "maxStudents": check("max_students", max_students),
        "thumbnailUrl": ""
        if not c.get("thumbnail_url") or URL_PATTERN.match(c["thumbnail_url"])
        else "Enter a valid http(s) URL.",
    }


def assert_code_free(db: Session, code: str | None, except_id: uuid.UUID | None = None) -> None:
    if not code:
        return
    stmt = select(Course.id).where(func.upper(func.replace(Course.code, "-", "")) == normalize_code(code))
    if except_id:
        stmt = stmt.where(Course.id != except_id)
    if db.scalar(stmt):
        message = "This course code is already used by another course."
        raise conflict("CONFLICT", message, {"code": message})


def enrolled_count(db: Session, course: Course) -> int:
    return db.scalar(select(func.count()).select_from(Enrollment).where(Enrollment.course_id == course.id)) or 0


def _apply(db: Session, course: Course, data: dict) -> None:
    if "title" in data:
        course.title = data["title"]
    if "description" in data:
        course.description = data["description"] or None
    if "category" in data:
        name = data["category"]
        course.category = db.scalar(select(Category).where(func.lower(Category.name) == name.lower())) if name else None
    if "semester" in data:
        course.semester = data["semester"] or None
    if "duration" in data:
        course.duration_weeks = data["duration"]
    if "start_date" in data:
        course.start_date = date.fromisoformat(data["start_date"]) if data["start_date"] else None
    if "code" in data:
        course.code = data["code"] or None
    if "max_students" in data:
        course.max_students = data["max_students"]
    if "enrollment_open" in data:
        course.enrollment_open = data["enrollment_open"]
    if "certificate" in data:
        course.issues_certificate = data["certificate"]
    if "thumbnail_url" in data:
        course.thumbnail_url = data["thumbnail_url"] or None


def log_status(db: Session, course: Course, actor: User, from_status: str | None, to_status: str, note=None):
    db.add(
        CourseStatusLog(course_id=course.id, actor_id=actor.id, from_status=from_status, to_status=to_status, note=note)
    )


def create_course(db: Session, user: User, body: CourseIn) -> Course:
    data = {"title": "", **course_input(body)}
    assert_valid(course_errors(db, data, complete=False, is_new=True))
    assert_code_free(db, data.get("code"))
    count = db.scalar(select(func.count()).select_from(Course)) or 0
    course = Course(
        instructor_id=user.id,
        title=data["title"],
        slug=_unique_slug(db, Course, data["title"], 220),
        status="draft",
        price=0,
        color=COURSE_COLORS[count % len(COURSE_COLORS)],
        enrollment_open=data.get("enrollment_open", True),
        issues_certificate=data.get("certificate", False),
    )
    _apply(db, course, data)
    db.add(course)
    db.flush()
    log_status(db, course, user, None, "draft")
    db.commit()
    return course


def update_course(db: Session, user: User, course_id: str, body: CourseIn) -> Course:
    course = owned_course(db, user, course_id)
    current = course_input_from_model(course)
    data = {**current, **course_input(body)}
    errors = course_errors(
        db, data, complete=course.status != "draft", is_new=False, enrolled=enrolled_count(db, course)
    )
    assert_valid(errors)
    assert_code_free(db, data.get("code"), course.id)
    _apply(db, course, course_input(body))
    db.commit()
    return course


def course_input_from_model(course: Course) -> dict:
    return {
        "title": course.title,
        "description": course.description or "",
        "category": course.category.name if course.category else "",
        "semester": course.semester or "",
        "duration": course.duration_weeks,
        "start_date": iso(course.start_date) or "",
        "code": course.code or "",
        "max_students": course.max_students,
        "thumbnail_url": course.thumbnail_url or "",
    }


def delete_course(db: Session, user: User, course_id: str) -> None:
    """Hapus permanen hanya untuk Draft tanpa enrollment; selain itu arsipkan."""
    course = find_course(db, course_id)
    if user.role == "instructor" and not is_owner(user, course):
        raise forbidden("Only the course instructor can delete this course.")
    if user.role == "student":
        raise forbidden()
    if course.status != "draft" or enrolled_count(db, course):
        raise conflict(
            "COURSE_NOT_DELETABLE",
            "Only draft courses without enrollments can be deleted permanently. Archive the course instead.",
        )
    db.delete(course)
    db.commit()


def transition(db: Session, user: User, course_id: str, action: str, reason: str | None) -> Course:
    rule = TRANSITIONS.get(action)
    if not rule:
        assert_valid({"action": f"Unknown action. Use one of: {', '.join(TRANSITIONS)}."})
    course = find_course(db, course_id)
    if user.role != rule["role"]:
        who = "administrators" if rule["role"] == "admin" else "the course instructor"
        raise forbidden(f"Only {who} can {action} a course.")
    if rule["role"] == "instructor" and not is_owner(user, course):
        raise forbidden("Only the course instructor can submit this course.")
    if course.status not in rule["from"]:
        raise conflict("INVALID_TRANSITION", f"Cannot {action} a course that is {course.status}.")
    note = clean(reason)[:500] or None
    if action == "reject" and not note:
        assert_valid({"reason": "Explain why the course is rejected so the instructor can revise it."})
    if action == "submit":
        errors = course_errors(
            db,
            course_input_from_model(course),
            complete=True,
            is_new=False,
            enrolled=enrolled_count(db, course),
        )
        if any(errors.values()):
            raise ApiError(
                400,
                "INCOMPLETE_COURSE",
                "Complete all required course details before submitting for approval.",
                errors,
            )
        course.submitted_at = now()
    if action == "approve" and not course.published_at:
        course.published_at = now()
    previous = course.status
    course.status = rule["to"]
    log_status(db, course, user, previous, course.status, note)
    db.commit()
    return course


def status_logs(db: Session, course: Course) -> list[dict]:
    logs = db.scalars(
        select(CourseStatusLog).where(CourseStatusLog.course_id == course.id).order_by(CourseStatusLog.created_at)
    )
    return [
        {
            "id": str(log.id),
            "fromStatus": STATUS_LABEL.get(log.from_status) if log.from_status else None,
            "toStatus": STATUS_LABEL[log.to_status],
            "note": log.note,
            "actorName": log.actor.name if log.actor else "System",
            "createdAt": iso(log.created_at),
        }
        for log in logs
    ]


# ---------------------------------------------------------------------------
# Daftar course (login) & katalog publik
# ---------------------------------------------------------------------------
def list_courses(
    db: Session, user: User, q, status, category, semester, instructor_id, open_only, sort, page, page_size
) -> dict:
    stmt = select(Course)
    learner_view = user.role == "student" or (user.role == "instructor" and open_only)
    if learner_view:
        # Course yang bisa didaftari learner: Active, terbuka, belum diikuti, bukan milik sendiri
        if not open_only:
            raise forbidden("Students can list open courses with ?open=true or their own courses with /me/enrollments.")
        enrolled = select(Enrollment.course_id).where(Enrollment.user_id == user.id)
        stmt = stmt.where(
            Course.status == "active",
            Course.enrollment_open.is_(True),
            Course.id.not_in(enrolled),
            Course.instructor_id != user.id,
        )
    elif user.role == "instructor":
        stmt = stmt.where(Course.instructor_id == user.id)
    if status:
        stmt = stmt.where(Course.status == STATUS_VALUE.get(status, status.lower()))
    if category:
        stmt = stmt.join(Category, Course.category_id == Category.id).where(Category.name == category)
    if semester:
        stmt = stmt.where(Course.semester == semester)
    if instructor_id and parse_uuid(instructor_id):
        stmt = stmt.where(Course.instructor_id == parse_uuid(instructor_id))
    if q and q.strip():
        needle = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Course.title.ilike(needle),
                Course.code.ilike(needle),
                Course.instructor_id.in_(select(User.id).where(User.name.ilike(needle))),
            )
        )
    items = course_views(db, list(db.scalars(stmt).unique()))
    if learner_view:
        items = [c for c in items if not c["maxStudents"] or c["seatsLeft"] > 0]
    return paginate(items, page, page_size, sort, "title")


def catalog_card(view: dict, modules: int) -> dict:
    keys = (
        "id",
        "slug",
        "code",
        "title",
        "description",
        "category",
        "semester",
        "duration",
        "color",
        "thumbnailUrl",
        "price",
        "certificate",
        "enrollmentOpen",
        "instructorName",
        "students",
        "seatsLeft",
        "maxStudents",
        "startDate",
    )
    return {**{k: view[k] for k in keys}, "modules": modules}


def module_counts(db: Session, course_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    rows = db.execute(
        select(Module.course_id, func.count()).where(Module.course_id.in_(course_ids)).group_by(Module.course_id)
    ).all()
    return dict(rows)


def catalog(
    db: Session,
    q: str | None,
    category: str | None,
    sort: str | None,
    page: int | None,
    page_size: int | None,
) -> dict:
    """Katalog publik: hanya course active. Pencarian ILIKE di title & description (index GIN pg_trgm)."""
    stmt = select(Course).where(Course.status == "active")
    if q and q.strip():
        needle = f"%{q.strip()}%"
        stmt = stmt.where(or_(Course.title.ilike(needle), Course.description.ilike(needle)))
    if category:
        stmt = stmt.join(Category, Course.category_id == Category.id).where(
            or_(Category.name == category, Category.slug == category)
        )
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    page, size = clamp_page(total, page, page_size, default_size=12)
    order = {
        "newest": Course.published_at.desc().nullslast(),
        "-title": Course.title.desc(),
    }.get(sort or "", Course.title.asc())
    courses = list(db.scalars(stmt.order_by(order, Course.id).offset((page - 1) * size).limit(size)).unique())
    counts = module_counts(db, [c.id for c in courses])
    items = [catalog_card(v, counts.get(c.id, 0)) for c, v in zip(courses, course_views(db, courses), strict=True)]
    return {"items": items, "total": total, "page": page, "pageSize": size}


def catalog_detail(db: Session, id_or_slug: str) -> dict:
    uid = parse_uuid(id_or_slug)
    course = db.get(Course, uid) if uid else db.scalar(select(Course).where(Course.slug == id_or_slug))
    if not course or course.status != "active":
        raise not_found("Course")
    from app.quizzes.models import Quiz

    modules = modules_of(db, course)
    quizzes = db.scalar(select(func.count()).select_from(Quiz).where(Quiz.course_id == course.id)) or 0
    view = catalog_card(course_view(db, course), len(modules))
    view["outline"] = [
        {"order": m.position, "title": m.title, "type": TYPE_LABEL[m.type], "minutes": m.minutes} for m in modules
    ]
    view["quizzes"] = quizzes
    return view


# ---------------------------------------------------------------------------
# Statistik course
# ---------------------------------------------------------------------------
def course_stats(db: Session, course: Course) -> dict:
    from app.quizzes.models import Quiz
    from app.quizzes.service import quiz_average_by_enrollment

    s = enrollment_stats(db, [course.id])[course.id]
    progress = [
        js_round(float(p)) for p in db.scalars(select(Enrollment.progress_pct).where(Enrollment.course_id == course.id))
    ]
    buckets = [0, 0, 0, 0, 0]
    for p in progress:
        buckets[4 if p == 100 else min(3, p // 25)] += 1
    quiz_scores = [v for v in quiz_average_by_enrollment(db, course.id).values() if v is not None]
    ranges = ["0–24%", "25–49%", "50–74%", "75–99%", "100%"]
    return {
        **s,
        "avgQuiz": js_round(average(quiz_scores)) if quiz_scores else None,
        "modules": db.scalar(select(func.count()).select_from(Module).where(Module.course_id == course.id)) or 0,
        "quizzes": db.scalar(select(func.count()).select_from(Quiz).where(Quiz.course_id == course.id)) or 0,
        "capacity": course.max_students,
        "progressDistribution": [{"range": r, "students": buckets[i]} for i, r in enumerate(ranges)],
    }


# ---------------------------------------------------------------------------
# Modul
# ---------------------------------------------------------------------------
def modules_of(db: Session, course: Course) -> list[Module]:
    return list(db.scalars(select(Module).where(Module.course_id == course.id).order_by(Module.position, Module.id)))


def module_view(m: Module) -> dict:
    return {
        "id": str(m.id),
        "courseId": str(m.course_id),
        "order": m.position,
        "title": m.title,
        "type": TYPE_LABEL[m.type],
        "minutes": m.minutes,
        "content": m.content or "",
        "tasks": list(m.tasks or []),
        "videoUrl": m.video_url,
    }


def module_input(body: ModuleIn) -> dict:
    data = body.model_dump(exclude_unset=True)
    for key in ("title", "content", "video_url", "type"):
        if key in data:
            data[key] = clean(data[key])
    if "minutes" in data and is_int(data["minutes"]):
        data["minutes"] = to_int(data["minutes"])
    if "tasks" in data and isinstance(data["tasks"], list):
        data["tasks"] = [t for t in (clean(t) for t in data["tasks"]) if t]
    return data


def module_errors(m: dict) -> dict[str, str]:
    title, content, minutes, tasks = (
        m.get("title") or "",
        m.get("content") or "",
        m.get("minutes"),
        m.get("tasks"),
    )
    return {
        "title": "Module title is required."
        if not title
        else "Title must be at least 5 characters."
        if len(title) < 5
        else "Title must be at most 80 characters."
        if len(title) > 80
        else "",
        "type": "" if m.get("type") in TYPE_VALUE else "Choose Lecture or Practice.",
        "minutes": ""
        if isinstance(minutes, int) and 1 <= minutes <= 180
        else "Enter a whole number between 1 and 180.",
        "content": "Content is required."
        if not content
        else f"Content must be at least 20 characters ({len(content)}/20)."
        if len(content) < 20
        else "",
        "tasks": "Tasks must be a list."
        if not isinstance(tasks, list)
        else "Add at least one task for a Practice module."
        if m.get("type") == "Practice" and not tasks
        else "",
        "videoUrl": "" if not m.get("video_url") or URL_PATTERN.match(m["video_url"]) else "Enter a valid http(s) URL.",
    }


def _refresh_progress(db: Session, course: Course) -> None:
    from app.enrollments.service import recompute_course_progress

    recompute_course_progress(db, course)


def create_module(db: Session, user: User, course_id: str, body: ModuleIn) -> Module:
    course = owned_course(db, user, course_id)
    data = {"title": "", "type": "Lecture", "minutes": None, "content": "", "tasks": [], **module_input(body)}
    assert_valid(module_errors(data))
    position = (db.scalar(select(func.max(Module.position)).where(Module.course_id == course.id)) or 0) + 1
    module = Module(
        course_id=course.id,
        title=data["title"],
        type=TYPE_VALUE[data["type"]],
        minutes=data["minutes"],
        content=data["content"],
        tasks=data["tasks"],
        video_url=data.get("video_url") or None,
        position=position,
    )
    db.add(module)
    db.flush()
    _refresh_progress(db, course)
    db.commit()
    return module


def find_module(db: Session, module_id: str) -> Module:
    uid = parse_uuid(module_id)
    module = db.get(Module, uid) if uid else None
    if not module:
        raise not_found("Module")
    return module


def update_module(db: Session, user: User, module_id: str, body: ModuleIn) -> Module:
    module = find_module(db, module_id)
    owned_course(db, user, str(module.course_id))
    current = {k: v for k, v in module_view(module).items() if k in ("title", "type", "minutes", "content", "tasks")}
    current["video_url"] = module.video_url or ""
    data = {**current, **module_input(body)}
    assert_valid(module_errors(data))
    module.title, module.type, module.minutes = data["title"], TYPE_VALUE[data["type"]], data["minutes"]
    module.content, module.tasks, module.video_url = (
        data["content"],
        data["tasks"],
        data.get("video_url") or None,
    )
    db.commit()
    return module


def delete_module(db: Session, user: User, module_id: str) -> None:
    module = find_module(db, module_id)
    course = owned_course(db, user, str(module.course_id))
    db.delete(module)
    db.flush()
    for i, m in enumerate(modules_of(db, course), start=1):
        m.position = i
    _refresh_progress(db, course)
    db.commit()


def reorder_modules(db: Session, user: User, course_id: str, ids: list[str]) -> list[Module]:
    course = owned_course(db, user, course_id)
    modules = {str(m.id): m for m in modules_of(db, course)}
    if len(ids) != len(modules) or set(ids) != set(modules):
        assert_valid({"ids": "Send every module ID of this course exactly once."})
    for i, module_id in enumerate(ids, start=1):
        modules[module_id].position = i
    db.commit()
    return modules_of(db, course)


def list_modules(db: Session, user: User, course_id: str) -> list[Module]:
    return modules_of(db, viewable_course(db, user, course_id))
