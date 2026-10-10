from sqlalchemy import inspect, text

from app.db import engine


def test_health_ok(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": "ok"}


def test_unknown_endpoint_uses_error_shape(client):
    res = client.get("/api/v1/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"


def test_migration_creates_full_schema():
    tables = set(inspect(engine).get_table_names())
    assert {
        "users",
        "categories",
        "courses",
        "course_status_logs",
        "modules",
        "quizzes",
        "questions",
        "question_options",
        "enrollments",
        "module_progress",
        "quiz_attempts",
        "attempt_answers",
        "certificates",
    } <= tables
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'")).scalar() == 1
        indexes = {r[0] for r in conn.execute(text("SELECT indexname FROM pg_indexes WHERE schemaname='public'"))}
    assert {
        "ix_courses_title_trgm",
        "uq_quiz_attempts_one_in_progress",
        "uq_question_options_one_correct",
    } <= indexes
