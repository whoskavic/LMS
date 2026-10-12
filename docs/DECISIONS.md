# Architecture Decision Records (ringkas)

Format: konteks → keputusan → konsekuensi.

## ADR-001 — Backend modular monolith FastAPI di `backend/`
- **Konteks:** frontend vanilla sudah punya service layer `Api` dengan transport yang bisa ditukar (`local` / `http`).
- **Keputusan:** satu aplikasi FastAPI di `backend/` dengan satu folder per domain (auth, users, courses, enrollments, quizzes, reports), masing-masing berisi `models.py`, `schemas.py`, `service.py`, `router.py`. SQLAlchemy 2.0 (sync, psycopg 3), Alembic, PostgreSQL 16.
- **Konsekuensi:** deploy satu service + satu database; batas domain tetap jelas.

## ADR-002 — Kontrak API mengikuti MockServer
- **Konteks:** `assets/js/api/transport-local.js` adalah "spesifikasi yang bisa dijalankan" (path, status code, kode error, bentuk respons).
- **Keputusan:** backend memakai prefix `/api/v1`, JSON camelCase, list `{ items, total, page, pageSize }`, error `{ "error": { code, message, fields? } }` (termasuk error validasi → 400 `VALIDATION` dengan `fields`). Nilai enum di API memakai label tampilan seperti mock (`"Active"`, `"Draft"`, `"Lecture"`), sedangkan database menyimpan huruf kecil sesuai skema (`active`, `draft`, `lecture`).
- **Konsekuensi:** halaman cukup berpindah dari `DB/Store` ke `Api.*` tanpa mengubah logika tampilan; `transport-http.js` yang sudah ada dipakai sebagai fetch wrapper.

## ADR-003 — `api.js` = modul `assets/js/api/` yang sudah ada
- **Konteks:** prompt meminta satu modul `api.js` (base URL dari config, fetch wrapper, token, error handling).
- **Keputusan:** fungsi tersebut sudah ada di `api/client.js` (token, `ApiError`) dan `api/transport-http.js` (fetch). Ditambahkan `assets/js/config.js` untuk base URL & transport; tidak membuat file kedua yang menduplikasi.
- **Konsekuensi:** tetap classic script agar `file://` dan hosting statis jalan tanpa build.

## ADR-004 — Auth JWT stateless
- **Keputusan:** `POST /auth/login` mengembalikan JWT (HS256, secret dari env `JWT_SECRET`) yang dikirim lewat header `Authorization: Bearer`. Password di-hash argon2. Logout = hapus token di klien (endpoint tetap ada dan mengembalikan `{ ok: true }`). User nonaktif ditolak di setiap request (401 `ACCOUNT_INACTIVE`).
- **Konsekuensi:** tabel `sessions` di mock tidak dibawa ke database.

## ADR-005 — Role `lecturer` → `instructor`
- **Keputusan:** role disimpan `admin | instructor | student`. Registrasi publik boleh memilih student atau instructor; admin hanya dari seed.

## ADR-006 — Perbedaan skema vs prototipe
Kolom tambahan dari prototipe (diizinkan prompt karena datanya ada di mock):

| Tabel | Kolom tambahan | Asal di mock |
|---|---|---|
| users | `id_number` (NIM/NIDN/Staff ID, nullable, unik), `department` (nullable) | `idNumber`, `department` |
| courses | `code` (unik, nullable saat Draft), `semester`, `duration_weeks`, `start_date`, `max_students`, `color`, `enrollment_open`, `issues_certificate` | `code`, `semester`, `duration`, `startDate`, `maxStudents`, `color`, `enrollmentOpen`, `certificate` |
| modules | `minutes`, `tasks` (JSONB daftar tugas latihan) | `minutes`, `tasks` |
| quizzes | `passing_score` | `passingScore` |

Perbedaan relasi/representasi:
- Quiz terikat ke course (sama dengan skema); `module_id` opsional dan tidak dipakai UI saat ini.
- Progress di mock disimpan sebagai **jumlah** modul selesai; di database per modul (`module_progress`). Aturan "modul harus diselesaikan berurutan" dipertahankan di service.
- Jawaban quiz di mock berupa index opsi (`answer: 0..3`); di database berupa `question_options.is_correct`. API instructor tetap menerima/mengembalikan `answer` (index) agar editor quiz tidak berubah.
- Kategori di mock berupa string; di database tabel `categories` (API course tetap mengembalikan nama kategori).
- `rejectionReason` di mock → `course_status_logs.note`.
- Nomor sertifikat di mock diturunkan dari kode course + ID enrollment; di database `certificates.code` acak (tidak bisa ditebak) dengan format `LRN-<KODE>-<acak>`.
- Aktivitas, notifikasi, status sistem, dan grafik enrollment tidak punya tabel; dihitung dari data yang ada.

