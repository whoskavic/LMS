"""Build step Vercel: migrasi database (dan seed demo opsional) sebelum function di-deploy.

Dipanggil oleh Vercel lewat `[tool.vercel.scripts] build` di pyproject.toml. Di Vercel tidak ada start.sh,
jadi pekerjaan start.sh (alembic upgrade head → seed opsional) dipindah ke sini.

- DATABASE_URL_UNPOOLED (koneksi direct Neon) dipakai untuk migrasi bila ada, karena DDL lewat pooler
  mode transaction tidak dianjurkan. Harus di-set SEBELUM modul `app` diimpor (settings di-cache).
- SEED_DEMO=true → isi data demo bila database masih kosong (idempoten).
- Exit non-zero bila migrasi gagal agar deploy ikut gagal.
"""

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def log(message: str) -> None:
    print(f"[vercel-build] {message}", flush=True)


def main() -> int:
    unpooled = os.environ.get("DATABASE_URL_UNPOOLED")
    if unpooled:
        os.environ["DATABASE_URL"] = unpooled
        log("Memakai DATABASE_URL_UNPOOLED (koneksi direct) untuk migrasi.")
    elif os.environ.get("DATABASE_URL"):
        log("Memakai DATABASE_URL untuk migrasi.")
    else:
        log("DATABASE_URL tidak di-set — hubungkan database Neon ke project ini.")
        return 1

    sys.path.insert(0, str(BASE_DIR))
    from alembic import command
    from alembic.config import Config

    try:
        log("Menjalankan alembic upgrade head…")
        command.upgrade(Config(str(BASE_DIR / "alembic.ini")), "head")
        log("Migrasi selesai.")
    except Exception as exc:  # noqa: BLE001 — semua kegagalan migrasi harus menggagalkan build
        log(f"Migrasi GAGAL: {exc}")
        return 1

    if os.environ.get("SEED_DEMO", "false").lower() == "true":
        from app.seed import seed_if_empty

        log("SEED_DEMO=true → menjalankan seed demo…")
        log("Seed selesai." if seed_if_empty() else "Data sudah ada — hanya data demo tambahan yang dilengkapi.")
    else:
        log("SEED_DEMO tidak aktif — seed dilewati.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
