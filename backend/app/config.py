"""Konfigurasi aplikasi dari environment variable."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://learnova:learnova@localhost:5432/learnova"
    jwt_secret: str = "change-me-in-production"
    jwt_expires_minutes: int = 720
    # Daftar origin dipisah koma, mis. "http://localhost:5500,https://learnova.vercel.app". "*" = semua.
    cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
