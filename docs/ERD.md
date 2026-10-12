# ERD — Learnova LMS

Diagram ini mengikuti implementasi nyata di `backend/app/*/models.py` dan migrasi Alembic `backend/alembic/versions/`. Kolom bertanda *(prototipe)* adalah tambahan dari mock data (lihat [DECISIONS.md](DECISIONS.md) ADR-006).

Migrasi: `0001` (skema awal), `0002` (tabel `reviews`, kolom `users.headline` & `users.bio` — aditif, aman untuk data yang sudah ada).

```mermaid
erDiagram
    USERS ||--o{ COURSES : "mengajar (instructor)"
    CATEGORIES |o--o{ COURSES : "mengelompokkan"
    COURSES ||--o{ COURSE_STATUS_LOGS : "riwayat status"
    USERS ||--o{ COURSE_STATUS_LOGS : "pelaku"
    COURSES ||--o{ MODULES : "berisi"
    COURSES ||--o{ QUIZZES : "memiliki"
    MODULES |o--o{ QUIZZES : "opsional terikat"
    QUIZZES ||--o{ QUESTIONS : "berisi"
    QUESTIONS ||--o{ QUESTION_OPTIONS : "pilihan"
    USERS ||--o{ ENROLLMENTS : "mendaftar"
    COURSES ||--o{ ENROLLMENTS : "diikuti"
    ENROLLMENTS ||--o{ MODULE_PROGRESS : "mencatat"
    MODULES ||--o{ MODULE_PROGRESS : "diselesaikan"
    ENROLLMENTS ||--o{ QUIZ_ATTEMPTS : "mengerjakan"
    QUIZZES ||--o{ QUIZ_ATTEMPTS : "dikerjakan"
    QUIZ_ATTEMPTS ||--o{ ATTEMPT_ANSWERS : "berisi jawaban"
    QUESTIONS ||--o{ ATTEMPT_ANSWERS : "dijawab"
    QUESTION_OPTIONS |o--o{ ATTEMPT_ANSWERS : "dipilih"
    ENROLLMENTS ||--o| CERTIFICATES : "menghasilkan"
    ENROLLMENTS ||--o| REVIEWS : "diulas (maks 1)"
    COURSES ||--o{ REVIEWS : "menerima"
    USERS ||--o{ REVIEWS : "menulis"

    USERS {
        uuid id PK
        varchar120 name
        varchar255 email UK "lowercase"
        varchar255 password_hash "argon2"
        varchar20 role "admin | instructor | student"
        bool is_active "default true"
        varchar20 id_number UK "nullable, NIM/NIDN/Staff ID (prototipe)"
        varchar60 department "nullable (prototipe)"
        varchar120 headline "nullable, profil publik instructor (0002)"
        text bio "nullable, profil publik instructor (0002)"
        timestamptz created_at
        timestamptz updated_at
    }
    CATEGORIES {
        uuid id PK
        varchar80 name UK
        varchar100 slug UK
        timestamptz created_at
    }
    COURSES {
        uuid id PK
        uuid instructor_id FK "users, RESTRICT"
        uuid category_id FK "nullable, categories, SET NULL"
        varchar200 title
        varchar220 slug UK
        text description "nullable"
        varchar500 thumbnail_url "nullable"
        int price "default 0, >= 0"
        varchar20 status "draft | pending | active | rejected | archived"
        timestamptz submitted_at "nullable"
        timestamptz published_at "nullable"
        varchar12 code UK "nullable (prototipe)"
        varchar40 semester "nullable (prototipe)"
        int duration_weeks "nullable (prototipe)"
        date start_date "nullable (prototipe)"
        int max_students "nullable (prototipe)"
        varchar9 color "nullable (prototipe)"
        bool enrollment_open "default true (prototipe)"
        bool issues_certificate "default false (prototipe)"
        timestamptz created_at
        timestamptz updated_at
    }
    COURSE_STATUS_LOGS {
        uuid id PK
        uuid course_id FK "courses, CASCADE"
        uuid actor_id FK "users, RESTRICT"
        varchar20 from_status "nullable"
        varchar20 to_status
        text note "nullable, alasan reject"
        timestamptz created_at
    }
    MODULES {
        uuid id PK
        uuid course_id FK "courses, CASCADE"
        varchar200 title
        varchar20 type "lecture | practice"
        text content "nullable"
        varchar500 video_url "nullable"
        int position
        int minutes "nullable (prototipe)"
        jsonb tasks "default [] (prototipe)"
        timestamptz created_at
        timestamptz updated_at
    }
    QUIZZES {
        uuid id PK
        uuid course_id FK "courses, CASCADE"
        uuid module_id FK "nullable, modules, SET NULL"
        varchar200 title
        text description "nullable"
        int duration_minutes "> 0"
        int max_attempts ">= 1"
        int passing_score "0..100, default 70 (prototipe)"
        timestamptz created_at
        timestamptz updated_at
    }
    QUESTIONS {
        uuid id PK
        uuid quiz_id FK "quizzes, CASCADE"
        text text
        int points "default 1, >= 1"
        int position
    }
    QUESTION_OPTIONS {
        uuid id PK
        uuid question_id FK "questions, CASCADE"
        text text
        bool is_correct "default false"
        int position
    }
    ENROLLMENTS {
        uuid id PK
        uuid user_id FK "users, RESTRICT"
        uuid course_id FK "courses, RESTRICT"
        varchar20 status "active | completed"
        numeric5_2 progress_pct "0..100"
        numeric5_2 final_score "nullable, 0..100"
        varchar2 grade_letter "nullable"
        timestamptz enrolled_at
        timestamptz completed_at "nullable"
    }
    MODULE_PROGRESS {
        uuid id PK
        uuid enrollment_id FK "enrollments, CASCADE"
        uuid module_id FK "modules, CASCADE"
        timestamptz completed_at
    }
    QUIZ_ATTEMPTS {
        uuid id PK
        uuid enrollment_id FK "enrollments, CASCADE"
        uuid quiz_id FK "quizzes, CASCADE"
        int attempt_number
        varchar20 status "in_progress | submitted | expired"
        timestamptz started_at
        timestamptz expires_at
        timestamptz submitted_at "nullable"
        numeric5_2 score "nullable"
    }
    ATTEMPT_ANSWERS {
        uuid id PK
        uuid attempt_id FK "quiz_attempts, CASCADE"
        uuid question_id FK "questions, CASCADE"
        uuid selected_option_id FK "nullable, question_options, SET NULL"
        bool is_correct
    }
    CERTIFICATES {
        uuid id PK
        uuid enrollment_id FK,UK "enrollments, RESTRICT"
        varchar32 code UK "acak"
        timestamptz issued_at
    }
    REVIEWS {
        uuid id PK
        uuid enrollment_id FK,UK "enrollments, CASCADE"
        uuid course_id FK "courses, CASCADE"
        uuid user_id FK "users, CASCADE"
        int rating "1..5"
        text comment "nullable, maks 1000 karakter (validasi API)"
        timestamptz created_at
        timestamptz updated_at
    }
```

