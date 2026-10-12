# Learnova LMS

Learnova adalah **platform kursus online publik ala Udemy**: siapa pun bisa mendaftar untuk belajar, lalu mulai mengajar dengan satu klik. Semua course **gratis** pada fase ini. Frontend vanilla HTML/CSS/JS, backend Python FastAPI + PostgreSQL. Project ini berawal dari final project kuliah (Pemrograman Web 2); halaman wajib tugas (login, layout, dashboard + Chart.js, data master CRUD, form + validasi, laporan + cetak/CSV) tetap ada dan berfungsi.

> **Status:** semua halaman terhubung ke backend (auth JWT, model akun learner → instructor, course + approval admin, katalog publik + landing page, enrollment + progress, quiz dinilai server, sertifikat + verifikasi, ulasan + rating, profil instructor publik, laporan + CSV, dashboard per role). Produksi: frontend https://lms-kavic.vercel.app, API `learnova-api` di Vercel + Neon.

## Fitur

Legenda: ✅ terhubung ke backend

| Role | Fitur | Status |
|---|---|---|
| Admin | Dashboard (statistik, grafik enrollment 6 bulan, pending approvals, status sistem, aktivitas) | ✅ |
| Admin | Manajemen user (nama, email, status; tanpa NIM/departemen), aktif/nonaktif, hapus dengan aturan bisnis | ✅ |
| Admin | Approve / reject (dengan alasan) / archive / restore course, riwayat status | ✅ |
| Admin | Kategori course (API) | ✅ |
| Admin | Laporan: total learner/instructor/enrollment, completion rate, rata-rata quiz, course terpopuler, tabel progress (filter, sortir, pagination), cetak, export CSV | ✅ |
| Instructor | Membuat & mengedit course (judul, deskripsi, kategori, thumbnail URL, sertifikat), submit untuk approval (wajib minimal satu modul) | ✅ |
| Instructor | Modul materi (urutkan, video URL) | ✅ |
| Instructor | Quiz pilihan ganda (editor soal, statistik attempt) | ✅ |
| Instructor | Dashboard (course per status, progress & skor per course, attempt terbaru) | ✅ |
| Instructor | Students (read-only): peserta, progress, skor quiz terbaik, status selesai & sertifikat, export CSV | ✅ |
| Publik | **Katalog** (halaman utama publik): cari, chip kategori, sort (terpopuler / rating tertinggi / terbaru / judul), pagination; kartu dengan instructor, rating rata-rata + jumlah ulasan, jumlah learner, modul + total durasi, label Free | ✅ |
| Publik | **Course landing page**: deskripsi, instructor (headline + tautan profil), kurikulum accordion (ikon kunci sebelum enroll), tombol sesuai status: Enroll for free (belum login → login lalu kembali), Continue learning, Manage course | ✅ |
| Publik | **Ulasan course**: ringkasan rating + distribusi bintang, daftar ulasan terbaru ("Show more") | ✅ |
| Learner | Menulis satu ulasan per course yang diikuti (rating 1–5 + komentar opsional), edit & hapus ulasan sendiri; admin bisa menghapus ulasan apa pun | ✅ |
| Publik | **Profil instructor** (`instructor.html?id=`): headline, bio, statistik (course, learner, ulasan, rating), daftar course Active | ✅ |
| Semua (login) | **Katalog di dalam aplikasi** (`pages/browse.html`): katalog, landing page (`?course=`), dan profil instructor (`?instructor=`) dengan sidebar & header aplikasi; search header mencari katalog | ✅ |
| Instructor | Headline & bio profil publik (diisi saat "Start teaching" atau di Profile) | ✅ |
| Learner | Enroll course gratis (course Active selalu terbuka), belajar modul berurutan, progress dihitung server | ✅ |
| Learner | **My Learning**: tab sedang dipelajari / selesai / sertifikat, "Continue learning" ke modul berikutnya, unduh & verifikasi sertifikat | ✅ |
| Publik | Verifikasi sertifikat berdasarkan nomor (`verify.html`) | ✅ |
| Learner | Quiz: soal tanpa kunci, timer & batas attempt dari server, lanjut setelah refresh, skor & review setelah submit | ✅ |
| Semua | Login, registrasi publik (selalu learner/student), profil, ganti password, tema terang/gelap | ✅ |
| Learner → Instructor | "Start teaching" (`POST /me/become-instructor`); instructor tetap bisa belajar di course instructor lain, pengalih mode **Learn / Teach** di sidebar | ✅ |

