from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.auth.deps import DB, require_roles
from app.common.schemas import Page
from app.users import service
from app.users.models import User
from app.users.schemas import UserCreate, UserRow, UserUpdate

Admin = Annotated[User, Depends(require_roles("admin"))]
router = APIRouter(tags=["users"])


def row(db, user: User) -> dict:
    return service.user_rows(db, [user])[0]


@router.get("/users", response_model=Page[UserRow])
def list_users(
    _: Admin,
    db: DB,
    role: str | None = None,
    q: str | None = None,
    status: str | None = None,
    sort: str | None = None,
    page: int | None = None,
    page_size: Annotated[int | None, Query(alias="pageSize")] = None,
):
    """Daftar user (admin) dengan filter role, departemen, status, pencarian, sort, dan pagination."""
    return service.list_users(db, role, q, status, sort, page, page_size)


@router.get("/users/{user_id}", response_model=UserRow)
def get_user(user_id: str, _: Admin, db: DB):
    return row(db, service.get_user(db, user_id))


@router.post("/users", response_model=UserRow, status_code=201)
def create_user(body: UserCreate, _: Admin, db: DB):
    return row(db, service.create_user(db, body))


@router.patch("/users/{user_id}", response_model=UserRow)
def update_user(user_id: str, body: UserUpdate, admin: Admin, db: DB):
    """Edit user atau ubah status Active/Inactive (admin tidak bisa menonaktifkan dirinya sendiri)."""
    return row(db, service.update_user(db, admin, user_id, body))


@router.delete("/users/{user_id}")
def delete_user(user_id: str, admin: Admin, db: DB) -> dict:
    """Hapus permanen. 409 bila user masih punya course atau enrollment (sarankan nonaktifkan)."""
    service.delete_user(db, admin, user_id)
    return {"id": user_id}


@router.get("/meta/instructors", tags=["meta"])
def instructors(_: Admin, db: DB) -> list[dict]:
    """Daftar instructor untuk filter (admin)."""
    rows = db.scalars(select(User).where(User.role == "instructor").order_by(User.name))
    return [{"id": str(u.id), "name": u.name, "status": "Active" if u.is_active else "Inactive"} for u in rows]
