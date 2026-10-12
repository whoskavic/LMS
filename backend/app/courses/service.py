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


def module_totals(db: Session, course_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[int, int]]:
    """(jumlah modul, total menit) per course — durasi course = total modules.minutes."""
    rows = db.execute(
        select(Module.course_id, func.count(), func.coalesce(func.sum(Module.minutes), 0))
        .where(Module.course_id.in_(course_ids))
        .group_by(Module.course_id)
    ).all()
    return {course_id: (int(n), int(minutes)) for course_id, n, minutes in rows}


def course_views(db: Session, courses: list[Course]) -> list[dict]:
    from app.reviews.service import rating_stats

    ids = [c.id for c in courses]
    stats = enrollment_stats(db, ids)
    ratings = rating_stats(db, ids)
    totals = module_totals(db, ids)
    reasons = rejection_reasons(db, courses)
    views = []
    for c in courses:
        s = stats[c.id]
        modules, minutes = totals.get(c.id, (0, 0))
        rating, reviews = ratings.get(c.id, (None, 0))
        views.append(
            {
                "id": str(c.id),
                "slug": c.slug,
                "title": c.title,
                "description": c.description or "",
                "category": c.category.name if c.category else "",
                "categoryId": str(c.category_id) if c.category_id else None,
                "color": c.color,
                "thumbnailUrl": c.thumbnail_url,
                "price": c.price,
                "certificate": c.issues_certificate,
                "status": STATUS_LABEL[c.status],
                "instructorId": str(c.instructor_id),
                "instructorName": c.instructor.name if c.instructor else "Unassigned",
                "students": s["students"],
                "avgProgress": s["avgProgress"],
                "modules": modules,
                "totalMinutes": minutes,
                "ratingAverage": rating,
                "reviewCount": reviews,
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
    if user.role in LEARNER_ROLES and (is_enrolled(db, user, course) or course.status == "active"):
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
def course_input(body: CourseIn) -> dict:
    data = body.model_dump(exclude_unset=True)
    for key in ("title", "description", "category", "thumbnail_url"):
        if key in data:
            data[key] = clean(data[key])
    if "certificate" in data:
        data["certificate"] = bool(data["certificate"])
    return data


def course_errors(db: Session, c: dict, complete: bool) -> dict[str, str]:
    """Draft cukup judul; course yang diajukan/terbit wajib deskripsi & kategori (courseErrors di MockServer,
    tanpa field akademik — ADR-009)."""

    def check(key: str, rule) -> str:
        value = c.get(key)
        return rule(value) if complete or value else ""

    def category(v):
        if not v:
            return "Please choose a category."
        exists = db.scalar(select(Category.id).where(func.lower(Category.name) == v.lower()))
        return "" if exists else "Please choose a category from the list."

    def description(v):
        if not v:
            return "Description is required."
        if len(v) < 20:
            return f"Description must be at least 20 characters ({len(v)}/20)."
        return "Description must be at most 500 characters." if len(v) > 500 else ""

    title = c.get("title") or ""
    if not title:
        title_error = "Course title is required."
    elif len(title) < 5:
        title_error = "Title must be at least 5 characters."
    elif len(title) > 100:
        title_error = "Title must be at most 100 characters."
    else:
        title_error = ""
    thumbnail = c.get("thumbnail_url")
    return {
        "title": title_error,
        "description": check("description", description),
        "category": check("category", category),
        "thumbnailUrl": "" if not thumbnail or URL_PATTERN.match(thumbnail) else "Enter a valid http(s) URL.",
    }


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
    assert_valid(course_errors(db, data, complete=False))
    count = db.scalar(select(func.count()).select_from(Course)) or 0
    course = Course(
        instructor_id=user.id,
        title=data["title"],
        slug=_unique_slug(db, Course, data["title"], 220),
        status="draft",
        price=0,
        color=COURSE_COLORS[count % len(COURSE_COLORS)],
        enrollment_open=True,
        issues_certificate=data.get("certificate", True),
    )
    _apply(db, course, data)
    db.add(course)
    db.flush()
    log_status(db, course, user, None, "draft")
    db.commit()
    return course


def update_course(db: Session, user: User, course_id: str, body: CourseIn) -> Course:
    course = owned_course(db, user, course_id)
    changes = course_input(body)
    data = {**course_input_from_model(course), **changes}
    assert_valid(course_errors(db, data, complete=course.status != "draft"))
    _apply(db, course, changes)
    db.commit()
    return course


def course_input_from_model(course: Course) -> dict:
    return {
        "title": course.title,
        "description": course.description or "",
        "category": course.category.name if course.category else "",
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
        errors = course_errors(db, course_input_from_model(course), complete=True)
        if any(errors.values()):
            raise ApiError(
                400,
                "INCOMPLETE_COURSE",
                "Complete all required course details before submitting for approval.",
                errors,
            )
        if not db.scalar(select(func.count()).select_from(Module).where(Module.course_id == course.id)):
            raise ApiError(400, "COURSE_HAS_NO_MODULES", "Add at least one module before submitting for approval.")
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
def list_courses(db: Session, user: User, q, status, category, instructor_id, open_only, sort, page, page_size) -> dict:
    stmt = select(Course)
    learner_view = user.role == "student" or (user.role == "instructor" and open_only)
    if learner_view:
        # Course yang bisa didaftari learner: Active, belum diikuti, bukan milik sendiri (selalu terbuka — ADR-009)
        if not open_only:
            raise forbidden("Students can list open courses with ?open=true or their own courses with /me/enrollments.")
        enrolled = select(Enrollment.course_id).where(Enrollment.user_id == user.id)
        stmt = stmt.where(Course.status == "active", Course.id.not_in(enrolled), Course.instructor_id != user.id)
    elif user.role == "instructor":
        stmt = stmt.where(Course.instructor_id == user.id)
    if status:
        stmt = stmt.where(Course.status == STATUS_VALUE.get(status, status.lower()))
    if category:
        stmt = stmt.join(Category, Course.category_id == Category.id).where(Category.name == category)
    if instructor_id and parse_uuid(instructor_id):
        stmt = stmt.where(Course.instructor_id == parse_uuid(instructor_id))
    if q and q.strip():
        needle = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Course.title.ilike(needle),
                Course.description.ilike(needle),
                Course.instructor_id.in_(select(User.id).where(User.name.ilike(needle))),
            )
        )
    items = course_views(db, list(db.scalars(stmt).unique()))
    return paginate(items, page, page_size, sort, "title")


CATALOG_KEYS = (
    "id",
    "slug",
    "title",
    "description",
    "category",
    "color",
    "thumbnailUrl",
    "price",
    "certificate",
    "instructorId",
    "instructorName",
    "students",
    "modules",
    "totalMinutes",
    "ratingAverage",
    "reviewCount",
    "publishedAt",
)


def catalog_card(view: dict) -> dict:
    return {k: view[k] for k in CATALOG_KEYS}


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
    learners = (
        select(func.count(Enrollment.id)).where(Enrollment.course_id == Course.id).correlate(Course).scalar_subquery()
    )
    from app.reviews.models import Review

    avg_rating = (
        select(func.avg(Review.rating)).where(Review.course_id == Course.id).correlate(Course).scalar_subquery()
    )
    review_count = (
        select(func.count(Review.id)).where(Review.course_id == Course.id).correlate(Course).scalar_subquery()
    )
    order = {
        "newest": [Course.published_at.desc().nullslast()],
        "rating": [avg_rating.desc().nullslast(), review_count.desc(), learners.desc()],
        "title": [Course.title.asc()],
        "-title": [Course.title.desc()],
    }.get(sort or "", [learners.desc(), Course.title.asc()])  # default "popular": jumlah peserta
    courses = list(db.scalars(stmt.order_by(*order, Course.id).offset((page - 1) * size).limit(size)).unique())
    items = [catalog_card(v) for v in course_views(db, courses)]
    return {"items": items, "total": total, "page": page, "pageSize": size}


def catalog_detail(db: Session, id_or_slug: str, user: User | None = None) -> dict:
    uid = parse_uuid(id_or_slug)
    course = db.get(Course, uid) if uid else db.scalar(select(Course).where(Course.slug == id_or_slug))
    if not course or course.status != "active":
        raise not_found("Course")
    from app.quizzes.models import Quiz

    modules = modules_of(db, course)
    quizzes = db.scalar(select(func.count()).select_from(Quiz).where(Quiz.course_id == course.id)) or 0
    view = catalog_card(course_view(db, course))
    view["outline"] = [
        {"order": m.position, "title": m.title, "type": TYPE_LABEL[m.type], "minutes": m.minutes} for m in modules
    ]
    view["quizzes"] = quizzes
    view["instructorHeadline"] = course.instructor.headline if course.instructor else None
    view["viewer"] = viewer_status(db, course, user)
    return view


def viewer_status(db: Session, course: Course, user: User | None) -> dict:
    """Status pengunjung landing page: menentukan tombol Enroll / Continue learning / Manage course."""
    if not user:
        return {"loggedIn": False, "role": None, "isOwner": False, "enrolled": False, "canEnroll": False}
    enrollment = db.scalar(select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == course.id))
    status = {
        "loggedIn": True,
        "role": user.role,
        "isOwner": is_owner(user, course),
        "enrolled": enrollment is not None,
        "canEnroll": user.role in LEARNER_ROLES and not is_owner(user, course) and enrollment is None,
    }
    if enrollment is not None:
        from app.enrollments.service import enrollment_view

        view = enrollment_view(db, enrollment)
        status.update(
            enrollmentId=view["id"],
            progress=view["progress"],
            nextModuleNumber=view["nextModuleNumber"],
            completed=view["learningStatus"] == "Completed",
        )
        from app.reviews.service import my_review, review_view

        review = my_review(db, user, course)
        status.update(canReview=review is None, myReview=review_view(review) if review else None)
    return status


def instructor_profile(db: Session, user_id: str) -> dict:
    """Profil publik instructor: headline, bio, statistik, dan course Active miliknya."""
    uid = parse_uuid(user_id)
    instructor = db.get(User, uid) if uid else None
    if not instructor or instructor.role != "instructor" or not instructor.is_active:
        raise not_found("Instructor")
    courses = list(
        db.scalars(
            select(Course)
            .where(Course.instructor_id == instructor.id, Course.status == "active")
            .order_by(Course.published_at.desc().nullslast(), Course.title)
        ).unique()
    )
    cards = [catalog_card(v) for v in course_views(db, courses)]
    reviews = sum(c["reviewCount"] for c in cards)
    weighted = sum((c["ratingAverage"] or 0) * c["reviewCount"] for c in cards)
    return {
        "id": str(instructor.id),
        "name": instructor.name,
        "headline": instructor.headline,
        "bio": instructor.bio,
        "stats": {
            "courses": len(cards),
            "learners": sum(c["students"] for c in cards),
            "reviews": reviews,
            "rating": round(weighted / reviews, 1) if reviews else None,
        },
        "courses": cards,
    }


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