Rincian fitur prototipe ada di [docs/FITUR.md](docs/FITUR.md).

Dihapus dari UI & API (ADR-009): IPK, nilai akhir & grade huruf, semester, NIM/NIDN, departemen, kode course, durasi minggu, tanggal mulai, kapasitas, input nilai & batch enroll. Endpoint `/courses/{id}/grades`, `/courses/{id}/candidates`, `/courses/{id}/enrollments/batch`, `DELETE /enrollments/{id}`, dan `/meta/departments` sudah tidak ada (404).

Navigasi katalog memakai **satu renderer, dua shell** (`assets/js/catalog-view.js`): guest melihat `catalog.html` / `instructor.html` (header publik dengan Log in / Sign up), sedangkan user yang login memakai `pages/browse.html` (sidebar + header aplikasi). User login yang membuka halaman publik dialihkan ke `pages/browse.html` dengan query setara (`instructor.html?id=X` → `browse.html?instructor=X`). Menu sidebar: **Browse courses** untuk learner dan instructor mode Learn, **Catalog** untuk admin. Guest yang menekan **Enroll for free** login lalu kembali ke `pages/browse.html?course=…`.

Alur utama: **Sign up** (selalu learner) → jelajahi katalog → **Enroll for free** → belajar modul & quiz → sertifikat saat progress 100% → tulis ulasan. Dari My Learning atau Profile, **Start teaching** mengubah akun menjadi instructor (tetap bisa belajar); instructor membuat course → menambah minimal satu modul → submit → admin approve → course tampil di katalog. Keputusan desain: [docs/DECISIONS.md](docs/DECISIONS.md) ADR-008/009.

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
├── catalog.html            ← Katalog + course landing page, shell publik (guest; user login dialihkan ke pages/browse.html)
├── instructor.html         ← Profil instructor, shell publik (guest)
├── verify.html             ← Verifikasi sertifikat publik
├── pages/                  ← Halaman aplikasi per role (browse.html = katalog di dalam aplikasi)
├── assets/
│   ├── css/style.css
│   ├── img/
│   └── js/
│       ├── config.js       ← Base URL API & transport (http / local)
│       ├── domain.js       ← Logika murni (progress, durasi course, label role, sertifikat)
│       ├── catalog-view.js ← Renderer katalog, landing page & profil instructor untuk dua shell (publik / aplikasi)
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
│   ├── Dockerfile          ← image produksi (migrasi + seed opsional + uvicorn di $PORT)
│   ├── Dockerfile.dev      ← image dev untuk docker compose (hot reload)
│   ├── start.sh            ← entrypoint produksi
│   ├── requirements*.txt
│   └── .env.example
├── docker-compose.yml      ← api + postgres (lokal)
├── render.yaml             ← blueprint Render (API + Postgres + static site)
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
docker compose exec api python -m app.seed        # data demo: akun, 5 kategori, 13 course + modul, enrollment, ulasan (--reset untuk mengisi ulang)
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
| `APP_ENV` | `development` atau `production` (production menolak `JWT_SECRET` default / < 32 karakter) | `production` |
| `DATABASE_URL` | URL PostgreSQL. `postgres://…` / `postgresql://…` dari Railway/Render otomatis diubah ke driver psycopg | `postgresql+psycopg://learnova:learnova@localhost:5432/learnova` |
| `TEST_DATABASE_URL` | Database khusus pytest (dibuat otomatis bila belum ada) | `postgresql+psycopg://learnova:learnova@localhost:5432/learnova_test` |
| `JWT_SECRET` | Secret penandatangan JWT (wajib diganti di produksi) | `ganti-dengan-string-acak-panjang` |
| `JWT_EXPIRES_MINUTES` | Masa berlaku token (menit) | `720` |
| `CORS_ORIGINS` | Origin frontend yang diizinkan, dipisah koma (`*` = semua) | `https://learnova-web.onrender.com` |
| `PORT` | Port uvicorn di image produksi (diisi otomatis oleh Railway/Render) | `8000` |
| `SEED_DEMO` | `true` → isi data demo bila database kosong, atau lengkapi data demo tambahan (headline/bio instructor, ulasan) bila sudah berisi: saat start (image Docker) atau saat build (Vercel) | `true` |
| `DATABASE_URL_UNPOOLED` | Hanya Vercel + Neon (disuntikkan integrasi Neon): koneksi direct untuk migrasi saat build; `DATABASE_URL` (pooled) dipakai runtime | `postgresql://…@ep-xxx.neon.tech/neondb?sslmode=require` |
| `VERCEL` | Diset otomatis oleh Vercel; bila ada, engine database memakai `NullPool` (tanpa pool di proses) | `1` |

