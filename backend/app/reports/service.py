"""Laporan, aktivitas, dan dashboard — dihitung dari data (tanpa tabel tambahan).

Rumus dipindah dari prototipe (MockServer reportRows / reportStatus, dashboard.js, lecturer-dashboard.js).
"""

import csv
import io
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.common.grading import average, js_round
from app.common.pagination import paginate
from app.courses.models import Category, Course, CourseStatusLog
from app.courses.service import STATUS_LABEL, enrollment_stats, iso, module_counts
from app.enrollments.models import Enrollment
from app.quizzes.models import Quiz, QuizAttempt
from app.quizzes.service import quiz_average_by_enrollment
from app.users.models import User

VERB = {
    ("draft", None): "Created course",
    ("pending", "draft"): "Submitted for approval",
    ("pending", "rejected"): "Resubmitted for approval",
    ("active", "pending"): "Approved course",
    ("rejected", "pending"): "Rejected course",
    ("archived", "active"): "Archived course",
    ("active", "archived"): "Restored course",
}


def report_status(progress: int, quiz: int | None) -> str:
    if progress == 100:
        return "Completed"
    if progress < 40 or (quiz is not None and quiz < 65):
        return "At risk"
    return "On track"


def report_rows(db: Session, instructor_id=None) -> list[dict]:
    stmt = select(Enrollment).join(Course, Course.id == Enrollment.course_id)
    if instructor_id:
        stmt = stmt.where(Course.instructor_id == instructor_id)
    enrollments = list(db.scalars(stmt))
    averages: dict = {}
    for course_id in {e.course_id for e in enrollments}:
        averages.update(quiz_average_by_enrollment(db, course_id))
    rows = []
    for e in enrollments:
        progress = js_round(float(e.progress_pct))
        quiz = averages.get(e.id)
        rows.append(
            {
                "enrollmentId": str(e.id),
                "name": e.user.name,
                "nim": e.user.id_number or "",
                "courseId": str(e.course_id),
                "course": e.course.code or e.course.title,
                "courseTitle": e.course.title,
                "progress": progress,
                "quiz": quiz,
                "finalScore": js_round(float(e.final_score)) if e.final_score is not None else None,
                "grade": e.grade_letter,
                "status": report_status(progress, quiz),
            }
        )
    return rows


def filter_rows(rows: list[dict], course_id, status, q) -> list[dict]:
    if course_id:
        rows = [r for r in rows if r["courseId"] == str(course_id)]
    if status:
        rows = [r for r in rows if r["status"] == status]
    if q and q.strip():
        needle = q.strip().lower()
        rows = [r for r in rows if any(needle in (r[k] or "").lower() for k in ("name", "nim", "course"))]
    return rows


def summary(db: Session) -> dict:
    rows = report_rows(db)
    with_quiz = [r for r in rows if r["quiz"] is not None]
    completed = sum(1 for r in rows if r["status"] == "Completed")
    categories = db.execute(
        select(Category.name, func.count(Course.id))
        .join(Course, Course.category_id == Category.id)
        .group_by(Category.name)
    ).all()
    codes = sorted({r["course"] for r in with_quiz})
    return {
        "enrollments": len(rows),
        "completed": completed,
        "atRisk": sum(1 for r in rows if r["status"] == "At risk"),
        "completionRate": js_round(completed / len(rows) * 100) if rows else 0,
        "avgProgress": js_round(average([r["progress"] for r in rows])),
        "avgQuiz": js_round(average([r["quiz"] for r in with_quiz])) if with_quiz else None,
        "coursesByCategory": [{"category": name, "courses": n} for name, n in sorted(categories)],
        "quizByCourse": [
            {"course": code, "avgQuiz": js_round(average([r["quiz"] for r in with_quiz if r["course"] == code]))}
            for code in codes
        ],
    }


def enrollments_report(db: Session, course_id, status, q, sort, page, page_size) -> dict:
    return paginate(filter_rows(report_rows(db), course_id, status, q), page, page_size, sort, "name")


