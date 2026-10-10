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