Frontend tidak memakai environment variable: URL API produksi ditulis di `assets/js/config.js` (`PRODUCTION_API_URL`). Saat dibuka dari `localhost`, frontend otomatis memakai `http://localhost:8000/api/v1`.

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

Akun baru bisa dibuat lewat halaman **Sign up** (`register.html`); semua akun baru adalah learner (student) dan bisa menjadi instructor lewat tombol **Start teaching** di My Learning atau Profile.

Instructor demo punya headline & bio, dan ada 9 ulasan demo dari Alex, Nadia, dan Marcus. Bila database sudah berisi data (mis. produksi yang di-seed sebelum migrasi `0002`), `python -m app.seed` dan build Vercel dengan `SEED_DEMO=true` hanya **melengkapi** data demo tambahan ini (headline/bio yang masih kosong dan ulasan yang belum ada) tanpa mengubah data lain — idempoten.

Seed juga membuat 5 kategori dan 13 course dari mock data prototipe (9 Active, 2 Draft, 1 Pending `MOB301`, 1 Archived) beserta modulnya, dibagi ke Dr. Budi Santoso (Technology/Design) dan Dr. Adam Miller. Alex Mercer memakai progress & skor quiz demo dari prototipe (8 course, sebagian selesai dengan sertifikat); Nadia dan Marcus masing-masing 4 course. Ada 9 quiz (5 soal, lulus 70, 3 attempt, 10 menit) dari bank soal mock.

## API

Swagger UI: `http://localhost:8000/docs` · OpenAPI: `http://localhost:8000/openapi.json`. Semua endpoint memakai prefix `/api/v1`, JSON camelCase, dan error berbentuk `{ "error": { "code", "message", "fields"? } }`.