def enrollments_csv(db: Session, course_id, status, q, sort) -> str:
    from app.common.pagination import sort_items

    rows = sort_items(filter_rows(report_rows(db), course_id, status, q), sort or "name")
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Student", "NIM", "Course", "Progress", "Quiz", "Final score", "Grade", "Status"])
    for r in rows:
        writer.writerow(
            [
                r["name"],
                r["nim"],
                r["course"],
                f"{r['progress']}%",
                r["quiz"] if r["quiz"] is not None else "",
                r["finalScore"] if r["finalScore"] is not None else "",
                r["grade"] or "",
                r["status"],
            ]
        )
    return out.getvalue()


# ---------------------------------------------------------------------------
# Aktivitas sistem (diturunkan dari status log, enrollment, dan attempt quiz)
# ---------------------------------------------------------------------------
def activities(db: Session, limit: int = 20) -> list[dict]:
    items: list[dict] = []
    for log in db.scalars(select(CourseStatusLog).order_by(CourseStatusLog.created_at.desc()).limit(limit)):
        course = db.get(Course, log.course_id)
        verb = VERB.get((log.to_status, log.from_status), f"Changed status to {STATUS_LABEL[log.to_status]}")
        label = f"{course.code} {course.title}".strip() if course.code else course.title
        note = f" — {log.note}" if log.note else ""
        items.append({"time": log.created_at, "actor": log.actor.name, "action": f"{verb} {label}{note}"})
    for e in db.scalars(select(Enrollment).order_by(Enrollment.enrolled_at.desc()).limit(limit)):
        label = f"{e.course.code} {e.course.title}".strip() if e.course.code else e.course.title
        items.append({"time": e.enrolled_at, "actor": e.user.name, "action": f"Enrolled in {label}"})
        if e.completed_at:
            items.append({"time": e.completed_at, "actor": e.user.name, "action": f"Completed all modules of {label}"})
    attempts = db.scalars(
        select(QuizAttempt)
        .where(QuizAttempt.status == "submitted")
        .order_by(QuizAttempt.submitted_at.desc())
        .limit(limit)
    )
    for a in attempts:
        enrollment = db.get(Enrollment, a.enrollment_id)
        quiz = db.get(Quiz, a.quiz_id)
        items.append(
            {
                "time": a.submitted_at,
                "actor": enrollment.user.name,
                "action": f"Completed {quiz.title} with a score of {js_round(float(a.score))}",
            }
        )
    items.sort(key=lambda i: i["time"], reverse=True)
    return [{**i, "time": iso(i["time"])} for i in items[:limit]]


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
def enrollment_chart(db: Session, months: int = 6) -> dict:
    """Enrollment & penyelesaian per bulan (6 bulan terakhir)."""
    now = datetime.now(UTC)
    keys = []
    year, month = now.year, now.month
    for _ in range(months):
        keys.append((year, month))
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    keys.reverse()
    enrolled = {k: 0 for k in keys}
    completed = {k: 0 for k in keys}
    for enrolled_at, completed_at in db.execute(select(Enrollment.enrolled_at, Enrollment.completed_at)):
        if (enrolled_at.year, enrolled_at.month) in enrolled:
            enrolled[(enrolled_at.year, enrolled_at.month)] += 1
        if completed_at and (completed_at.year, completed_at.month) in completed:
            completed[(completed_at.year, completed_at.month)] += 1
    labels = [datetime(y, m, 1).strftime("%b %Y") for y, m in keys]
    return {"labels": labels, "enrollments": list(enrolled.values()), "completions": list(completed.values())}


