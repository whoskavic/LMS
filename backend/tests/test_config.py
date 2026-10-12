import pytest

from app.config import Settings


def test_database_url_is_normalized_for_psycopg():
    assert Settings(database_url="postgres://u:p@h:5432/db").database_url == "postgresql+psycopg://u:p@h:5432/db"
    assert Settings(database_url="postgresql://u:p@h/db").database_url == "postgresql+psycopg://u:p@h/db"
    assert Settings(database_url="postgresql+psycopg://u:p@h/db").database_url == "postgresql+psycopg://u:p@h/db"


def test_production_requires_strong_jwt_secret():
    with pytest.raises(ValueError):
        Settings(app_env="production", jwt_secret="change-me-in-production")
    assert Settings(app_env="production", jwt_secret="x" * 40).jwt_secret == "x" * 40


def test_cors_origins_list():
    assert Settings(cors_origins="https://a.app, https://b.app").cors_origin_list == ["https://a.app", "https://b.app"]


def test_neon_url_with_query_string_is_normalized():
    url = "postgresql://user:pw@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    normalized = Settings(database_url=url).database_url
    assert normalized == (
        "postgresql+psycopg://user:pw@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/neondb"
        "?sslmode=require&channel_binding=require"
    )
    from sqlalchemy.engine import make_url

    parsed = make_url(normalized)
    assert parsed.drivername == "postgresql+psycopg"
    assert parsed.query == {"sslmode": "require", "channel_binding": "require"}


def test_engine_disables_prepared_statements():
    from app.db import engine

    with engine.connect() as conn:
        assert conn.connection.dbapi_connection.prepare_threshold is None


def test_engine_uses_nullpool_on_vercel():
    import os
    import subprocess
    import sys

    code = "from app.db import engine; print(type(engine.pool).__name__)"
    on_vercel = subprocess.run(
        [sys.executable, "-c", code], env={**os.environ, "VERCEL": "1"}, capture_output=True, text=True, check=True
    )
    local = {k: v for k, v in os.environ.items() if k != "VERCEL"}
    off_vercel = subprocess.run([sys.executable, "-c", code], env=local, capture_output=True, text=True, check=True)
    assert on_vercel.stdout.strip() == "NullPool"
    assert off_vercel.stdout.strip() == "QueuePool"
