# Learnova LMS

Learnova adalah Learning Management System berbasis web. Saat ini project berada di **fase kuliah (final project)**: prototipe frontend vanilla HTML/CSS/JS sudah lengkap dan sedang dihubungkan ke backend Python FastAPI. Arah jangka panjang: platform kursus publik ala Udemy (siapa pun bisa membuat course atau belajar), dengan semua course **gratis** untuk fase ini.

> **Status:** backend FastAPI berjalan dengan auth JWT dan manajemen user. Frontend memakai backend lewat `assets/js/config.js` (`transport: "http"`). Halaman yang belum dimigrasi (ditandai 🟡) masih membaca mock data lama dan belum berfungsi penuh dengan backend sampai fase berikutnya. Rencana: [docs/BACKEND_PLAN.md](docs/BACKEND_PLAN.md).

## Fitur

Legenda: ✅ terhubung ke backend · 🟡 belum dimigrasi (masih kode mock)

| Role | Fitur | Status |
|---|---|---|
| Admin | Dashboard (statistik, grafik, pending approvals, aktivitas) | 🟡 |
| Admin | Manajemen user (CRUD, aktif/nonaktif, hapus dengan aturan bisnis) | ✅ |
| Admin | Approve / reject / archive / restore course | 🟡 |
| Admin | Laporan progress & nilai, cetak, export CSV | 🟡 |
| Instructor | Membuat & mengedit course, submit untuk approval | 🟡 |
| Instructor | Modul materi, quiz pilihan ganda, nilai akhir | 🟡 |
| Student | Browse & enroll course, belajar modul, progress | 🟡 |
| Student | Quiz dengan timer & review, nilai akhir, IPK, sertifikat | 🟡 |
| Semua | Login, registrasi publik (student/instructor), profil, ganti password, tema terang/gelap | ✅ |

Rincian fitur prototipe ada di [docs/FITUR.md](docs/FITUR.md).

## Tech stack

- **Frontend:** HTML5, CSS3, JavaScript murni (classic script, tanpa framework/bundler), Chart.js 4 (lokal di `assets/js/vendor/`).
- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, PostgreSQL 16, pytest + httpx, ruff.
- **Test:** `node --test` (frontend), pytest + httpx terhadap PostgreSQL (backend), ruff.
- **Infra lokal:** Docker Compose (api + postgres), GitHub Actions CI.

## Arsitektur singkat

```mermaid
flowchart LR
  Browser["Frontend statis<br/>(HTML/CSS/JS + Chart.js)"] --> Api["Api (assets/js/api)"]
  Api --> Local["LocalTransport<br/>MockServer (mock)"]
  Local --> LS[("localStorage")]
  Api -. "HttpTransport<br/>JSON + JWT" .-> API["FastAPI<br/>/api/v1"]
  API --> PG[("PostgreSQL 16")]
```

Backend adalah modular monolith: satu folder per domain (`auth`, `users`, `courses`, `enrollments`, `quizzes`, `reports`) di `backend/app/`.

## Struktur folder

```
LMS/
├── index.html              ← Login
├── register.html           ← Registrasi publik
├── pages/                  ← Halaman aplikasi per role
├── assets/
│   ├── css/style.css
│   ├── img/
│   └── js/
│       ├── config.js       ← Base URL API & transport (http / local)
│       ├── domain.js       ← Logika murni (grade, IPK, progress, sertifikat)
│       ├── data.js         ← Mock data (seed)
│       ├── store.js        ← "Database" localStorage
│       ├── main.js         ← Guard, layout, UI helper
│       ├── api/            ← client (token, ApiError), transport http/local, services
│       └── pages/          ← Script per halaman
├── backend/
│   ├── app/                ← FastAPI: main, config, db, common/, satu folder per domain
│   ├── alembic/            ← migrasi database
│   ├── tests/              ← pytest
│   ├── Dockerfile
│   ├── requirements*.txt
│   └── .env.example
├── docker-compose.yml      ← api + postgres
├── tests/                  ← node --test
├── docs/                   ← Dokumen perancangan, keputusan, rencana backend
├── prompt.md               ← Instruksi kerja otonom untuk integrasi backend
├── CLAUDE.md               ← Konvensi repo untuk agen/kontributor
└── .github/workflows/      ← CI
```

## Menjalankan secara lokal

Prasyarat: Docker + Docker Compose, browser modern. (Opsional tanpa Docker: Python 3.12 dan PostgreSQL 16.)

```bash
git clone https://github.com/whoskavic/LMS.git && cd LMS

# 1. Backend + database
docker compose up -d --build
docker compose exec api alembic upgrade head      # migrasi
docker compose exec api python -m app.seed        # data demo (pakai --reset untuk mengisi ulang)
curl http://localhost:8000/api/v1/health          # {"status":"ok","database":"ok"}
# Swagger: http://localhost:8000/docs

# 2. Frontend (server statis)
npx http-server -p 5500     # lalu buka http://localhost:5500
```

Frontend memanggil API di `http://localhost:8000/api/v1` (atur di `assets/js/config.js`). Origin frontend harus ada di `CORS_ORIGINS`. Untuk demo tanpa backend, ubah `transport` menjadi `"local"` (mock data lama di browser).

