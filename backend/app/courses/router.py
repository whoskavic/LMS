from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth.deps import DB, CurrentUser, require_roles
from app.courses import service
from app.courses.schemas import CategoryIn, CourseIn, ModuleIn, OrderIn, TransitionIn
from app.users.models import User

router = APIRouter()
Admin = Annotated[User, Depends(require_roles("admin"))]
Instructor = Annotated[User, Depends(require_roles("instructor"))]
PageSize = Annotated[int | None, Query(alias="pageSize")]


# ---------------- Katalog publik ----------------
@router.get("/catalog/courses", tags=["catalog"])
def catalog(
    db: DB,
    q: str | None = None,
    category: str | None = None,
    sort: str | None = Query(None, description='"title" (default), "-title", atau "newest"'),
    page: int | None = None,
    page_size: PageSize = None,
) -> dict:
    """Katalog publik (tanpa login): hanya course **Active**.

    `q` mencari di title & description (case-insensitive)."""
    return service.catalog(db, q, category, sort, page, page_size)


@router.get("/catalog/courses/{id_or_slug}", tags=["catalog"])
def catalog_detail(id_or_slug: str, db: DB) -> dict:
    """Detail course publik + outline modul (tanpa isi materi)."""
    return service.catalog_detail(db, id_or_slug)


# ---------------- Kategori ----------------
@router.get("/categories", tags=["categories"])
def categories(db: DB) -> list[dict]:
    return service.list_categories(db)


@router.get("/meta/categories", tags=["meta"])
def category_names(db: DB) -> list[str]:
    """Nama kategori (dipakai dropdown form & filter)."""
    return [c["name"] for c in service.list_categories(db)]


@router.post("/categories", tags=["categories"], status_code=201)
def create_category(body: CategoryIn, _: Admin, db: DB) -> dict:
    return service.category_view(service.create_category(db, body.name))


@router.patch("/categories/{category_id}", tags=["categories"])
def update_category(category_id: str, body: CategoryIn, _: Admin, db: DB) -> dict:
    return service.category_view(service.update_category(db, category_id, body.name))


@router.delete("/categories/{category_id}", tags=["categories"])
def delete_category(category_id: str, _: Admin, db: DB) -> dict:
    service.delete_category(db, category_id)
    return {"id": category_id}


# ---------------- Course ----------------
@router.get("/courses", tags=["courses"])
def list_courses(
    user: CurrentUser,
    db: DB,
    q: str | None = None,
    status: str | None = None,
    category: str | None = None,
    semester: str | None = None,
    instructor_id: Annotated[str | None, Query(alias="instructorId")] = None,
    open: bool = False,
    sort: str | None = None,
    page: int | None = None,
    page_size: PageSize = None,
) -> dict:
    """Admin: semua course · Instructor: miliknya · Student: `open=true` (course yang bisa didaftari)."""
    return service.list_courses(db, user, q, status, category, semester, instructor_id, open, sort, page, page_size)


@router.post("/courses", tags=["courses"], status_code=201)
def create_course(body: CourseIn, user: Instructor, db: DB) -> dict:
    """Buat course baru berstatus Draft (cukup judul; field lain divalidasi bila diisi)."""
    return service.course_view(db, service.create_course(db, user, body))


@router.get("/courses/{course_id}", tags=["courses"])
def get_course(course_id: str, user: CurrentUser, db: DB) -> dict:
    return service.course_view(db, service.viewable_course(db, user, course_id))


@router.patch("/courses/{course_id}", tags=["courses"])
def update_course(course_id: str, body: CourseIn, user: CurrentUser, db: DB) -> dict:
    """Edit oleh instructor pemilik. Course selain Draft wajib lengkap; edit course Active langsung tayang."""
    return service.course_view(db, service.update_course(db, user, course_id, body))


@router.delete("/courses/{course_id}", tags=["courses"])
def delete_course(course_id: str, user: CurrentUser, db: DB) -> dict:
    """Hapus permanen hanya Draft tanpa enrollment (pemilik atau admin); selain itu 409 → arsipkan."""
    service.delete_course(db, user, course_id)
    return {"id": course_id}


@router.post("/courses/{course_id}/transitions", tags=["courses"])
def transition(course_id: str, body: TransitionIn, user: CurrentUser, db: DB) -> dict:
    """`submit` (instructor pemilik: Draft/Rejected → Pending),
    `approve`/`reject` (admin: Pending → Active/Rejected, reject wajib `reason`),
    `archive`/`restore` (admin: Active ↔ Archived). Dicatat di course_status_logs."""
    return service.course_view(db, service.transition(db, user, course_id, body.action, body.reason))


@router.get("/courses/{course_id}/status-logs", tags=["courses"])
def status_logs(course_id: str, user: CurrentUser, db: DB) -> list[dict]:
    return service.status_logs(db, service.managed_course(db, user, course_id))


@router.get("/courses/{course_id}/stats", tags=["courses"])
def course_stats(course_id: str, user: CurrentUser, db: DB) -> dict:
    return service.course_stats(db, service.managed_course(db, user, course_id))


# ---------------- Modul ----------------
def _modules_page(modules) -> dict:
    items = [service.module_view(m) for m in modules]
    return {"items": items, "total": len(items), "page": 1, "pageSize": max(len(items), 1)}


@router.get("/courses/{course_id}/modules", tags=["modules"])
def list_modules(course_id: str, user: CurrentUser, db: DB) -> dict:
    return _modules_page(service.list_modules(db, user, course_id))


@router.post("/courses/{course_id}/modules", tags=["modules"], status_code=201)
def create_module(course_id: str, body: ModuleIn, user: CurrentUser, db: DB) -> dict:
    return service.module_view(service.create_module(db, user, course_id, body))


@router.put("/courses/{course_id}/modules/order", tags=["modules"])
def reorder_modules(course_id: str, body: OrderIn, user: CurrentUser, db: DB) -> dict:
    return _modules_page(service.reorder_modules(db, user, course_id, body.ids))


@router.patch("/modules/{module_id}", tags=["modules"])
def update_module(module_id: str, body: ModuleIn, user: CurrentUser, db: DB) -> dict:
    return service.module_view(service.update_module(db, user, module_id, body))


@router.delete("/modules/{module_id}", tags=["modules"])
def delete_module(module_id: str, user: CurrentUser, db: DB) -> dict:
    service.delete_module(db, user, module_id)
    return {"id": module_id}