| Method | Path | Role |
|---|---|---|
| GET | `/api/v1/health` | publik |
| POST | `/api/v1/auth/register` | publik (selalu membuat akun student) |
| POST | `/api/v1/auth/login` | publik |
| POST | `/api/v1/auth/logout` | publik (JWT stateless) |
| GET | `/api/v1/auth/me` | login |
| POST | `/api/v1/auth/password` | login |
| PATCH | `/api/v1/me` (`{ name, headline?, bio? }` — headline/bio hanya instructor) | login |
| GET | `/api/v1/me/stats` | login |
| POST | `/api/v1/me/become-instructor` (`{ headline?, bio? }`) | student / instructor (idempoten), admin → 403 |
| GET | `/api/v1/users` (`role, q, status, sort, page, pageSize`) | admin |
| POST | `/api/v1/users` | admin |
| GET / PATCH / DELETE | `/api/v1/users/{id}` | admin |
| GET | `/api/v1/meta/notifications` | login |
| GET | `/api/v1/meta/instructors` | admin |
| GET | `/api/v1/catalog/courses` (`q, category, sort=popular|rating|newest|title, page, pageSize`; kartu berisi `ratingAverage`, `reviewCount`) | publik |
| GET | `/api/v1/catalog/courses/{id atau slug}` | publik (dengan token: `viewer` = status enroll/pemilik + `canReview`, `myReview`) |
| GET | `/api/v1/instructors/{id}` | publik (profil instructor: headline, bio, statistik, course Active) |
| GET | `/api/v1/courses/{id}/reviews` (`page, pageSize`; + `summary { average, count, distribution }`) | publik (course Active) |
| POST | `/api/v1/courses/{id}/reviews` (`{ rating, comment? }`) | learner terdaftar (satu per enrollment → 409 `ALREADY_REVIEWED`; belum enroll → 403 `NOT_ENROLLED`; pemilik → 403) |
| PATCH | `/api/v1/reviews/{id}` | penulis ulasan |
| DELETE | `/api/v1/reviews/{id}` | penulis ulasan / admin |
| GET | `/api/v1/categories`, `/api/v1/meta/categories` | publik |
| POST / PATCH / DELETE | `/api/v1/categories[/{id}]` | admin |
| GET | `/api/v1/courses` (`q, status, category, instructorId, open, sort, page, pageSize`) | admin (semua), instructor (miliknya), student (`open=true`) |
| POST | `/api/v1/courses` | instructor |
| GET | `/api/v1/courses/{id}` | admin, instructor pemilik, student terdaftar / course terbuka |
| PATCH | `/api/v1/courses/{id}` | instructor pemilik |
| DELETE | `/api/v1/courses/{id}` | instructor pemilik / admin (hanya Draft tanpa enrollment) |
| POST | `/api/v1/courses/{id}/transitions` (`submit, approve, reject, archive, restore`) | instructor pemilik (submit; detail belum lengkap → 400 `INCOMPLETE_COURSE`, belum ada modul → 400 `COURSE_HAS_NO_MODULES`) / admin |
| GET | `/api/v1/courses/{id}/status-logs`, `/api/v1/courses/{id}/stats` | admin, instructor pemilik |
| GET / POST | `/api/v1/courses/{id}/modules` | lihat: yang boleh melihat course · tambah: instructor pemilik |
| PUT | `/api/v1/courses/{id}/modules/order` | instructor pemilik |
| PATCH / DELETE | `/api/v1/modules/{id}` | instructor pemilik |
| POST | `/api/v1/courses/{id}/enrollments` | student / instructor (course Active, bukan course milik sendiri → 409 `OWN_COURSE`) |
| GET | `/api/v1/courses/{id}/enrollment` | student (enrollment miliknya di course itu) |
| GET | `/api/v1/me/enrollments` (`status, q, sort, page, pageSize`) | student / instructor |
| POST | `/api/v1/enrollments/{id}/completed-modules` (`{ moduleId }`) | student pemilik enrollment |
| GET | `/api/v1/courses/{id}/quizzes` | instructor/admin (dengan kunci) · student terdaftar (tanpa soal & kunci) |
| POST | `/api/v1/courses/{id}/quizzes` | instructor pemilik |
| GET / PATCH / DELETE | `/api/v1/quizzes/{id}` | GET: yang boleh melihat course · ubah: instructor pemilik |
| POST | `/api/v1/quizzes/{id}/attempts` (mulai / lanjutkan) | student terdaftar |
| GET | `/api/v1/quizzes/{id}/attempts` (riwayat) | student |
| GET / PATCH | `/api/v1/attempts/{id}` (review / simpan jawaban sementara) | student pemilik |
| POST | `/api/v1/attempts/{id}/submit` | student pemilik (ditolak 409 bila lewat `expiresAt` + 30 detik) |
| GET | `/api/v1/courses/{id}/students` (`q, sort, page, pageSize`) | admin, instructor pemilik (read-only) |
| GET | `/api/v1/certificates/{code}` | publik (verifikasi) |
| GET | `/api/v1/reports/summary`, `/api/v1/reports/enrollments`, `/api/v1/reports/enrollments.csv` | admin |
| GET | `/api/v1/activities` | admin |
| GET | `/api/v1/dashboard/admin` · `/dashboard/instructor` · `/dashboard/student` | sesuai role |
| GET | `/api/v1/meta/enrollment-chart`, `/api/v1/meta/system-status` | admin |

Autentikasi: header `Authorization: Bearer <token>` dari `/auth/login`.

Endpoint berikutnya mengikuti kontrak `MockServer` (`assets/js/api/transport-local.js`), rencananya di [docs/BACKEND_PLAN.md](docs/BACKEND_PLAN.md).

## Database

PostgreSQL 16 dengan 14 tabel: `users`, `categories`, `courses`, `course_status_logs`, `modules`, `quizzes`, `questions`, `question_options`, `enrollments`, `module_progress`, `quiz_attempts`, `attempt_answers`, `certificates`, `reviews`. Migrasi: `0001` skema awal, `0002` ulasan + profil instructor (aditif). Primary key UUID, enum disimpan sebagai string + CHECK constraint, extension `pg_trgm` untuk pencarian course. Diagram, relasi, dan daftar index: [docs/ERD.md](docs/ERD.md).

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

Arsitektur produksi: **backend** (image Docker `backend/Dockerfile`) + **PostgreSQL 16** + **frontend statis** (folder root repo, tanpa build). Image produksi menjalankan `alembic upgrade head` setiap start, lalu `python -m app.seed` bila `SEED_DEMO=true` (dilewati bila data sudah ada), lalu uvicorn di `$PORT`.

### Opsi Vercel (disarankan untuk demo kuliah)

