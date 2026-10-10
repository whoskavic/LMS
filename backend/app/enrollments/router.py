from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.auth.deps import DB, CurrentUser, require_roles
from app.common.errors import not_found
from app.courses.service import find_course, managed_course, owned_course
from app.enrollments import grades, service
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


# ---------------- Nilai, student course, sertifikat (PR 7) ----------------


class GradesIn(BaseModel):
    grades: list[dict] = []


class BatchIn(BaseModel):
    studentIds: list[str] = []


@router.get("/courses/{course_id}/grades", tags=["grades"])
def list_grades(
    course_id: str,
    user: CurrentUser,
    db: DB,
    sort: str | None = None,
    page: int | None = None,
    page_size: Annotated[int | None, Query(alias="pageSize")] = None,
) -> dict:
    """Progress, rata-rata quiz, nilai akhir, dan grade huruf per student (admin / instructor pemilik)."""
    return grades.list_grades(db, managed_course(db, user, course_id), sort, page, page_size)


@router.put("/courses/{course_id}/grades", tags=["grades"])
def save_grades(course_id: str, body: GradesIn, user: CurrentUser, db: DB) -> dict:
    """Simpan nilai akhir 0–100 (atau null); grade huruf dihitung server dengan skala prototipe."""
    rows = grades.save_grades(db, owned_course(db, user, course_id), body.grades)
    return {"items": rows, "total": len(rows), "page": 1, "pageSize": max(len(rows), 1)}


@router.get("/courses/{course_id}/candidates", tags=["enrollments"])
def candidates(course_id: str, user: CurrentUser, db: DB, q: str | None = None) -> list[dict]:
    return grades.candidates(db, owned_course(db, user, course_id), q)


@router.post("/courses/{course_id}/enrollments/batch", tags=["enrollments"], status_code=201)
def batch_enroll(course_id: str, body: BatchIn, user: CurrentUser, db: DB) -> dict:
    created = grades.batch_enroll(db, owned_course(db, user, course_id), body.studentIds)
    items = service.enrollment_views(db, created)
    return {"items": items, "total": len(items), "page": 1, "pageSize": max(len(items), 1)}


@router.delete("/enrollments/{enrollment_id}", tags=["enrollments"])
def remove_enrollment(enrollment_id: str, user: CurrentUser, db: DB) -> dict:
    """Instructor pemilik mengeluarkan student (progress & attempt ikut terhapus). 409 bila sudah bersertifikat."""
    enrollment = grades.find_enrollment_by_id(db, enrollment_id)
    owned_course(db, user, str(enrollment.course_id))
    grades.remove_enrollment(db, enrollment)
    return {"id": enrollment_id}


@router.get("/certificates/{code}", tags=["certificates"])
def verify_certificate(code: str, db: DB) -> dict:
    """Verifikasi publik nomor sertifikat."""
    return grades.verify_certificate(db, code)
