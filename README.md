# Learnova LMS

Learnova adalah Learning Management System berbasis web. Saat ini project berada di **fase kuliah (final project)**: prototipe frontend vanilla HTML/CSS/JS sudah lengkap dan sedang dihubungkan ke backend Python FastAPI. Arah jangka panjang: platform kursus publik ala Udemy (siapa pun bisa membuat course atau belajar), dengan semua course **gratis** untuk fase ini.

> **Status:** semua halaman sudah terhubung ke backend FastAPI + PostgreSQL (auth JWT, user, course + approval, katalog publik + search, enrollment + progress, quiz dinilai server, nilai akhir + IPK, sertifikat + verifikasi, laporan + CSV, dashboard per role). Mock data `localStorage` tidak lagi dipakai halaman. Rencana: [docs/BACKEND_PLAN.md](docs/BACKEND_PLAN.md).

## Fitur

Legenda: ✅ terhubung ke backend

| Role | Fitur | Status |
|---|---|---|
| Admin | Dashboard (statistik, grafik enrollment 6 bulan, pending approvals, status sistem, aktivitas) | ✅ |
| Admin | Manajemen user (CRUD, aktif/nonaktif, hapus dengan aturan bisnis) | ✅ |
| Admin | Approve / reject (dengan alasan) / archive / restore course, riwayat status | ✅ |
| Admin | Kategori course (API) | ✅ |
| Admin | Laporan progress & nilai (filter, sortir, pagination), cetak, export CSV dari server | ✅ |
| Instructor | Membuat & mengedit course, submit untuk approval | ✅ |
| Instructor | Modul materi (urutkan, video URL) | ✅ |
| Instructor | Quiz pilihan ganda (editor soal, statistik attempt) | ✅ |
| Instructor | Dashboard (course per status, progress & skor per course, attempt terbaru) | ✅ |
| Instructor | Students & Grades: tambah/keluarkan student, nilai akhir → grade huruf otomatis, export CSV | ✅ |
| Publik | Katalog course gratis: cari (judul & deskripsi), filter kategori, pagination, detail + outline | ✅ |
| Student | Enroll course gratis (katalog / dashboard), belajar modul berurutan, progress dihitung server | ✅ |
| Student | Dashboard: course per semester, progress, nilai akhir, IPK (dihitung saat diminta), unduh sertifikat | ✅ |
| Publik | Verifikasi sertifikat berdasarkan nomor (`verify.html`) | ✅ |
| Student | Quiz: soal tanpa kunci, timer & batas attempt dari server, lanjut setelah refresh, skor & review setelah submit | ✅ |
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
├── catalog.html            ← Katalog course publik (tanpa login)
├── verify.html             ← Verifikasi sertifikat publik
├── pages/                  ← Halaman aplikasi per role
├── assets/
│   ├── css/style.css
│   ├── img/
│   └── js/
│       ├── config.js       ← Base URL API & transport (http / local)
│       ├── domain.js       ← Logika murni (grade, IPK, progress, sertifikat)
│       ├── data.js         ← Mock data prototipe (hanya untuk test kontrak MockServer)
│       ├── store.js        ← "Database" localStorage prototipe (hanya untuk test kontrak)
│       ├── main.js         ← Guard, layout, UI helper
│       ├── api/            ← client (token, ApiError, download), transport-http, services
│       │                     (transport-local.js = MockServer lama, spesifikasi kontrak)
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
docker compose exec api python -m app.seed        # data demo: akun, 5 kategori, 13 course + modul, enrollment (--reset untuk mengisi ulang)
curl http://localhost:8000/api/v1/health          # {"status":"ok","database":"ok"}
# Swagger: http://localhost:8000/docs

# 2. Frontend (server statis)
npx http-server -p 5500     # lalu buka http://localhost:5500
```

Frontend memanggil API di `http://localhost:8000/api/v1` (atur di `assets/js/config.js`). Origin frontend harus ada di `CORS_ORIGINS`.

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

