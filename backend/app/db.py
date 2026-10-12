"""Engine, session, dan Base SQLAlchemy."""

import os
from collections.abc import Iterator

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import get_settings

NAMING = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


# prepare_threshold=None: matikan prepared statement otomatis psycopg 3 agar kompatibel dengan
# PgBouncer mode transaction (pooler Neon). Di Vercel (env VERCEL ada) tiap invocation function berumur pendek,
# jadi koneksi tidak di-pool di proses (NullPool); pooling diserahkan ke pooler Neon.
_engine_options: dict = {"connect_args": {"prepare_threshold": None}}
if os.environ.get("VERCEL"):
    _engine_options["poolclass"] = NullPool
else:
    _engine_options["pool_pre_ping"] = True

engine = create_engine(get_settings().database_url, **_engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
