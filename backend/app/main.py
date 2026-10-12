"""Learnova LMS — aplikasi FastAPI."""

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.auth.router import router as auth_router
from app.common.errors import register_error_handlers
from app.config import get_settings
from app.courses.router import router as courses_router
from app.db import SessionLocal
from app.enrollments.router import router as enrollments_router
from app.quizzes.router import router as quizzes_router
from app.reports.router import router as reports_router
from app.reviews.router import router as reviews_router
from app.users.router import router as users_router

settings = get_settings()

app = FastAPI(
    title="Learnova LMS API",
    version="0.1.0",
    description="Backend Learnova LMS. Semua endpoint berada di bawah prefix /api/v1.",
)

origins = settings.cors_origin_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials="*" not in origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_error_handlers(app)

api = APIRouter(prefix="/api/v1")


@api.get("/health", tags=["meta"])
def health() -> dict:
    """Status API dan koneksi database."""
    database = "ok"
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:
        database = "unavailable"
    return {"status": "ok" if database == "ok" else "degraded", "database": database}


api.include_router(auth_router)
api.include_router(users_router)
api.include_router(courses_router)
api.include_router(enrollments_router)
api.include_router(quizzes_router)
api.include_router(reports_router)
api.include_router(reviews_router)
app.include_router(api)
