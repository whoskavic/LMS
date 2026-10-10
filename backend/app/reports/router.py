from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from app.auth.deps import DB, CurrentUser, require_roles
from app.common.grading import gpa, js_round
from app.courses.models import Course
from app.enrollments.models import Enrollment
from app.reports import service
from app.users.models import User

router = APIRouter()
Admin = Annotated[User, Depends(require_roles("admin"))]
Instructor = Annotated[User, Depends(require_roles("instructor"))]
PageSize = Annotated[int | None, Query(alias="pageSize")]


@router.get("/meta/notifications", tags=["meta"])
def notifications(user: CurrentUser, db: DB) -> list[dict]:
    """Notifikasi topbar, diturunkan dari data (tanpa tabel notifikasi)."""
    items: list[dict] = []
    if user.role == "admin":
        pending = db.scalars(select(Course).where(Course.status == "pending").order_by(Course.submitted_at.desc()))
        items = [
            {"text": f"{c.code or ''} {c.title} is waiting for approval".strip(), "time": "Pending"} for c in pending
        ]
    elif user.role == "instructor":
        mine = db.scalars(
            select(Course)
            .where(Course.instructor_id == user.id, Course.status.in_(("pending", "rejected")))
            .order_by(Course.updated_at.desc())
        )
        for c in mine:
            state = "is waiting for admin approval" if c.status == "pending" else "was rejected — revise and resubmit"
            items.append({"text": f"{c.title} {state}", "time": c.status.title()})
    else:
        graded = db.scalars(
            select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.grade_letter.is_not(None)).limit(3)
        )
        items = [
            {"text": f"Final grade for {e.course.code or e.course.title} is available", "time": e.grade_letter}
            for e in graded
        ]
    return items[:5]


@router.get("/meta/system-status", tags=["meta"])
def system_status(_: Admin, db: DB) -> list[dict]:
    return service.system_status(db)


@router.get("/meta/enrollment-chart", tags=["meta"])
def enrollment_chart(_: Admin, db: DB) -> dict:
    """Jumlah enrollment & penyelesaian per bulan (6 bulan terakhir)."""
    return service.enrollment_chart(db)


@router.get("/reports/summary", tags=["reports"])
def report_summary(_: Admin, db: DB) -> dict:
    """Rata-rata progress, rata-rata quiz, completion rate, course per kategori, quiz per course."""
    return service.summary(db)


@router.get("/reports/enrollments", tags=["reports"])
def report_enrollments(
    _: Admin,
    db: DB,
    course_id: Annotated[str | None, Query(alias="courseId")] = None,
    status: str | None = None,
    q: str | None = None,
    sort: str | None = None,
    page: int | None = None,
    page_size: PageSize = None,
) -> dict:
    """Satu baris per enrollment: progress, quiz, grade, status (Completed / At risk / On track)."""
    return service.enrollments_report(db, course_id, status, q, sort, page, page_size)


@router.get("/reports/enrollments.csv", tags=["reports"], response_class=PlainTextResponse)
def report_enrollments_csv(
    _: Admin,
    db: DB,
    course_id: Annotated[str | None, Query(alias="courseId")] = None,
    status: str | None = None,
    q: str | None = None,
    sort: str | None = None,
):
    """Export laporan sebagai CSV (semua baris sesuai filter)."""
    content = service.enrollments_csv(db, course_id, status, q, sort)
    return PlainTextResponse(
        content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="learnova-learning-report.csv"'},
    )


@router.get("/activities", tags=["reports"])
def activities(_: Admin, db: DB, page_size: PageSize = None) -> dict:
    items = service.activities(db, min(max(page_size or 20, 1), 100))
    return {"items": items, "total": len(items), "page": 1, "pageSize": max(len(items), 1)}


@router.get("/dashboard/admin", tags=["dashboard"])
def admin_dashboard(_: Admin, db: DB) -> dict:
    return service.admin_dashboard(db)


@router.get("/dashboard/instructor", tags=["dashboard"])
def instructor_dashboard(user: Instructor, db: DB) -> dict:
    return service.instructor_dashboard(db, user)


@router.get("/dashboard/student", tags=["dashboard"])
def student_dashboard(user: Annotated[User, Depends(require_roles("student"))], db: DB) -> dict:
    """Ringkasan student: jumlah course, selesai, rata-rata progress, IPK (dihitung saat diminta)."""
    enrollments = list(db.scalars(select(Enrollment).where(Enrollment.user_id == user.id)))
    progress = [float(e.progress_pct) for e in enrollments]
    return {
        "courses": len(enrollments),
        "completed": sum(1 for e in enrollments if e.status == "completed"),
        "avgProgress": js_round(sum(progress) / len(progress)) if progress else 0,
        "gpa": gpa(e.grade_letter for e in enrollments),
    }