def admin_dashboard(db: Session) -> dict:
    count = lambda stmt: db.scalar(stmt) or 0  # noqa: E731
    pending = list(db.scalars(select(Course).where(Course.status == "pending").order_by(Course.submitted_at)))
    return {
        "courses": count(select(func.count()).select_from(Course)),
        "activeCourses": count(select(func.count()).select_from(Course).where(Course.status == "active")),
        "students": count(select(func.count()).select_from(User).where(User.role == "student")),
        "enrollments": count(select(func.count()).select_from(Enrollment)),
        "instructors": count(select(func.count()).select_from(User).where(User.role == "instructor")),
        "departments": count(
            select(func.count(func.distinct(User.department))).where(
                User.role == "instructor", User.department.is_not(None)
            )
        ),
        "pending": len(pending),
        "pendingCourses": [
            {
                "id": str(c.id),
                "code": c.code or "",
                "title": c.title,
                "semester": c.semester or "",
                "instructorName": c.instructor.name,
                "submittedAt": iso(c.submitted_at),
            }
            for c in pending
        ],
    }


def instructor_dashboard(db: Session, user: User) -> dict:
    courses = list(db.scalars(select(Course).where(Course.instructor_id == user.id).order_by(Course.title)))
    ids = [c.id for c in courses]
    stats = enrollment_stats(db, ids)
    modules = module_counts(db, ids)
    quiz_rows = db.execute(select(Quiz.course_id, func.count()).where(Quiz.course_id.in_(ids)).group_by(Quiz.course_id))
    quizzes = {course_id: n for course_id, n in quiz_rows.all()}
    active = [c for c in courses if c.status == "active"]
    rows = report_rows(db, instructor_id=user.id)
    active_ids = {str(c.id) for c in active}
    active_rows = [r for r in rows if r["courseId"] in active_ids]
    quiz_scores = [r["quiz"] for r in active_rows if r["quiz"] is not None]
    per_course = []
    for c in courses:
        course_quiz = [r["quiz"] for r in rows if r["courseId"] == str(c.id) and r["quiz"] is not None]
        per_course.append(
            {
                "id": str(c.id),
                "code": c.code or "",
                "title": c.title,
                "status": STATUS_LABEL[c.status],
                "color": c.color,
                "students": stats[c.id]["students"],
                "avgProgress": stats[c.id]["avgProgress"],
                "avgQuiz": js_round(average(course_quiz)) if course_quiz else None,
                "modules": modules.get(c.id, 0),
                "quizzes": quizzes.get(c.id, 0),
            }
        )
    by_status = {label: sum(1 for c in courses if STATUS_LABEL[c.status] == label) for label in STATUS_LABEL.values()}
    attempts = db.execute(
        select(QuizAttempt, Quiz)
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .where(Quiz.course_id.in_(ids), QuizAttempt.status == "submitted")
        .order_by(QuizAttempt.submitted_at.desc())
        .limit(6)
    ).all()
    recent = []
    for attempt, quiz in attempts:
        enrollment = db.get(Enrollment, attempt.enrollment_id)
        score = js_round(float(attempt.score))
        recent.append(
            {
                "student": enrollment.user.name,
                "course": enrollment.course.code or enrollment.course.title,
                "quiz": quiz.title,
                "score": score,
                "passed": score >= quiz.passing_score,
                "date": iso(attempt.submitted_at),
            }
        )
    return {
        "courses": len(courses),
        "byStatus": by_status,
        "students": len({r["name"] + r["nim"] for r in active_rows}),
        "avgProgress": js_round(average([r["progress"] for r in active_rows])),
        "avgQuiz": js_round(average(quiz_scores)) if quiz_scores else None,
        "quizTakers": len(quiz_scores),
        "perCourse": per_course,
        "recentAttempts": recent,
    }


def system_status(db: Session) -> list[dict]:
    try:
        db.execute(select(1))
        database = "Normal"
    except Exception:  # pragma: no cover
        database = "Unavailable"
    return [
        {"name": "Main database", "state": database},
        {"name": "API server", "state": "Normal"},
        {"name": "Auth gateway (JWT)", "state": "Normal"},
        {"name": "Course catalog search", "state": "Normal"},
    ]
