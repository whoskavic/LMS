"""Konfigurasi aplikasi dari environment variable."""

from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "change-me-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://learnova:learnova@localhost:5432/learnova"
    jwt_secret: str = DEFAULT_SECRET
    jwt_expires_minutes: int = 720
    # Daftar origin dipisah koma, mis. "http://localhost:5500,https://learnova.vercel.app". "*" = semua.
    cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500"

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        """Railway/Render memberi URL `postgres://` atau `postgresql://` → pakai driver psycopg 3."""
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix) :]
        return value

    @model_validator(mode="after")
    def require_secret_in_production(self) -> "Settings":
        if self.app_env == "production" and (self.jwt_secret == DEFAULT_SECRET or len(self.jwt_secret) < 32):
            raise ValueError("JWT_SECRET must be set to a random string of at least 32 characters in production.")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
