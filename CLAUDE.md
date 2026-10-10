# CLAUDE.md — Konvensi repo Learnova LMS

## Ringkasan
- Frontend: vanilla HTML/CSS/JS (classic script + namespace global), Chart.js lokal. **Jangan** migrasi ke React/Next.js, jangan tambah bundler/TypeScript.
- Backend: `backend/` — Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, PostgreSQL 16 (lihat `docs/BACKEND_PLAN.md`). Image produksi: `backend/Dockerfile` + `start.sh`; deploy: README › Deploy.
- Instruksi kerja lengkap: `prompt.md`. Keputusan arsitektur: `docs/DECISIONS.md`. Pertanyaan terbuka: `docs/OPEN_QUESTIONS.md`.

## Aturan frontend
- Halaman hanya memanggil `Api.*` (`assets/js/api/services.js`); tidak boleh membaca/menulis data bisnis ke `localStorage`. Pengecualian: token sesi (`learnova.session`), tema (`learnova.theme`), flash message.
- URL API: `assets/js/config.js` (`PRODUCTION_API_URL`; localhost otomatis ke port 8000).
- Script halaman masuk lewat `App.ready(fn)`; setiap view menangani loading / empty / error (`UI.load`, `UI.loading`, `UI.empty`, `UI.error`).
- ID adalah string opaque (UUID) — jangan `Number(id)`. Datetime ISO UTC, tanggal kalender `YYYY-MM-DD`.
- Logika murni (grade, IPK, progress) ada di `assets/js/domain.js` dan diuji dengan `node --test`.

## Aturan backend
- Modular monolith: `backend/app/<domain>/{models,schemas,service,router}.py` untuk domain auth, users, courses, enrollments, quizzes, reports.
- Kontrak JSON mengikuti MockServer: camelCase, list `{ items, total, page, pageSize }`, error `{ "error": { code, message, fields? } }`.
- Skema database mengikuti `prompt.md` (bagian "Skema Database"); setiap migrasi baru wajib memperbarui `docs/ERD.md`.
- Kunci jawaban quiz tidak pernah dikirim ke student sebelum attempt `submitted`.

## Perintah
```bash
node --test                                   # test frontend
cd backend && ruff check . && ruff format --check .
cd backend && pytest                          # butuh PostgreSQL (lihat README)
docker compose up -d --build                  # api (Dockerfile.dev) + postgres
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed
```

## Git
- Branch: `feat/<fase>`, `chore/<...>`, `docs/<...>`; commit Conventional Commits.
- Satu PR per fase; deskripsi PR (bahasa Indonesia) memuat baris `README: ...` dan `ERD: ...`.
- Jangan commit `.env` atau secret apa pun. README wajib diperbarui bila fitur/env/struktur/endpoint/skema berubah.
