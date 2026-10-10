# Image produksi backend Learnova (Railway / Render / VPS).
# Saat start: migrasi Alembic → (opsional) seed demo → uvicorn di $PORT.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini start.sh ./
RUN chmod +x start.sh \
    && useradd --create-home --uid 10001 learnova \
    && chown -R learnova /app
USER learnova

EXPOSE 8000
CMD ["./start.sh"]