Dua project Vercel dari repo yang sama + database Neon Postgres (Vercel Marketplace). API berjalan sebagai Vercel Function (FastAPI zero-config, entrypoint `backend/app/main.py`, objek `app`). Migrasi Alembic dan seed demo dijalankan saat **build** oleh `backend/vercel_build.py` (dipanggil dari `[tool.vercel.scripts] build` di `backend/pyproject.toml`).

a. **Project API** — Vercel → **Add New → Project** → import repo, nama `learnova-api`, **Root Directory** `backend`. Framework **FastAPI** terdeteksi otomatis; **Build Command dibiarkan kosong**.
b. **Database** — di project `learnova-api` buka tab **Storage** → buat/hubungkan database **Neon** untuk environment Production, Preview, dan Development. Integrasi ini menyuntikkan `DATABASE_URL` (pooled) dan `DATABASE_URL_UNPOOLED` (direct).
c. **Environment variable** (Settings → Environment Variables):
   `APP_ENV=production`, `JWT_SECRET` (acak ≥ 32 karakter, mis. `python -c "import secrets; print(secrets.token_urlsafe(48))"`), `JWT_EXPIRES_MINUTES=720`, `SEED_DEMO=true`, `CORS_ORIGINS` (diisi setelah langkah e).
d. **Redeploy** `learnova-api`, lalu cek `https://<api>.vercel.app/api/v1/health` → `{"status":"ok","database":"ok"}`. Log build menampilkan baris `[vercel-build]` (migrasi + seed).
e. **Project web** — isi `PRODUCTION_API_URL` di `assets/js/config.js` dengan `https://<api>.vercel.app/api/v1`, commit & push. Import repo lagi sebagai project `learnova-web`: **Root Directory** = root repo, **Framework Preset** "Other", tanpa Build Command, **Output Directory** `.`.
f. **CORS** — isi `CORS_ORIGINS` di `learnova-api` dengan domain `learnova-web`, mis. `https://learnova-web.vercel.app` (tanpa garis miring di akhir), lalu redeploy `learnova-api`.
g. **Catatan** — setiap build menjalankan migrasi + seed otomatis (seed dilewati bila data sudah ada). Untuk reset data demo, jalankan dari lokal: `cd backend && DATABASE_URL="<DATABASE_URL_UNPOOLED dari Neon>" python -m app.seed --reset`.

### Opsi A — Render (blueprint)

1. Push repo ke GitHub, buka Render → **New → Blueprint** → pilih repo. `render.yaml` membuat `learnova-db` (Postgres 16), `learnova-api` (Docker, `JWT_SECRET` dibuat otomatis, `SEED_DEMO=true`), dan `learnova-web` (static site).
2. Setelah selesai, buka `learnova-api` → **Environment** → isi `CORS_ORIGINS` dengan URL static site, mis. `https://learnova-web.onrender.com`.
3. Ubah `PRODUCTION_API_URL` di `assets/js/config.js` menjadi URL API + `/api/v1`, mis. `https://learnova-api.onrender.com/api/v1`, commit & push (static site ter-deploy ulang).
4. Cek `https://learnova-api.onrender.com/api/v1/health` → `{"status":"ok","database":"ok"}`, lalu login dengan akun demo.

### Opsi B — Railway

1. **New Project → Deploy from GitHub repo**, set **Root Directory** = `backend` (Railway memakai `backend/Dockerfile`).
2. Tambahkan **PostgreSQL** ke project, lalu di service API set variabel: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `APP_ENV=production`, `JWT_SECRET=<acak ≥ 32 karakter>`, `SEED_DEMO=true`, `CORS_ORIGINS=<URL frontend>`.
3. **Settings → Networking → Generate Domain** untuk API. Health check: `/api/v1/health`.
4. Frontend: deploy root repo sebagai static site (Vercel / Netlify / Render static / GitHub Pages) dan isi `PRODUCTION_API_URL` seperti langkah A.3.

### Opsi C — VPS (Docker)

```bash
docker network create learnova
docker run -d --name learnova-db --network learnova -e POSTGRES_USER=learnova \
  -e POSTGRES_PASSWORD=<password> -e POSTGRES_DB=learnova -v learnova-pg:/var/lib/postgresql/data postgres:16-alpine
docker build -t learnova-api ./backend
docker run -d --name learnova-api --network learnova -p 8000:8000 -e APP_ENV=production \
  -e DATABASE_URL=postgresql://learnova:<password>@learnova-db:5432/learnova \
  -e JWT_SECRET=<acak ≥ 32 karakter> -e SEED_DEMO=true -e CORS_ORIGINS=https://lms.domainanda.id learnova-api
```

