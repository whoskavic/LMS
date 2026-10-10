"""Learnova LMS — aplikasi FastAPI."""

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.common.errors import register_error_handlers
from app.config import get_settings
from app.db import SessionLocal

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


app.include_router(api)
