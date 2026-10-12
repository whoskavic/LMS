# Pertanyaan Terbuka & Asumsi

Daftar ambiguitas kecil yang diputuskan dengan asumsi paling sederhana. Sinkron dengan bagian "Roadmap dan Known Issues" di README.

| # | Topik | Asumsi yang diambil | Status |
|---|---|---|---|
| 1 | Nama branch utama | Repo memakai `master` (bukan `main` seperti di `prompt.md`). Semua PR menuju `master`. | Diputuskan |
| 2 | `gh` CLI | Token `gh` di lingkungan kerja tidak valid; PR dibuat, dipantau, dan di-merge lewat GitHub API (MCP) dengan alur yang sama. PR 1 memakai branch kerja sesi `claude/file-setup-root-repo-xtsfp7`. | Diputuskan |
| 3 | Label role di UI | Key role `lecturer` diganti `instructor` di kode; label UI "Lecturer" menjadi "Instructor". UI tetap berbahasa Inggris, jadi "Dosen"/"Mahasiswa" tidak muncul di UI. | Diputuskan (PR 3) |
| 4 | Jumlah akun seed | Seed hanya 1 admin, 2 instructor, 3 student (sesuai prompt), bukan 1/11/24 seperti mock. Course mock dibagi ke 2 instructor demo. Email demo student disederhanakan (`nadia@`, `marcus@`). | Diputuskan (PR 3) |
| 5 | NIM/NIDN & departemen | Disimpan sebagai `users.id_number` dan `users.department` (nullable) karena registrasi publik tidak punya NIM/NIDN. Admin tetap wajib mengisi keduanya saat membuat akun. | Diputuskan (PR 3) |
| 6 | Aktivitas sistem | Tidak ada tabel `activities` di skema; feed aktivitas diturunkan dari `course_status_logs`, `enrollments`, dan `quiz_attempts` (aksi seperti edit user/modul tidak tercatat). | Diputuskan (PR 7) |
| 7 | Notifikasi & status sistem | Di mock statis; di backend dihitung dari data (admin: course pending; instructor: course pending/rejected; student: nilai akhir terbit) tanpa tabel baru. Status sistem = cek koneksi database. Grafik enrollment = 6 bulan terakhir dari `enrolled_at`/`completed_at`. | Diputuskan (PR 7) |
| 8 | Thumbnail course | Prototipe hanya preview lokal; kolom `thumbnail_url` ada di skema tetapi upload file tidak dibangun. API menerima `thumbnailUrl` (URL http/https); form course masih hanya preview lokal. | Terbuka |
| 9 | Hapus course | Prompt: hanya Draft tanpa enrollment yang boleh dihapus permanen. Prototipe membolehkan dosen menghapus Pending/Rejected dan admin menghapus apa pun. Aturan prompt dipakai (409 `COURSE_NOT_DELETABLE`). | Diputuskan (PR 4) |
| 10 | Reset demo data | Tombol *Reset demo data* hanya berlaku untuk mock; disembunyikan (`data-mock-only`) saat `transport = "http"`. Reset data backend: `python -m app.seed --reset`. | Diputuskan (PR 3) |
| 11 | Hapus user | Prototipe menghapus enrollment student ikut terhapus; prompt melarang hapus permanen bila ada course/enrollment → 409 `USER_HAS_COURSES` / `USER_HAS_ENROLLMENTS`, sarankan nonaktifkan. | Diputuskan (PR 3) |
| 12 | Halaman belum dimigrasi | Antara PR 3 dan PR 7, halaman yang belum dimigrasi masih memanggil kode mock dan bisa kosong/error dengan akun backend. | Selesai (PR 7) |
| 13 | Alasan reject | Mock: alasan opsional. Prompt: reject wajib note → API 400 bila `reason` kosong; UI admin meminta alasan di modal. | Diputuskan (PR 4) |
| 14 | Log status saat course dibuat | Pembuatan course juga dicatat di `course_status_logs` (`NULL → draft`) agar riwayat lengkap. | Diputuskan (PR 4) |
| 15 | Edit course Pending | Status hanya berubah lewat `/transitions`; course Pending tetap Pending saat diedit (tombol *Save draft* disembunyikan). | Diputuskan (PR 4) |
| 16 | Progress setelah modul ditambah | Progress dihitung ulang saat modul ditambah/dihapus; status `completed` tetap (tidak kembali ke `active`) agar sertifikat yang sudah terbit tetap sah. | Diputuskan (PR 5) |
| 17 | Video materi | `modules.video_url` berupa URL; URL YouTube di-embed, URL lain ditampilkan sebagai tautan. Modul Lecture tanpa URL tetap memakai simulasi video 3 detik seperti prototipe. | Diputuskan (PR 5) |
| 18 | Kapasitas & pendaftaran | Aturan prototipe dipertahankan: `enrollment_open` dan `max_students` tetap berlaku untuk course gratis. | Diputuskan (PR 5) |
| 19 | Sertifikat | Diterbitkan otomatis saat progress 100% bila course menerbitkan sertifikat; nomor acak `LRN-<KODE>-<12 karakter>`. Endpoint verifikasi publik ditambahkan di PR 7. | Diputuskan (PR 5) |
| 20 | Attempt kedaluwarsa | Attempt yang lewat `expires_at + 30 detik` ditandai `expired`, tidak dinilai (skor kosong), dan tetap dihitung sebagai attempt (keputusan produk #3: attempt dihitung saat Start). | Diputuskan (PR 6) |
| 21 | Edit quiz yang sudah dikerjakan | Soal diperbarui di tempat (ID soal/opsi tetap) sehingga riwayat jawaban tetap terhubung; menghapus soal ikut menghapus jawaban soal tersebut. Skor attempt lama tidak dihitung ulang. | Diputuskan (PR 6) |
| 22 | Bobot soal | Kolom `questions.points` (default 1) dipakai sebagai bobot skor; editor UI belum menampilkan bobot (semua 1 seperti prototipe). | Diputuskan (PR 6) |
| 23 | Mode mock `local` | Setelah semua halaman dimigrasi, `data.js`, `store.js`, dan `transport-local.js` tidak lagi dimuat halaman. File tetap disimpan sebagai spesifikasi kontrak yang diuji `node --test`. | Diputuskan (PR 7) |
| 24 | Keluarkan student bersertifikat | `certificates.enrollment_id` RESTRICT → enrollment yang sudah bersertifikat tidak bisa dihapus (409 `ENROLLMENT_CERTIFIED`). | Diputuskan (PR 7) |
| 25 | Tautan verifikasi di sertifikat | PNG sertifikat menuliskan nomor + URL `verify.html` dari origin frontend saat diunduh. | Diputuskan (PR 7) |
| 26 | Nomor ADR rencana Udemy | Rencana menyebut "ADR-005 (model akun)" dan "ADR-006 (konsep akademik)"; nomor itu sudah dipakai, sehingga dicatat sebagai ADR-008 dan ADR-009. | Diputuskan |
| 27 | Bahasa UI | Rencana memakai istilah Indonesia ("Belajar", "Mengajar", "Lanjutkan belajar", "Enroll gratis"). UI tetap berbahasa Inggris seperti sekarang ("Learn", "Teach", "Continue learning", "Enroll for free"); istilah Indonesia hanya di dokumen. | Diputuskan |
| 28 | Nomor sertifikat | Kode course tidak lagi diisi untuk course baru; prefix sertifikat memakai kode lama bila ada, selain itu `COURSE`. | Diputuskan |
| 29 | Kolom akademik lama | Tidak di-drop di fase ini (ADR-009); API tidak lagi mengirim/menerima kolom tersebut. Data lama tetap di database. | Diputuskan |
| 30 | Instructor yang belajar | Course milik sendiri tidak bisa di-enroll (409 `OWN_COURSE`) dan tidak bisa diulas. | Diputuskan |
| 31 | Nilai akhir di laporan | Laporan admin & CSV tidak lagi memuat grade/nilai akhir; status belajar (Completed / On track / At risk) tetap memakai rumus prototipe tanpa nilai akhir. | Diputuskan |
| 32 | My Learning di PR C | Halaman `student-dashboard.html` penuh semester & IPK, sehingga langsung ditulis ulang menjadi My Learning di PR C (tab In progress / Completed / Certificates). PR D melengkapi katalog & landing page. | Diputuskan |
| 33 | Status belajar di laporan | "At risk" tetap memakai rumus prototipe (progress < 40 atau rata-rata quiz < 65) karena tidak bergantung nilai akhir. | Diputuskan |
| 34 | Test kontrak MockServer | Route nilai & batch enroll di MockServer lama tetap diuji sebagai arsip, dipanggil langsung lewat `Api.get/put/post/del` karena service UI-nya dihapus. | Diputuskan |
| 35 | Halaman utama publik | `index.html` tetap halaman login (wajib tugas kuliah); katalog menjadi halaman utama publik lewat tautan di login/register dan menu learner "Browse courses". Kunjungan `/` tetap ke login. | Diputuskan |
| 36 | Redirect setelah login | `?next=` hanya menerima halaman internal (`catalog.html…` atau `pages/*.html`) untuk mencegah open redirect. | Diputuskan |