Tanpa Docker:

```bash
cd backend
python3.12 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env        # sesuaikan DATABASE_URL
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

## Environment variable

Backend membaca variabel berikut (lihat `backend/.env.example`):

| Nama | Keterangan | Contoh |
|---|---|---|
| `APP_ENV` | Nama environment | `development` |
| `DATABASE_URL` | URL SQLAlchemy ke PostgreSQL | `postgresql+psycopg://learnova:learnova@localhost:5432/learnova` |
| `TEST_DATABASE_URL` | Database khusus pytest (dibuat otomatis bila belum ada) | `postgresql+psycopg://learnova:learnova@localhost:5432/learnova_test` |
| `JWT_SECRET` | Secret penandatangan JWT (wajib diganti di produksi) | `ganti-dengan-string-acak-panjang` |
| `JWT_EXPIRES_MINUTES` | Masa berlaku token (menit) | `720` |
| `CORS_ORIGINS` | Origin frontend yang diizinkan, dipisah koma (`*` = semua) | `http://localhost:5500,http://127.0.0.1:5500` |

## Akun demo

Hasil `python -m app.seed`:

| Role | Nama | Email | Password |
|---|---|---|---|
| Admin | Admin User | admin@learnova.ac.id | admin123 |
| Instructor | Dr. Budi Santoso | budi@learnova.ac.id | dosen123 |
| Instructor | Dr. Adam Miller | adam@learnova.ac.id | dosen123 |
| Student | Alex Mercer | alex@learnova.ac.id | student123 |
| Student | Nadia Putri | nadia@learnova.ac.id | student123 |
| Student | Marcus Chen | marcus@learnova.ac.id | student123 |

Akun baru juga bisa dibuat lewat halaman **Sign up** (`register.html`) sebagai student atau instructor.

## API

Swagger UI: `http://localhost:8000/docs` · OpenAPI: `http://localhost:8000/openapi.json`. Semua endpoint memakai prefix `/api/v1`, JSON camelCase, dan error berbentuk `{ "error": { "code", "message", "fields"? } }`.

| Method | Path | Role |
|---|---|---|
| GET | `/api/v1/health` | publik |
| POST | `/api/v1/auth/register` | publik (role student/instructor) |
| POST | `/api/v1/auth/login` | publik |
| POST | `/api/v1/auth/logout` | publik (JWT stateless) |
| GET | `/api/v1/auth/me` | login |
| POST | `/api/v1/auth/password` | login |
| PATCH | `/api/v1/me` | login |
| GET | `/api/v1/me/stats` | login |
| GET | `/api/v1/users` (`role, q, department, status, sort, page, pageSize`) | admin |
| POST | `/api/v1/users` | admin |
| GET / PATCH / DELETE | `/api/v1/users/{id}` | admin |
| GET | `/api/v1/meta/departments` | admin |
| GET | `/api/v1/meta/notifications` | login |

Autentikasi: header `Authorization: Bearer <token>` dari `/auth/login`.

Endpoint berikutnya mengikuti kontrak `MockServer` (`assets/js/api/transport-local.js`), rencananya di [docs/BACKEND_PLAN.md](docs/BACKEND_PLAN.md).

## Database

PostgreSQL 16 dengan 13 tabel: `users`, `categories`, `courses`, `course_status_logs`, `modules`, `quizzes`, `questions`, `question_options`, `enrollments`, `module_progress`, `quiz_attempts`, `attempt_answers`, `certificates`. Primary key UUID, enum disimpan sebagai string + CHECK constraint, extension `pg_trgm` untuk pencarian course. Diagram, relasi, dan daftar index: [docs/ERD.md](docs/ERD.md).

## Testing

```bash
node --test                                  # frontend

cd backend
ruff check . && ruff format --check .        # lint & format
pytest                                       # butuh PostgreSQL (TEST_DATABASE_URL)
# atau lewat Docker:
docker compose exec api pytest
```

CI (GitHub Actions, `.github/workflows/ci.yml`) menjalankan `node --test`, ruff, `alembic upgrade head` dari database kosong, dan pytest di setiap PR.

## Deploy

Saat ini cukup sebagai static site (mis. Vercel: import repo, preset **Other**, tanpa build command). Langkah deploy backend + database akan ditambahkan setelah backend tersedia.

## Roadmap dan Known Issues

Roadmap integrasi backend (satu PR per fase):

1. ✅ Dokumentasi & rencana
2. ✅ Backend skeleton (FastAPI, Alembic, Docker, CI)
3. ✅ Auth & users
4. Courses & katalog publik
5. Enrollment & progress
6. Quiz dinilai di server
7. Nilai akhir, IPK, sertifikat, laporan, dashboard
8. Siap deploy

Known issues saat ini: halaman course, dashboard, quiz, dan laporan belum dimigrasi ke backend (masih kode mock, data/role tidak cocok dengan akun backend); tombol *Reset demo data* hanya muncul di mode `local`. Pertanyaan terbuka: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md).
