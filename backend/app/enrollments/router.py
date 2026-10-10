from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.auth.deps import DB, require_roles
from app.common.errors import not_found
from app.courses.service import find_course
from app.enrollments import service
from app.users.models import User

router = APIRouter(tags=["enrollments"])
Student = Annotated[User, Depends(require_roles("student"))]


class CompleteModuleIn(BaseModel):
    moduleId: str = ""


@router.post("/courses/{course_id}/enrollments", status_code=201)
def enroll(course_id: str, user: Student, db: DB) -> dict:
    """Student mendaftar sendiri ke course gratis berstatus Active."""
    enrollment = service.enroll(db, user, find_course(db, course_id))
    return service.enrollment_view(db, enrollment, with_modules=True)


@router.get("/courses/{course_id}/enrollment")
def my_course_enrollment(course_id: str, user: Student, db: DB) -> dict:
    """Enrollment student yang login di course ini (dipakai halaman belajar), termasuk ID modul yang selesai."""
    course = find_course(db, course_id)
    enrollment = service.find_enrollment(db, user.id, course.id)
    if not enrollment:
        raise not_found("Enrollment")
    from app.quizzes.service import quiz_average_by_enrollment

    average = quiz_average_by_enrollment(db, course.id).get(enrollment.id)
    return service.enrollment_view(db, enrollment, average, with_modules=True)


@router.get("/me/enrollments")
def my_enrollments(
    user: Student,
    db: DB,
    semester: str | None = None,
    status: str | None = None,
    q: str | None = None,
    sort: str | None = None,
    page: int | None = None,
    page_size: Annotated[int | None, Query(alias="pageSize")] = None,
) -> dict:
    """Course yang diikuti student: progress, nilai, rata-rata quiz, sertifikat."""
    return service.my_enrollments(db, user, semester, status, q, sort, page, page_size)


@router.post("/enrollments/{enrollment_id}/completed-modules")
def complete_module(enrollment_id: str, body: CompleteModuleIn, user: Student, db: DB) -> dict:
    """Tandai modul selesai (berurutan). Progress dihitung ulang; 100% → status completed (+ sertifikat)."""
    enrollment = service.complete_module(db, user, enrollment_id, body.moduleId)
    return service.enrollment_view(db, enrollment, with_modules=True)