Pasang reverse proxy (Nginx/Caddy) dengan HTTPS untuk API dan sajikan folder repo sebagai static site.

### Frontend statis (Vercel / Netlify)

Import repo, framework preset **Other**, tanpa build command, output directory = root. Pastikan `PRODUCTION_API_URL` sudah menunjuk ke backend dan domain frontend ada di `CORS_ORIGINS`.

### Setelah deploy

- Akun demo (bila `SEED_DEMO=true`): lihat bagian **Akun demo**. Ganti password admin setelah demo.
- Swagger produksi: `https://<api>/docs`.

### Data produksi: melengkapi atau me-reset

Migrasi selalu aditif (tidak ada drop kolom/tabel), sehingga data yang sudah ada aman saat deploy. Pilih salah satu:

1. **Melengkapi data demo baru tanpa reset (disarankan).** Dengan `SEED_DEMO=true`, setiap build Vercel menjalankan `alembic upgrade head` lalu seed; bila data sudah ada, seed hanya mengisi headline/bio instructor demo yang masih kosong dan ulasan demo yang belum ada. Cukup **Redeploy** project `learnova-api` (Vercel → Deployments → ⋯ → Redeploy) dan cek log build `[vercel-build]`. Alternatif dari lokal:
   ```bash
   cd backend
   DATABASE_URL="<DATABASE_URL_UNPOOLED dari Neon>" alembic upgrade head
   DATABASE_URL="<DATABASE_URL_UNPOOLED dari Neon>" python -m app.seed
   ```
2. **Reset penuh ke data demo (menghapus SEMUA data, termasuk akun yang mendaftar sendiri).** Opsional: buat backup/branch Neon dulu (Neon Console → Branches → Create branch). Lalu:
   ```bash
   cd backend
   DATABASE_URL="<DATABASE_URL_UNPOOLED dari Neon>" alembic upgrade head
   DATABASE_URL="<DATABASE_URL_UNPOOLED dari Neon>" python -m app.seed --reset
   ```
   Pada image Docker (Render/Railway/VPS) jalankan `python -m app.seed --reset` di shell service API.
3. **Verifikasi:** `GET /api/v1/health` → `{"status":"ok","database":"ok"}`, katalog menampilkan 9 course dengan rating, login dengan akun demo, dan profil instructor dari nama instructor di landing page (guest: `instructor.html?id=…`, login: `pages/browse.html?instructor=…`).

## Roadmap dan Known Issues

Roadmap integrasi backend (satu PR per fase):

1. ✅ Dokumentasi & rencana
2. ✅ Backend skeleton (FastAPI, Alembic, Docker, CI)
3. ✅ Auth & users
4. ✅ Courses & katalog publik
5. ✅ Enrollment & progress
6. ✅ Quiz dinilai di server
7. ✅ Nilai akhir, IPK, sertifikat, laporan, dashboard
8. ✅ Siap deploy

Transformasi platform kursus publik (Oktober 2026):

- ✅ A. Dokumentasi rencana (ADR-008 model akun, ADR-009 penghapusan konsep akademik)
- ✅ B. Model akun: registrasi tanpa role, `POST /me/become-instructor`, instructor bisa belajar, pengalih mode Learn/Teach
- ✅ C. Hapus konsep akademik dari UI & API; halaman Students read-only; laporan admin tanpa IPK
- ✅ D. My Learning, katalog sebagai halaman utama publik, course landing page dengan kurikulum & total durasi
- ✅ E. Ulasan course + profil instructor publik (migrasi aditif: `reviews`, `users.headline`, `users.bio`)
- ✅ F. Polish copywriting (Learner), state loading/empty/error, README final

Berikutnya: upload thumbnail/video ke object storage, refresh token + rate limiting login, reset password via email, editor bobot soal, course berbayar (kolom `price` sudah ada, saat ini selalu 0), log audit umum, halaman moderasi ulasan untuk admin, pembersihan kolom akademik lama di database.

Known issues saat ini: upload thumbnail course belum disimpan (hanya preview); aktivitas & notifikasi diturunkan dari data (tidak ada tabel log umum); seed hanya berisi 6 akun demo. Pertanyaan terbuka: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md).