## ADR-007 — Deploy demo kuliah di Vercel + Neon
- **Konteks:** aplikasi harus bisa dibuka dosen kapan saja tanpa biaya. Image Docker (`start.sh`) sudah bisa dipakai di Render/Railway/VPS, tetapi layanan gratis Render tidur saat idle (start lambat) dan Railway tidak punya paket gratis permanen.
- **Opsi:** (1) Vercel (FastAPI sebagai Vercel Function + frontend statis) + Neon Postgres dari Vercel Marketplace; (2) blueprint Render (`render.yaml`); (3) Railway.
- **Keputusan:** Vercel + Neon menjadi opsi utama untuk demo kuliah; Docker/Render/Railway tetap didukung tanpa perubahan perilaku. Karena di Vercel tidak ada `start.sh`, migrasi Alembic + seed opsional dijalankan saat build (`backend/vercel_build.py`, memakai koneksi direct `DATABASE_URL_UNPOOLED`). Engine SQLAlchemy memakai `NullPool` saat env `VERCEL` ada, dan prepared statement psycopg dimatikan (`prepare_threshold=None`) di semua environment agar aman di belakang PgBouncer mode transaction.
- **Konsekuensi:** tidak ada server yang tidur (function dingin hanya menambah latensi singkat); migrasi gagal = deploy gagal; setiap request membuka koneksi baru ke pooler Neon (overhead kecil, diserahkan ke pooler); dependency runtime harus sama di `pyproject.toml` dan `requirements.txt`. Paket Hobby Vercel hanya untuk penggunaan non-komersial — bila Learnova menjadi platform publik berbayar perlu paket Pro atau kembali ke deploy Docker.

## ADR-008 — Model akun platform publik (learner → instructor)
> Disebut "ADR-005 (model akun)" di rencana transformasi; nomor 005 sudah dipakai, jadi dicatat sebagai ADR-008.
- **Konteks:** Learnova bergeser dari LMS kampus ke platform kursus publik ala Udemy. Memilih role saat registrasi membingungkan pengguna baru, dan pengajar juga ingin belajar.
- **Keputusan:**
  - Registrasi publik selalu membuat akun `student` (di UI disebut "Learner"). Tidak ada pilihan role di form.
  - `POST /api/v1/me/become-instructor` ("Mulai Mengajar") mengubah `student` → `instructor` (body opsional `headline`, `bio`); idempoten untuk instructor, 403 untuk admin.
  - Instructor adalah superset student: boleh enroll & belajar di course instructor lain (course miliknya sendiri → 409 `OWN_COURSE`). Endpoint learner (enrollment, modul, quiz attempt, sertifikat, ulasan) menerima `student` dan `instructor`.
  - UI instructor punya pengalih mode "Belajar" / "Mengajar"; mode terakhir disimpan di `localStorage` sebagai preferensi UI.
  - Admin tetap moderator terpisah (user, kategori, approval, laporan) dan hanya dibuat lewat seed.
  - Kolom `users.role` tetap tiga nilai; tidak ada migrasi role.
- **Konsekuensi:** pemeriksaan role di backend memakai himpunan "learner" (`student`, `instructor`); halaman learner terbuka untuk instructor; home setelah login = My Learning untuk student, sesuai mode terakhir untuk instructor.

## ADR-009 — Penghapusan konsep akademik
> Disebut "ADR-006" di rencana transformasi; dicatat sebagai ADR-009.
- **Konteks:** IPK, semester, NIM/NIDN, departemen, kode course, durasi minggu, tanggal mulai, kapasitas, dan nilai akhir dosen tidak relevan untuk platform kursus publik gratis.
- **Keputusan:**
  - Dihapus dari UI dan API: IPK/GPA, grade letter & nilai akhir, semester, NIM/NIDN (`id_number`), departemen, kode course, durasi minggu, tanggal mulai, `max_students`, `enrollment_open`, input nilai oleh instructor, batch enroll & kandidat student.
  - Pengganti: progress %, jumlah course selesai, jumlah sertifikat, skor quiz terbaik; filter status belajar (sedang berjalan / selesai); durasi course = total `modules.minutes`.
  - Halaman nilai instructor menjadi "Students" read-only (peserta, progress, skor quiz terbaik, status selesai). Learner enroll sendiri; course Active selalu bisa di-enroll.
  - Sertifikat: progress 100% pada course dengan `issues_certificate = true`.
  - Endpoint nilai & batch enroll dihapus (404).
- **Pembersihan skema ditunda:** kolom `final_score`, `grade_letter`, `code`, `semester`, `duration_weeks`, `start_date`, `max_students`, `enrollment_open`, `id_number`, `department` **tidak di-drop** di fase ini (semua nullable/berdefault aman) agar migrasi aditif dan aman untuk database produksi. Drop kolom dilakukan di fase berikutnya setelah tidak ada kode yang membacanya.
- **Konsekuensi:** halaman wajib tugas kuliah (`index.html`, `layout.html`, `dashboard.html`, `data-master.html`, `form.html`, `laporan.html`) tetap ada; hanya isinya yang disesuaikan.
