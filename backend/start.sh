#!/bin/sh
# Entrypoint produksi: migrasi database, seed demo opsional, lalu jalankan API.
set -e

alembic upgrade head

# SEED_DEMO=true → isi data demo bila database masih kosong (aman dijalankan berulang)
if [ "${SEED_DEMO:-false}" = "true" ]; then
  python -m app.seed
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