Seed juga membuat 5 kategori dan 13 course dari mock data prototipe (9 Active, 2 Draft, 1 Pending `MOB301`, 1 Archived) beserta modulnya, dibagi ke Dr. Budi Santoso (Technology/Design) dan Dr. Adam Miller. Alex Mercer memakai progress, skor quiz, & nilai demo dari prototipe (8 course, IPK 3.67); Nadia dan Marcus masing-masing 4 course. Ada 9 quiz (5 soal, lulus 70, 3 attempt, 10 menit) dari bank soal mock.

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
| GET | `/api/v1/meta/instructors` | admin |
| GET | `/api/v1/catalog/courses` (`q, category, sort, page, pageSize`) | publik |
| GET | `/api/v1/catalog/courses/{id atau slug}` | publik |
| GET | `/api/v1/categories`, `/api/v1/meta/categories` | publik |
| POST / PATCH / DELETE | `/api/v1/categories[/{id}]` | admin |
| GET | `/api/v1/courses` (`q, status, category, semester, instructorId, open, sort, page, pageSize`) | admin (semua), instructor (miliknya), student (`open=true`) |
| POST | `/api/v1/courses` | instructor |
| GET | `/api/v1/courses/{id}` | admin, instructor pemilik, student terdaftar / course terbuka |
| PATCH | `/api/v1/courses/{id}` | instructor pemilik |
| DELETE | `/api/v1/courses/{id}` | instructor pemilik / admin (hanya Draft tanpa enrollment) |
| POST | `/api/v1/courses/{id}/transitions` (`submit, approve, reject, archive, restore`) | instructor pemilik (submit) / admin |
| GET | `/api/v1/courses/{id}/status-logs`, `/api/v1/courses/{id}/stats` | admin, instructor pemilik |
| GET / POST | `/api/v1/courses/{id}/modules` | lihat: yang boleh melihat course · tambah: instructor pemilik |
| PUT | `/api/v1/courses/{id}/modules/order` | instructor pemilik |
| PATCH / DELETE | `/api/v1/modules/{id}` | instructor pemilik |
| POST | `/api/v1/courses/{id}/enrollments` | student (course Active, pendaftaran dibuka, ada kursi) |
| GET | `/api/v1/courses/{id}/enrollment` | student (enrollment miliknya di course itu) |
| GET | `/api/v1/me/enrollments` (`semester, status, q, sort, page, pageSize`) | student |
| POST | `/api/v1/enrollments/{id}/completed-modules` (`{ moduleId }`) | student pemilik enrollment |
| GET | `/api/v1/courses/{id}/quizzes` | instructor/admin (dengan kunci) · student terdaftar (tanpa soal & kunci) |
| POST | `/api/v1/courses/{id}/quizzes` | instructor pemilik |
| GET / PATCH / DELETE | `/api/v1/quizzes/{id}` | GET: yang boleh melihat course · ubah: instructor pemilik |
| POST | `/api/v1/quizzes/{id}/attempts` (mulai / lanjutkan) | student terdaftar |
| GET | `/api/v1/quizzes/{id}/attempts` (riwayat) | student |
| GET / PATCH | `/api/v1/attempts/{id}` (review / simpan jawaban sementara) | student pemilik |
| POST | `/api/v1/attempts/{id}/submit` | student pemilik (ditolak 409 bila lewat `expiresAt` + 30 detik) |
| GET / PUT | `/api/v1/courses/{id}/grades` | GET: admin, instructor pemilik · PUT: instructor pemilik |
| GET | `/api/v1/courses/{id}/candidates` | instructor pemilik (student yang bisa ditambahkan) |
| POST | `/api/v1/courses/{id}/enrollments/batch` | instructor pemilik |
| DELETE | `/api/v1/enrollments/{id}` | instructor pemilik (409 bila sudah bersertifikat) |
| GET | `/api/v1/certificates/{code}` | publik (verifikasi) |
| GET | `/api/v1/reports/summary`, `/api/v1/reports/enrollments`, `/api/v1/reports/enrollments.csv` | admin |
| GET | `/api/v1/activities` | admin |
| GET | `/api/v1/dashboard/admin` · `/dashboard/instructor` · `/dashboard/student` | sesuai role |
| GET | `/api/v1/meta/enrollment-chart`, `/api/v1/meta/system-status` | admin |

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
4. ✅ Courses & katalog publik
5. ✅ Enrollment & progress
6. ✅ Quiz dinilai di server
7. ✅ Nilai akhir, IPK, sertifikat, laporan, dashboard
8. Siap deploy

Known issues saat ini: upload thumbnail course belum disimpan (hanya preview); aktivitas & notifikasi diturunkan dari data (tidak ada tabel log umum); seed hanya berisi 6 akun demo. Pertanyaan terbuka: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md).
