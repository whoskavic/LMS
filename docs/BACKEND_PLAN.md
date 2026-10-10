# Rencana Backend — Learnova LMS

Dokumen ini memetakan prototipe (mock data + MockServer) ke backend FastAPI + PostgreSQL. Sumber kebenaran skema: `prompt.md` bagian "Skema Database". Keputusan arsitektur: [DECISIONS.md](DECISIONS.md).

## 1. Struktur

```
backend/
├── app/
│   ├── main.py            ← FastAPI app, CORS, error handler, router /api/v1
│   ├── config.py          ← Settings dari environment (pydantic-settings)
│   ├── db.py              ← engine, SessionLocal, Base
│   ├── common/            ← error, pagination, mixin timestamp, util
│   ├── auth/              ← login, register, me, password, JWT, dependency role
│   ├── users/             ← model User, admin CRUD
│   ├── courses/           ← Category, Course, CourseStatusLog, Module, katalog
│   ├── enrollments/       ← Enrollment, ModuleProgress, Certificate, nilai
│   ├── quizzes/           ← Quiz, Question, QuestionOption, QuizAttempt, AttemptAnswer
│   ├── reports/           ← laporan, CSV, dashboard, aktivitas, meta
│   └── seed.py            ← data demo
├── alembic/               ← migrasi
├── tests/                 ← pytest + httpx (TestClient) terhadap PostgreSQL
├── Dockerfile
└── pyproject.toml         ← dependency, ruff, pytest
```

## 2. Pemetaan entitas prototipe → skema

| Prototipe (mock) | Field mock | Tabel / kolom |
|---|---|---|
| User | id, role (`admin/lecturer/student`), name, email, password, idNumber, department, status (`Active/Inactive`) | `users`: id (UUID), role (`admin/instructor/student`), name, email (lowercase), password_hash (argon2), id_number, department, is_active |
| Course | id, code, title, lecturerId, category, status, semester, duration, startDate, maxStudents, color, description, enrollmentOpen, certificate, rejectionReason | `courses` (+ `categories`, `course_status_logs`); `instructor_id`, `category_id`, `slug` (dari title), `price` = 0 |
| Module | id, courseId, order, title, type (`Lecture/Practice`), minutes, content, tasks[] | `modules`: position, type (`lecture/practice`), minutes, content, tasks (JSONB), video_url |
| Quiz | id, courseId, title, passingScore, maxAttempts, timeLimit, questions[] | `quizzes`: duration_minutes (= timeLimit), max_attempts, passing_score |
| Question | text, options[4], answer (index) | `questions` + `question_options` (is_correct, position) |
| Enrollment | id, studentId, courseId, completedModules, attempts[], finalScore, grade, completedAt | `enrollments` (+ `module_progress`, `certificates`): progress_pct, final_score, grade_letter, status |
| QuizAttempt | quizId, score, answers[], date | `quiz_attempts` + `attempt_answers` |
| Activity | time, actor, action | (tanpa tabel) diturunkan dari status log, enrollment, attempt |
| Session | token, userId | (tanpa tabel) JWT |

## 3. Logika yang dipindah apa adanya
- Skala nilai (`Domain.GRADE_SCALE`): A ≥ 85 (4.0), A- ≥ 80 (3.7), B+ ≥ 75 (3.3), B ≥ 70 (3.0), B- ≥ 65 (2.7), C+ ≥ 60 (2.3), C ≥ 55 (2.0), D ≥ 45 (1.0), E (0).
- IPK = rata-rata bobot huruf dari enrollment yang sudah punya nilai; dihitung saat diminta.
- Progress = modul selesai / total modul × 100.
- Skor quiz = jumlah benar / jumlah soal × 100 (dibulatkan); skor terbaik per quiz; rata-rata quiz per enrollment = rata-rata skor terbaik.
- Sertifikat: course menerbitkan sertifikat (`issues_certificate`), punya modul, dan progress 100%.
- Status laporan: Completed (progress 100) · At risk (progress < 40 atau rata-rata quiz < 65) · On track.
- Aturan validasi form (nama, email, password ≥ 8 huruf + angka, NIM 5–10 digit, NIDN 10 digit, kode course, dll.) mengikuti `Rules` di MockServer.

## 4. Endpoint (prefix `/api/v1`)

| Fase | Method & path | Role |
|---|---|---|
| PR 2 | `GET /health` | publik |
| PR 3 | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` | publik |
| PR 3 | `GET /auth/me`, `POST /auth/password`, `PATCH /me`, `GET /me/stats` | login |
| PR 3 | `GET/POST /users`, `GET/PATCH/DELETE /users/{id}`, `GET /meta/departments` | admin |
| PR 4 | `GET /catalog/courses?q=&category=&page=&pageSize=`, `GET /catalog/courses/{id or slug}`, `GET /categories` | publik |
| PR 4 | `POST/PATCH/DELETE /categories/{id}` | admin |
| PR 4 | `GET /courses`, `GET /courses/{id}`, `GET /courses/{id}/stats` | login (sesuai role) |
| PR 4 | `POST /courses`, `PATCH/DELETE /courses/{id}` | instructor pemilik (delete: + admin) |
| PR 4 | `POST /courses/{id}/transitions` (`submit/approve/reject/archive/restore`), `GET /courses/{id}/status-logs` | instructor/admin |
| PR 4 | `GET/POST /courses/{id}/modules`, `PATCH/DELETE /modules/{id}`, `PUT /courses/{id}/modules/order` | instructor pemilik |
| PR 5 | `POST /courses/{id}/enrollments`, `GET /me/enrollments`, `POST /enrollments/{id}/completed-modules` | student |
| PR 5 | `POST /courses/{id}/enrollments/batch`, `DELETE /enrollments/{id}` | instructor pemilik |
| PR 6 | `GET/POST /courses/{id}/quizzes`, `GET/PATCH/DELETE /quizzes/{id}` | instructor pemilik / student terdaftar (tanpa kunci) |
| PR 6 | `POST /quizzes/{id}/attempts`, `GET /quizzes/{id}/attempts`, `PATCH /attempts/{id}`, `POST /attempts/{id}/submit`, `GET /attempts/{id}` | student |
| PR 7 | `GET/PUT /courses/{id}/grades`, `GET /certificates/{code}` (publik), `GET /me/certificates` | instructor / student |
| PR 7 | `GET /reports/summary`, `GET /reports/enrollments`, `GET /reports/enrollments.csv`, `GET /activities`, `GET /dashboard/{role}`, `GET /meta/*` | admin / sesuai role |

## 5. Urutan migrasi frontend
1. `assets/js/config.js` (base URL + transport) dan pindah ke transport `http`.
2. Login, register, guard, profil, users (PR 3).
3. Courses, form course, detail course, modul (PR 4).
4. Dashboard student, halaman belajar (PR 5).
5. Quiz & editor quiz (PR 6).
6. Nilai, laporan, dashboard admin/instructor, sertifikat (PR 7).

Setiap halaman yang dimigrasi tidak lagi memanggil `DB.*`, `Store.*`, atau `SEED.*`, dan menangani state loading, empty, dan error.