## Relasi

- Satu **user** (role instructor) mengajar banyak **course**; user tidak bisa dihapus selama masih punya course (`RESTRICT`).
- **Category** opsional per course; menghapus kategori membuat `category_id` menjadi `NULL`.
- Setiap perubahan status course dicatat di **course_status_logs** (pelaku + catatan alasan reject).
- **Module** dan **quiz** milik course (`CASCADE`). Quiz boleh terikat ke modul tertentu (opsional).
- **Question** milik quiz; **question_options** milik question, tepat satu opsi benar per soal.
- **Enrollment** menghubungkan student dan course (unik per pasangan). Progress per modul di **module_progress**.
- **Quiz attempt** milik enrollment + quiz; jawaban per soal di **attempt_answers**.
- **Certificate** maksimal satu per enrollment; enrollment bersertifikat tidak bisa dihapus (`RESTRICT`).
- **Review** maksimal satu per enrollment (hanya learner yang terdaftar); ikut terhapus bila enrollment, course, atau user dihapus (`CASCADE`). `course_id` dan `user_id` disimpan agar agregat rating (rata-rata + jumlah) per course cukup satu query; agregat tidak disimpan di `courses`.

## Index & constraint

| Tabel | Index / constraint |
|---|---|
| users | `UNIQUE(email)`, partial `UNIQUE(id_number) WHERE id_number IS NOT NULL`, `CHECK role` |
| categories | `UNIQUE(name)`, `UNIQUE(slug)` |
| courses | `UNIQUE(slug)`, partial `UNIQUE(code) WHERE code IS NOT NULL`, `INDEX(status)`, `INDEX(category_id)`, `INDEX(instructor_id)`, GIN `pg_trgm` pada `title` dan `description`, `CHECK price >= 0`, `CHECK status` |
| course_status_logs | `INDEX(course_id, created_at)` |
| modules | `INDEX(course_id, position)`, `CHECK type` |
| quizzes | `INDEX(course_id)`, `CHECK duration_minutes > 0`, `CHECK max_attempts >= 1`, `CHECK passing_score 0..100` |
| questions | `INDEX(quiz_id, position)`, `CHECK points >= 1` |
| question_options | `INDEX(question_id, position)`, partial `UNIQUE(question_id) WHERE is_correct = true` |
| enrollments | `UNIQUE(user_id, course_id)`, `CHECK status`, `CHECK progress_pct 0..100`, `CHECK final_score 0..100` |
| module_progress | `UNIQUE(enrollment_id, module_id)` |
| quiz_attempts | `UNIQUE(enrollment_id, quiz_id, attempt_number)`, partial `UNIQUE(enrollment_id, quiz_id) WHERE status = 'in_progress'`, `CHECK status` |
| attempt_answers | `UNIQUE(attempt_id, question_id)` |
| certificates | `UNIQUE(enrollment_id)`, `UNIQUE(code)` |
| reviews | `UNIQUE(enrollment_id)`, `INDEX(course_id, created_at)`, `CHECK rating 1..5` |

Extension: `pg_trgm` (dibuat oleh migrasi `0001`).
