# Pertanyaan Terbuka & Asumsi

Daftar ambiguitas kecil yang diputuskan dengan asumsi paling sederhana. Sinkron dengan bagian "Roadmap dan Known Issues" di README.

| # | Topik | Asumsi yang diambil | Status |
|---|---|---|---|
| 1 | Nama branch utama | Repo memakai `master` (bukan `main` seperti di `prompt.md`). Semua PR menuju `master`. | Diputuskan |
| 2 | `gh` CLI | Token `gh` di lingkungan kerja tidak valid; PR dibuat, dipantau, dan di-merge lewat GitHub API (MCP) dengan alur yang sama. PR 1 memakai branch kerja sesi `claude/file-setup-root-repo-xtsfp7`. | Diputuskan |
| 3 | Label role di UI | Key role `lecturer` diganti `instructor` di kode; label UI "Lecturer" menjadi "Instructor". UI tetap berbahasa Inggris, jadi "Dosen"/"Mahasiswa" tidak muncul di UI. | Diputuskan (PR 3) |
| 4 | Jumlah akun seed | Seed hanya 1 admin, 2 instructor, 3 student (sesuai prompt), bukan 1/11/24 seperti mock. Course mock dibagi ke 2 instructor demo. Email demo student disederhanakan (`nadia@`, `marcus@`). | Diputuskan (PR 3) |
| 5 | NIM/NIDN & departemen | Disimpan sebagai `users.id_number` dan `users.department` (nullable) karena registrasi publik tidak punya NIM/NIDN. Admin tetap wajib mengisi keduanya saat membuat akun. | Diputuskan (PR 3) |
| 6 | Aktivitas sistem | Tidak ada tabel `activities` di skema; feed aktivitas diturunkan dari `course_status_logs`, `enrollments`, dan `quiz_attempts`. | Direncanakan PR 7 |
| 7 | Notifikasi & status sistem | Di mock statis; di backend dihitung dari data (mis. course pending) tanpa tabel baru. | Direncanakan PR 7 |
| 8 | Thumbnail course | Prototipe hanya preview lokal; kolom `thumbnail_url` ada di skema tetapi upload file tidak dibangun. API menerima `thumbnailUrl` (URL http/https); form course masih hanya preview lokal. | Terbuka |
| 9 | Hapus course | Prompt: hanya Draft tanpa enrollment yang boleh dihapus permanen. Prototipe membolehkan dosen menghapus Pending/Rejected dan admin menghapus apa pun. Aturan prompt dipakai (409 `COURSE_NOT_DELETABLE`). | Diputuskan (PR 4) |
| 10 | Reset demo data | Tombol *Reset demo data* hanya berlaku untuk mock; disembunyikan (`data-mock-only`) saat `transport = "http"`. Reset data backend: `python -m app.seed --reset`. | Diputuskan (PR 3) |
| 11 | Hapus user | Prototipe menghapus enrollment student ikut terhapus; prompt melarang hapus permanen bila ada course/enrollment → 409 `USER_HAS_COURSES` / `USER_HAS_ENROLLMENTS`, sarankan nonaktifkan. | Diputuskan (PR 3) |
| 12 | Halaman belum dimigrasi | Antara PR 3 dan PR 7, halaman yang belum dimigrasi masih memanggil kode mock dan bisa kosong/error dengan akun backend. | Sementara |
| 13 | Alasan reject | Mock: alasan opsional. Prompt: reject wajib note → API 400 bila `reason` kosong; UI admin meminta alasan di modal. | Diputuskan (PR 4) |
| 14 | Log status saat course dibuat | Pembuatan course juga dicatat di `course_status_logs` (`NULL → draft`) agar riwayat lengkap. | Diputuskan (PR 4) |
| 15 | Edit course Pending | Status hanya berubah lewat `/transitions`; course Pending tetap Pending saat diedit (tombol *Save draft* disembunyikan). | Diputuskan (PR 4) |
