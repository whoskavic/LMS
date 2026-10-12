from typing import Annotated

from fastapi import APIRouter, Query

from app.auth.deps import DB, CurrentUser
from app.reviews import service
from app.reviews.schemas import ReviewIn

router = APIRouter(tags=["reviews"])


@router.get("/courses/{course_id}/reviews")
def list_reviews(
    course_id: str,
    db: DB,
    page: int | None = None,
    page_size: Annotated[int | None, Query(alias="pageSize")] = None,
) -> dict:
    """Publik (tanpa login): ulasan course Active, terbaru dulu, plus `summary` rating."""
    return service.list_reviews(db, course_id, page, page_size)


@router.post("/courses/{course_id}/reviews", status_code=201)
def create_review(course_id: str, body: ReviewIn, user: CurrentUser, db: DB) -> dict:
    """Learner yang terdaftar menulis satu ulasan per enrollment (pemilik course → 403, duplikat → 409)."""
    return service.review_view(service.create_review(db, user, course_id, body))


@router.patch("/reviews/{review_id}")
def update_review(review_id: str, body: ReviewIn, user: CurrentUser, db: DB) -> dict:
    """Hanya penulis ulasan."""
    return service.review_view(service.update_review(db, user, review_id, body))


@router.delete("/reviews/{review_id}")
def delete_review(review_id: str, user: CurrentUser, db: DB) -> dict:
    """Penulis ulasan atau admin (moderasi)."""
    service.delete_review(db, user, review_id)
    return {"id": review_id}
