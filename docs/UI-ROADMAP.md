# 🧭 UI Roadmap — Learnova LMS (Fase Frontend)

> Status: **Disetujui dengan revisi** (review 10 Oktober 2026 — lihat riwayat revisi di §5 dan keputusan di §8) · Tanggal audit: 10 Oktober 2026 · Basis: commit `2d6c72c` (branch `master`)
>
> Dokumen ini adalah hasil audit seluruh kode frontend terhadap [PERANCANGAN.md](PERANCANGAN.md) dan [FITUR.md](FITUR.md),
> beserta rencana pemolesan sebelum integrasi backend (rencana: FastAPI + PostgreSQL).
> Belum ada kode yang diubah.

**Metode audit**

- Membaca seluruh file: `index.html`, 12 file di `pages/`, `assets/css/style.css`, semua script di `assets/js/` (kecuali vendor Chart.js).
- Verifikasi responsif: render headless Chrome dengan viewport **375px** pada 10 halaman (login sebagai admin/dosen/mahasiswa), termasuk layar pengerjaan quiz dan dark mode, plus pengukuran overflow horizontal via `scrollWidth`.
- Rasio kontras dihitung dari nilai token di `:root` (rumus WCAG relative luminance). Angka bertanda **≈** adalah estimasi dan perlu dicek ulang dengan DevTools saat implementasi.
- Nomor baris mengacu ke commit di atas.

---

## 1. Ringkasan Kondisi Saat Ini

1. **Fitur di FITUR.md hampir semuanya sudah ada dan berfungsi.** Celah terbesar bukan fitur yang hilang, tapi kualitas: state UI, quiz yang bisa diakali, aksesibilitas, dan kesiapan backend.
2. **Belum ada service layer.** Halaman memanggil `DB.*` (≈64 kali di 16 file) dan `Store.*` secara sinkron, membaca `SEED` langsung, bahkan memutasi objek cache lalu memanggil `DB.save()`. Pindah ke `fetch` berarti menulis ulang hampir setiap halaman.
3. **Tidak ada loading state dan error state sama sekali.** Semua operasi sinkron, dan kegagalan tulis `localStorage` ditelan diam-diam sehingga toast "saved" tetap muncul walau data tidak tersimpan.
4. **Route guard bisa dibobol dan tidak menghentikan halaman.** Role dibaca dari `learnova.session` di localStorage (bisa diedit manual), script halaman tetap jalan setelah redirect, dan belum ada halaman 404/403.
5. **Batas percobaan quiz bisa dilewati dengan refresh.** Attempt hanya ada di memori sampai submit, jadi refresh = soal sudah terlihat, timer reset, kuota tidak berkurang.
6. **Design system sudah rapi berbasis token** (warna, spacing, radius, dark mode), tapi masih ada `#fff` hardcoded di 10 tempat, beberapa komponen diimplementasi 2–3 kali dengan gaya berbeda, dan 3 cara berbeda untuk menampilkan error form.
7. **Aksesibilitas dasar baik** (skip link, label, `aria-sort`, focus-visible), tapi modal tanpa focus trap, sidebar off-canvas tetap bisa di-Tab saat tersembunyi, timer quiz ada di dalam `aria-live`, dan beberapa token teks gagal kontras AA.
8. **Responsif cukup sehat:** tidak ada overflow horizontal level halaman di 375px. Masalah ada di quiz (timer terdorong ke bawah soal) dan tab yang terpotong tanpa petunjuk scroll.
9. **Tabel konsisten di Courses & Users** (search, filter, sort, pagination, CSV), tapi Students & Grades tanpa search/pagination dan Reports tanpa search.
10. **Kode mudah dibaca, tapi semua state di global scope** (≈20 global), file halaman berupa satu handler `DOMContentLoaded` panjang (quiz.js ±320 baris), sidebar/topbar diduplikasi di 12 file HTML, dan ada bug timestamp UTC↔lokal (aktivitas tampil 7 jam lebih awal di WIB).

---

## 2. Peta Halaman per Role

Semua halaman memuat `theme.js` di `<head>` serta `data.js → store.js → main.js` di akhir `<body>`. Guard role memakai atribut `<body data-role="...">`.

| Halaman | HTML | Script halaman | Role (`data-role`) | Menu sidebar |
|---|---|---|---|---|
| Login | `index.html` | `pages/login.js` | publik | – |
| Template master | `pages/layout.html` | – | semua | – (referensi Milestone 2) |
| Dashboard Admin | `pages/dashboard.html` | `pages/dashboard.js` | admin | Dashboard |
| Users | `pages/users.html` | `pages/users.js` | admin | Users |
| Courses / My Courses | `pages/data-master.html` | `pages/data-master.js` | admin, lecturer | Courses (admin) · My Courses (dosen) |
| Detail Course | `pages/course-detail.html` | `pages/course-detail.js`, `course-modules.js`, `course-quizzes.js`, `course-grades.js` | admin, lecturer | (menyorot Courses) |
| Reports | `pages/laporan.html` | `pages/laporan.js` | admin | Reports |
| Dashboard Dosen | `pages/lecturer-dashboard.html` | `pages/lecturer-dashboard.js` | lecturer | Dashboard |
| New / Edit Course | `pages/form.html` | `pages/form.js` | lecturer | New Course |
| Dashboard Mahasiswa | `pages/student-dashboard.html` | `pages/student-dashboard.js`, `certificate.js` | student | Dashboard |
| Course (belajar) | `pages/course.html` | `pages/course.js`, `certificate.js` | student | (menyorot Dashboard) |
| Quiz | `pages/quiz.html` | `pages/quiz.js` | student | (menyorot Dashboard) |
| Profile | `pages/profile.html` | `pages/profile.js` | semua | Profile |

Script bersama:

| File | Isi |
|---|---|
| `assets/js/theme.js` | Tema light/dark/system (`learnova.theme`) |
| `assets/js/data.js` | `SEED` — mock data mentah |
| `assets/js/store.js` | `Storage` (wrapper localStorage), `buildDatabase`, `DB` (CRUD generik), `Store` (logika domain), `homeFor` |
| `assets/js/main.js` | `ICONS`, `Utils`, `Charts`, `UI` (toast, modal, sortable, pagination, field), auth guard, layout (sidebar, menu, notifikasi, logout, search) |
| `assets/js/certificate.js` | `Certificate` — gambar sertifikat ke canvas → PNG |

---

## 3. Temuan Audit per Area

### a. Data layer

**Akses `localStorage` langsung** hanya ada di dua tempat — ini sudah bagus:

| Lokasi | Keterangan |
|---|---|
| `store.js:15-36` (`Storage`) | Satu-satunya pembaca/penulis `learnova.db`, `learnova.session`, `learnova.flash` |
| `theme.js:9-31` | `learnova.theme` (preferensi per-device — boleh tetap di localStorage) |

**Masalahnya ada satu lapis di atasnya:** halaman memperlakukan `DB`/`Store` sebagai API sinkron dan sering melewati keduanya.

| Temuan | Lokasi |
|---|---|
| Panggilan `DB.*` langsung dari halaman (≈64) | `users.js` (12), `course-modules.js` (7), `course-grades.js` (6), `dashboard.js` (6), `data-master.js` (5), `course-quizzes.js` (5), `form.js` (4), `laporan.js` (4), `profile.js` (4), `quiz.js` (2), `lecturer-dashboard.js` (2), `course-detail.js` (2), `certificate.js` (2), `course.js` (1), `student-dashboard.js` (1), `main.js:398` |
| Membaca `SEED` langsung dari halaman | `dashboard.js:5` (grafik), `dashboard.js:84` (status sistem), `data-master.js:47` & `form.js:22` (kategori), `main.js:495` (notifikasi) |
| Mutasi objek cache lalu `DB.save()` — tidak punya padanan endpoint | `course-modules.js:9,100-102` (`m.order = …`), `course-quizzes.js:198` (`e.attempts = …`), `course.js:235` (`enrollment.completedModules = …`), `store.js:461` (`attempts.push`) |
| Operasi multi-langkah (cascade) dikerjakan di halaman, bukan di satu operasi atomik | Hapus course → hapus modul/quiz/enrollment satu per satu (`data-master.js:188-191`); hapus user → enrollment (`users.js:257-258`); hapus quiz → attempts (`course-quizzes.js:198-199`). Tiap `DB.remove` menulis ulang seluruh DB |
| Validasi keunikan dilakukan di klien terhadap seluruh data | Email/NIM (`users.js:133-134`), kode course (`form.js:86`) — di backend harus jadi error 409 dari server |
| `DB.insert` membuat ID `max+1` di klien | `store.js:211` |
| Kegagalan tulis ditelan → UI tetap menampilkan "saved" | `store.js:24-30` |
| Cache `DB.data` per tab, tanpa sinkronisasi — dua tab saling menimpa seluruh DB (*last write wins*) | `store.js:180-195` (tidak ada listener event `storage`) |
| Kunci jawaban quiz ikut terkirim ke halaman mahasiswa dan skor dihitung di klien | `quiz.js:5`, `store.js:451-464` |
| Logika domain murni (grade, IPK, progress, sertifikat) bercampur dengan akses data dalam satu objek `Store` | `store.js:255-500`; `Store` juga bergantung pada `Utils` dari `main.js` yang dimuat *setelahnya* (`store.js:336`) |
| Progress disimpan sebagai **jumlah** modul selesai, bukan modul mana — reorder/sisip/hapus modul oleh dosen menggeser progress mahasiswa | `store.js:404-413`, `course.js:20-22`, `course-modules.js:96-103` |
| Agregat dihitung N+1 di klien (mis. `courseStats` per baris) | `data-master.js:38-42`, `laporan.js:16-32` — endpoint list perlu mengembalikan agregat |

**Usulan: service layer async `Api` dengan *transport* yang bisa ditukar**

Prinsip: halaman hanya boleh memanggil `Api.*` (selalu `Promise`). `Api` memanggil `Api.request(method, path, { query, body })`. Ada dua *transport*:

- `local` (sekarang): `MockServer` di browser yang merutekan `"GET /courses"` dll. ke logika `DB`/`Store` yang sudah ada, termasuk cek auth/role dan bentuk error yang sama dengan backend nanti.
- `http` (nanti): `fetch(baseUrl + path)` dengan header `Authorization`.

Karena service ditulis berbasis path REST, kontrak API terdokumentasi sendiri dan pindah ke FastAPI cukup mengganti satu konfigurasi.

**Prinsip MockServer** *(disepakati saat review)*: aturan bisnis dan otorisasi diimplementasikan di MockServer sebagai **spesifikasi yang bisa dijalankan** untuk backend FastAPI. Tidak ada mekanisme anti-tamper di sisi klien (enkripsi localStorage, checksum, dsb.) — keamanan sesungguhnya ada di backend.

**Konvensi data** *(disepakati saat review)*:

- **ID entity adalah string opaque.** MockServer membuat ID baru dengan `crypto.randomUUID()`; ID data seed dikonversi menjadi string (bump `SEED.version`). Halaman tidak boleh melakukan `Number()`/`parseInt` pada ID.
- **Waktu:** datetime = ISO 8601 UTC lengkap dengan `Z` (`2026-09-25T07:32:00.000Z`); tanggal kalender (`startDate`) = `"YYYY-MM-DD"`. Konversi ke waktu lokal hanya di layer tampilan (`Domain.formatDate` / `Domain.formatDateTime`).
- **Mode simulasi** di transport local: `?mock=slow` (latensi) dan `?mock=fail` (request gagal) untuk mendemokan loading & error state.

```
assets/js/
├── domain.js                 ← fungsi murni: gradeFromScore, gradePoint, gpa, progress, certificateNumber, formatDate
├── api/
│   ├── client.js             ← Api.config, Api.request, ApiError, Api.get/post/patch/delete
│   ├── transport-local.js    ← MockServer: router (method + path) → DB/Store, simulasi latency/error opsional
│   ├── transport-http.js     ← fetch, token, normalisasi error (disiapkan, belum dipakai)
│   └── services.js           ← Api.auth, Api.users, Api.courses, Api.modules, Api.quizzes,
│                                Api.attempts, Api.enrollments, Api.grades, Api.reports, Api.dashboard, Api.meta
├── data.js / store.js        ← hanya dipakai transport-local (tidak lagi dipanggil halaman)
```

Tetap **classic script** dengan namespace global `Api` (bukan ES module), karena FITUR.md §2 menjanjikan aplikasi bisa dibuka langsung lewat `file://`, sedangkan ES module diblokir di `file://`.

Kontrak:

```js
// Sukses list   → { items: [...], total, page, pageSize }
// Sukses detail → objek entity
// Gagal         → throw ApiError { status, code, message, fields? }
//   400 VALIDATION { fields: { email: "This email is already registered." } }
//   401 UNAUTHENTICATED · 403 FORBIDDEN · 404 NOT_FOUND · 409 CONFLICT · 500 STORAGE_ERROR

// Contoh pemakaian di halaman
try {
  const { items, total } = await Api.courses.list({ scope: "mine", q, status, page, pageSize: 7, sort: "title" });
} catch (err) {
  UI.error(container, err, retry);
}
```

Peta service → endpoint (draf kontrak untuk FastAPI):

| Service | Endpoint | Menggantikan |
|---|---|---|
| `Api.auth.login(email, password)` | `POST /auth/login` | `Store.login` |
| `Api.auth.me()` | `GET /auth/me` | `Store.currentUser`, `main.js:393-411` |
| `Api.auth.logout()` | `POST /auth/logout` | `Store.logout` |
| `Api.auth.changePassword(current, next)` | `POST /auth/password` | `profile.js:50-72` |
| `Api.profile.update(patch)` | `PATCH /me` | `profile.js:43` |
| `Api.users.list(query)` / `create` / `update` / `setStatus` / `remove` | `GET/POST /users`, `PATCH/DELETE /users/{id}` | `users.js` |
| `Api.courses.list(query)` (dengan `students`, `avgProgress`) | `GET /courses` | `data-master.js:38-64` |
| `Api.courses.get(id)` / `stats(id)` | `GET /courses/{id}`, `GET /courses/{id}/stats` | `course-detail.js:25,123` |
| `Api.courses.create` / `update` | `POST /courses`, `PATCH /courses/{id}` | `form.js:241-246` |
| `Api.courses.transition(id, action, reason?)` — `action`: `submit` \| `approve` \| `reject` \| `archive` \| `restore`; izin per action divalidasi MockServer sesuai PERANCANGAN §2 | `POST /courses/{id}/transitions` body `{ action, reason? }` | `dashboard.js:60`, `data-master.js:207`, `course-detail.js:90` |
| `Api.courses.remove(id)` (cascade di server) | `DELETE /courses/{id}` | `data-master.js:188-191` |
| `Api.modules.list/create/update/remove` | `/courses/{id}/modules`, `/modules/{id}` | `course-modules.js` |
| `Api.modules.reorder(courseId, ids)` | `PUT /courses/{id}/modules/order` | `course-modules.js:96-103` |
| `Api.quizzes.list/create/update/remove` | `/courses/{id}/quizzes`, `/quizzes/{id}` | `course-quizzes.js` |
| `Api.attempts.start(quizId)` → soal **tanpa** kunci jawaban + `deadline` | `POST /quizzes/{id}/attempts` | `quiz.js:101-108` |
| `Api.attempts.saveAnswers(attemptId, answers)` | `PATCH /attempts/{id}` | (baru — untuk resume) |
| `Api.attempts.submit(attemptId)` → skor + review | `POST /attempts/{id}/submit` | `Store.submitAttempt` |
| `Api.enrollments.mine()` / `open()` / `enroll(courseId)` | `GET /me/enrollments`, `GET /courses?open=true`, `POST /courses/{id}/enrollments` | `student-dashboard.js` |
| `Api.enrollments.addStudents(courseId, ids)` / `remove(id)` | `POST /courses/{id}/enrollments/batch`, `DELETE /enrollments/{id}` | `course-grades.js:82-171` |
| `Api.enrollments.completeModule(enrollmentId, moduleId)` | `POST /enrollments/{id}/completed-modules` | `course.js:232-235` |
| `Api.grades.list(courseId)` / `save(courseId, rows)` | `GET/PUT /courses/{id}/grades` | `course-grades.js` |
| `Api.reports.summary()` / `rows(query)` | `GET /reports/summary`, `GET /reports/enrollments` | `laporan.js` |
| `Api.dashboard.admin()` / `lecturer()` / `student()` | `GET /dashboard/{role}` | `dashboard.js`, `lecturer-dashboard.js`, `student-dashboard.js` |
| `Api.activities.recent(limit)` | `GET /activities` | `Store.recentActivities` |
| `Api.meta.categories()` / `notifications()` / `systemStatus()` | `GET /meta/...` | `SEED.*` di halaman |

### b. UI state (empty / loading / error)

Saat ini **tidak ada loading state maupun error state di halaman mana pun**, karena semua data sinkron. Satu-satunya fallback error adalah `Charts.create` bila Chart.js gagal dimuat (`main.js:169-172`). Empty state sudah ada di banyak list, tapi markup-nya berbeda-beda (`li.empty`, `td.table__empty`, `div.card.empty`, `p.empty`).

| View | Empty | Loading | Error | Catatan |
|---|---|---|---|---|
| Login | – | ✗ | ✓ alert | Tombol tidak busy saat proses |
| Dashboard Admin — kartu statistik | – | ✗ | ✗ | |
| Dashboard Admin — pending approvals | ✓ `dashboard.js:43` | ✗ | ✗ | |
| Dashboard Admin — aktivitas | ✗ `dashboard.js:96` | ✗ | ✗ | List kosong tanpa pesan |
| Dashboard Admin — grafik | ✗ | ✗ | ✓ lib saja | Data grafik statis dari SEED |
| Users — tabel | ✓ `users.js:92` | ✗ | ✗ | Tidak membedakan "belum ada user" vs "tidak cocok filter" |
| Courses — tabel | ⚠ `data-master.js:115` | ✗ | ✗ | Dosen tanpa course melihat "No courses match your search or filters" tanpa CTA "Create course" |
| Detail Course — overview grafik | ✗ `course-detail.js:153` | ✗ | ✗ | 0 mahasiswa → grafik batang kosong |
| Detail Course — modules / quizzes / grades | ✓ | ✗ | ✗ | |
| Detail Course — course tidak ditemukan | ⚠ | – | – | Redirect + flash (`course-detail.js:28-31`), bukan state di halaman |
| Reports — tabel | ✓ `laporan.js:134` | ✗ | ✗ | |
| Reports — grafik & ringkasan | ✗ `laporan.js:50,72` | ✗ | ✗ | Tanpa data → grafik kosong, angka "0%" |
| Reports — aktivitas | ✗ `laporan.js:158` | ✗ | ✗ | |
| Dashboard Dosen — course list / attempts | ✓ | ✗ | ✗ | |
| Dashboard Dosen — grafik | ✗ `lecturer-dashboard.js:26` | ✗ | ✗ | Dosen tanpa course Active → grafik kosong |
| Form course — simpan | – | ✗ | ✗ | Selalu redirect sukses |
| Dashboard Mahasiswa | ✓ `student-dashboard.js:113-116` | ✗ | ✗ | Tanpa course: label "Student portal · " kosong & dropdown semester kosong (`:88`) |
| Course — daftar modul | ⚠ `course.js:94` | ✗ | ✗ | Course tanpa modul menampilkan "No modules found." (kesannya hasil pencarian) |
| Course — quiz list | ✓ | ✗ | ✗ | |
| Quiz — riwayat attempt | ✓ | ✗ | ✗ | Submit tanpa state "submitting…" |
| Profile — simpan | – | ✗ | ✗ | |
| Notifikasi dropdown | ✗ `main.js:495` | ✗ | ✗ | |
| Semua aksi tulis (approve, delete, save) | – | ✗ | ✗ | Toast sukses muncul walau tulis gagal (`store.js:24-30`) |

### c. Route guard

| # | Temuan | Lokasi |
|---|---|---|
| 1 | **Role diambil dari session di localStorage, bukan dari data user.** Mengubah `learnova.session` → `"role":"admin"` di DevTools membuka semua halaman admin (yang dicek hanya user masih ada & aktif). | `main.js:394-411` |
| 2 | **Redirect tidak menghentikan halaman.** `location.replace` dipanggil, tetapi handler `DOMContentLoaded` halaman tetap jalan: tanpa session → `Store.currentUser()` = `null` → `TypeError` (mis. `data-master.js:7 me.role`, `quiz.js:7 me.id`, `course-detail.js:26`, `profile.js:28`); dengan role salah → data role lain sempat dirender ke DOM (mis. mahasiswa membuka `users.html` → seluruh tabel user dirender sebelum redirect). | `main.js:405-411` + semua `pages/*.js` |
| 3 | **Konten terlindungi sempat tampil** (sidebar dan kerangka halaman) karena guard berjalan di script akhir `<body>`. | semua `pages/*.html` |
| 4 | **Tidak ada 404.** URL salah → 404 bawaan server/browser. | – |
| 5 | **Tidak ada 403.** Role salah dialihkan diam-diam ke dashboard tanpa penjelasan. | `main.js:408-409` |
| 6 | ID tidak valid / bukan milik user → flash + redirect (konteks hilang, tombol Back kembali ke URL yang sama). | `course-detail.js:28-31`, `course.js:9-13`, `quiz.js:9-13`, `form.js:12-16` |
| 7 | Mahasiswa tetap bisa membuka course & quiz untuk course **Archived** (tidak ada cek status). Perlu keputusan (lihat §8). | `course.js:6-13`, `quiz.js:5-13` |
| ✓ | Halaman login mengalihkan user yang sudah login; dosen tidak bisa membuka course/form milik dosen lain; akun yang dinonaktifkan langsung kehilangan session. | `login.js:5-9`, `course-detail.js:26`, `form.js:10`, `main.js:397-403` |

### d. Quiz flow

| # | Temuan | Dampak | Lokasi |
|---|---|---|---|
| 1 | **Attempt hanya disimpan saat submit.** Klik *Start* → lihat semua soal → refresh/tutup tab → kuota tidak berkurang, timer kembali penuh. `beforeunload` hanya memberi peringatan. | Batas percobaan & timer bisa dilewati tanpa batas | `quiz.js:101-108`, `quiz.js:313-318` |
| 2 | **Tidak bisa melanjutkan setelah refresh** (jawaban hilang). | Mahasiswa yang tidak sengaja refresh kehilangan jawaban | `quiz.js:27-31` |
| 3 | **`submitAttempt` tidak memvalidasi apa pun** (sisa percobaan, deadline). Dua tab yang membuka quiz yang sama bisa submit dua kali melebihi `maxAttempts`. | Batas percobaan jebol | `store.js:451-464` |
| 4 | **Review memakai soal versi terbaru**, bukan soal saat attempt. Bila dosen mengubah kunci/jumlah soal, "x of y correct" bertentangan dengan skor tersimpan dan soal baru tampil sebagai "You did not answer". | Data hasil tidak konsisten | `quiz.js:207-234` |
| 5 | **Dosen boleh menurunkan `maxAttempts` di bawah jumlah attempt yang sudah dipakai** → intro menampilkan "-1 of 1", hasil "Attempt 3 of 1". | Tampilan salah | `course-quizzes.js:122`, `quiz.js:34,54,243` |
| 6 | **Waktu habis saat modal "Submit quiz?" terbuka** → hasil dirender di belakang modal yang masih terbuka. | UI membingungkan | `quiz.js:117-120,186-194` |
| 7 | **Timer berada di dalam region `aria-live="polite"`** → screen reader bisa mengumumkan perubahan tiap detik; selain itu seluruh soal di-render ulang dan diumumkan setiap navigasi. | Aksesibilitas | `quiz.html:99`, `quiz.js:162` |
| 8 | **Fokus hilang setelah Next/Previous/nomor soal** (seluruh `#quiz-root` diganti), pengguna keyboard kembali ke awal dokumen. | Aksesibilitas | `quiz.js:127-181` |
| 9 | **Di ≤1024px timer & navigasi soal pindah ke bawah soal** (grid 2-1 menjadi 1 kolom). Terverifikasi di 375px: timer berada di bawah tombol Next, tidak terlihat saat membaca soal panjang. | Mahasiswa tidak sadar waktu hampir habis | `style.css:2546-2550`, `quiz.js:159-178` |
| 10 | Toast waktu habis memakai tipe `error`. | Minor | `quiz.js:118` |
| 11 | Badge lulus/tidak di dashboard dosen memakai angka **70** hardcoded, bukan `quiz.passingScore`. | Data salah bila passing score ≠ 70 | `lecturer-dashboard.js:74` |
| 12 | Kunci jawaban ikut dimuat di klien. Wajar untuk mock, tapi service layer harus meniru backend: `attempts.start` tidak mengembalikan `answer`. | Kesiapan backend | `quiz.js:5`, `store.js:454` |
| ✓ | Sudah baik: konfirmasi submit dengan jumlah soal kosong, indikator terjawab di navigasi nomor (dengan `aria-label` ", answered"), pintasan 1–4 & ←/→, timer berbasis `deadline` (tahan throttling tab), guard `inProgress` mencegah double submit. | | `quiz.js:184-205,264-311` |

### e. Form: validasi, feedback, konfirmasi

| # | Temuan | Lokasi |
|---|---|---|
| 1 | **Tiga implementasi render error yang berbeda**: `validate`/`setError` di login, `setError` di form course, `UI.fieldError` di modal & profile. | `login.js:29-37`, `form.js:100-111`, `main.js:358-365` |
| 2 | **Toast saat validasi gagal tidak konsisten**: ada di form course & editor quiz, tidak ada di modal user, modal modul, profil, password. | ada: `form.js:218`, `course-quizzes.js:158` · tidak: `users.js:164-168`, `course-modules.js:69-73`, `profile.js:41,66` |
| 3 | **Aturan nama tidak sama**: Profile hanya menerima huruf ASCII, modal Users tidak membatasi karakter. User dengan nama beraksen yang dibuat admin tidak bisa menyimpan profilnya tanpa mengganti nama. | `profile.js:36` vs `users.js:137` |
| 4 | Field dari `UI.field` (semua modal) tidak punya `aria-describedby` ke hint/error — berbeda dengan klaim FITUR.md §7. | `main.js:368-387` |
| 5 | **Menutup modal form yang sudah diisi** (Esc, klik backdrop, Cancel) membuang input tanpa konfirmasi — paling berisiko di editor quiz dengan banyak soal. | `main.js:254-264`, `course-quizzes.js:77`, `course-modules.js:41`, `users.js:105` |
| 6 | Tidak ada state *busy* / disable tombol saat submit (wajib setelah async — mencegah double submit). | semua form |
| 7 | Course **Draft** disimpan dengan `duration`/`maxStudents` = `null` dan kode `"—"` → tabel menampilkan "0 / null", detail menampilkan "null weeks", "null students". | `form.js:228-231` → `data-master.js:94`, `course-detail.js:138-139` |
| 8 | Error simpan tidak pernah ditampilkan (lihat §b). | `store.js:24-30` |
| 9 | Validasi tanggal mulai memakai tanggal UTC: antara 00:00–07:00 WIB "hari ini" dianggap kemarin. | `form.js:56` |
| ✓ | Sudah baik: validasi inline + fokus ke field pertama yang salah, dirty state & konfirmasi batal di form course, konfirmasi semua aksi destruktif (hapus course/user/modul/quiz, keluarkan mahasiswa, ubah status, logout, reset), peringatan nilai belum disimpan. | |

### f. Konsistensi design system

**Warna/ukuran hardcoded di CSS**

| Lokasi `style.css` | Nilai | Seharusnya |
|---|---|---|
| 231, 278, 377, 586, 595, 956, 1457, 1750, 2324 | `color: #fff` | token baru `--color-on-primary` / `--color-on-dark` |
| 1108 | `background: #fff` (thumb switch) | `--color-on-primary` |
| 1455, 1466 | `rgba(17,24,39,.7)`, `rgba(255,255,255,.5)` (caption & progress video) | token `--color-scrim` |
| 1109, 1782 | shadow `rgba(...)` di luar token | `--shadow-card` / token shadow baru |
| 2236, 2377, 2094, 2100, 2704, `.brand-name` | `font-size` 1.25rem, 1.75rem, 0.6875rem, 1.375rem, 1.5rem, 1.125rem | token tipografi (`--fs-lg`, `--fs-xl`, tambah `--fs-2xs`/`--fs-2xl`) |
| 1696 & 2058 | `.modal__dialog` didefinisikan dua kali; 2071 menimpa warna `.field__label, .field__input` | gabungkan ke satu blok komponen |
| 1828 | `#f3f4f6` latar ilustrasi login di dark mode | disengaja — boleh tetap, beri komentar/token |

**Warna hardcoded di JS**: `main.js:163` (3 warna seri grafik), `lecturer-dashboard.js:45` (`color: #1f2937`). `certificate.js` boleh tetap hardcoded (output PNG, tidak ikut tema).

**Komponen yang diimplementasi berulang dengan gaya berbeda**

| Komponen | Implementasi | Perbedaan |
|---|---|---|
| Pagination | `UI.pagination` (`main.js:317`) vs manual di `data-master.js:121-130` | versi manual tanpa ellipsis — semua nomor halaman dirender |
| Badge status | `Utils.statusBadge` (`main.js:103`) vs `statusBadge` lokal (`student-dashboard.js:30`) | versi lokal UPPERCASE dan variant berbeda |
| Progress bar | `data-master.js:96`, `course-grades.js:45`, `laporan.js:115`, `student-dashboard.js:25`, `course-detail.html:116`, `course.html:98`, `lecturer-dashboard` | hanya sebagian yang punya `role="progressbar"` + `aria-valuenow` |
| Konfirmasi ubah status course | `dashboard.js:53-67`, `data-master.js:167-172`, `course-detail.js:69-82` | teks & log activity berbeda untuk aksi yang sama ("Approved course X" vs "Approved: X") |
| Daftar aktivitas | `dashboard.js:95-105`, `laporan.js:158-166` | duplikat identik |
| Tabs | `course-detail.js:99-120` (keyboard, `aria-controls`) vs `users.js:41-45,187-193` (klik saja) | perilaku berbeda |
| Render error field | 3 versi (lihat §e) | |
| Empty state | `li.empty`, `td.table__empty`, `div.card.empty`, `p.empty` | 4 markup |
| Helper `setText` | didefinisikan ulang di 7 file halaman | |
| Sidebar + topbar + footer | disalin di 12 file HTML (±65 baris masing-masing) | perubahan menu harus diedit 12× |

### g. Accessibility

| # | Temuan | Lokasi |
|---|---|---|
| 1 | **Modal tanpa focus trap**: Tab keluar ke halaman di belakang; latar tidak `inert`; `id="modal-title"` tetap → duplikat bila modal bertumpuk. | `main.js:239-286` |
| 2 | **Sidebar off-canvas (≤1024px) hanya digeser `transform`**, link tetap bisa di-Tab saat tersembunyi; membuka sidebar tidak memindahkan fokus; menutup tidak mengembalikan fokus. | `style.css:2519-2536`, `main.js:420-429` |
| 3 | **Timer quiz di dalam `aria-live`** dan fokus hilang saat pindah soal (lihat §d.7–8). Konten modul (`#lesson` `aria-live`) juga diumumkan utuh setiap ganti modul. | `quiz.html:99`, `course.html:106` |
| 4 | **Tabs Users** tanpa `aria-controls`, roving `tabindex`, dan navigasi panah; `tabpanel` tanpa `aria-labelledby`. | `users.html:97-122` |
| 5 | **Kontras token (estimasi)**: `--color-text-muted` #9ca3af di #fff ≈2.5:1 (light) dan #6b7280 di #111827 ≈3.6:1 (dark) dipakai untuk teks kecil (email user, label kartu tabel mobile, waktu notifikasi); putih di `--color-danger` #ef4444 ≈3.8:1 (`.btn--danger`); `--color-success-text` #16a34a di #dcfce7 ≈3.0:1 (badge); primary dark #6366f1 sebagai teks di #111827 ≈3.9:1 (tab aktif, link, eyebrow); putih di #6366f1 ≈4.5:1 (batas). Target AA: 4.5:1 untuk teks normal. | `style.css:23-117` |
| 6 | Progress bar tanpa `role="progressbar"`/nilai di sebagian tempat (lihat §f). | |
| 7 | Toast error memakai `role="status"` (polite) dan hilang setelah 3,2 detik tanpa tombol tutup. | `main.js:213-231` |
| 8 | Dropdown notifikasi: `aria-haspopup="true"` tanpa pola menu/disclosure yang lengkap; Esc menutup tapi fokus tidak kembali ke tombol. | `main.js:500-517` |
| 9 | Tidak ada `prefers-reduced-motion` (animasi toast/modal, `scrollTo({behavior:"smooth"})`). | `style.css`, `quiz.js:260`, `course.js:190` |
| 10 | Di 375px tab aktif di Detail Course bisa berada di luar area terlihat (mis. `#students`) karena tidak di-scroll ke view. | `course-detail.js:101-110` |
| ✓ | Sudah baik: skip link, `:focus-visible` global, label semua input statis, `aria-sort`, tab Detail Course dengan panah, fokus kembali setelah modal, `aria-label` di semua tombol ikon, `aria-current` di menu & navigasi soal. | |

### h. Responsif (375px)

Diverifikasi dengan headless Chrome, iframe 375px, pada: quiz (intro & pengerjaan), Courses, Users (dark), Reports, Dashboard admin & mahasiswa, Course, Detail Course #students, Form, Profile. **Tidak ada overflow horizontal level halaman** (`scrollWidth` ≤ viewport). Tabel `.table--stack` berubah jadi kartu dengan rapi.

| # | Temuan | Lokasi |
|---|---|---|
| 1 | **Quiz**: panel timer + navigasi soal turun ke bawah soal di ≤1024px; timer tidak terlihat saat menjawab. Perlu bar sticky (timer + "n answered") di atas soal. | `style.css:2546`, `quiz.js:159` |
| 2 | **Tabs** (Detail Course, Users) meluber dan di-scroll horizontal tanpa petunjuk; tab ke-3/4 terpotong ("Qu…", hitungan "Admins" terpotong). | `style.css:2018-2024` |
| 3 | **Students & Grades** di mobile menjadi kartu panjang (5 baris per mahasiswa) tanpa pagination/search — kapasitas course sampai 60 mahasiswa. | `course-grades.js:71-79` |
| 4 | Pagination Courses merender semua nomor halaman (akan wrap bila halaman banyak). | `data-master.js:121-130` |
| 5 | Grafik Reports: legenda doughnut di kanan (`position: "right"`) dan label sumbu X 10px tanpa auto-skip — berpotensi sesak di layar kecil (**perlu verifikasi visual**). | `laporan.js:67,89` |
| 6 | Placeholder search topbar terpotong (minor). | semua halaman |

### i. Tabel: search, filter, pagination

| Tabel | File | Search | Filter | Sort | Pagination | Export | Catatan |
|---|---|---|---|---|---|---|---|
| Courses / My Courses | `data-master.js` | ✓ (+ topbar) | ✓ kategori, status, dosen | ✓ | ✓ manual (7/halaman) | ✓ | `?q`, `?status` dibaca dari URL tapi tidak ditulis balik |
| Users | `users.js` | ✓ (+ topbar) | ✓ tab role, departemen, status | ✓ | ✓ `UI.pagination` (8) | ✓ | |
| Reports | `laporan.js` | ✗ | ⚠ course saja | ✓ | ✓ (10) | ✓ | Enter di search topbar malah pindah ke Courses (`laporan.html` tidak punya `data-search="local"`); tidak ada filter status On track/At risk/Completed |
| Students & Grades | `course-grades.js` | ✗ | ✗ | ✓ | ✗ | ✓ | Sampai 60 baris |
| Dashboard Mahasiswa (table view) | `student-dashboard.js` | ✓ (topbar) | ✓ semester, status | ✗ | – | – | Jumlah baris kecil, sort opsional |
| Pilih mahasiswa (modal) | `course-grades.js:94-131` | ✓ | – | – | scroll | – | |

Masalah lintas tabel: state filter/sort/page tidak tersimpan di URL (refresh/Back mereset), tidak ada tombol "Reset filters", ukuran halaman berbeda-beda (7/8/10) tanpa alasan, dan semua filtering di klien — service layer harus menerima `query` dan mengembalikan `{ items, total }` agar nantinya bisa jadi pagination server-side tanpa mengubah halaman.

### j. Kualitas kode

| # | Temuan | Lokasi |
|---|---|---|
| 1 | **≈20 global top-level**: `ICONS, Utils, Charts, UI, Store, DB, SEED, Storage, STORAGE_KEYS, LEGACY_KEYS, GRADE_SCALE, ROLE_LABELS, Theme, Certificate, CourseDetail, allowedRoles, session (let), homeFor, seededRandom, courseModules, seedAnswers, buildDatabase`. `session` adalah `let` global yang dimutasi. | `main.js:393-394`, `store.js`, dll. |
| 2 | **Ketergantungan urutan script tersembunyi**: `Store` memakai `Utils` dari `main.js` yang dimuat setelahnya; tab Detail Course bergantung pada `CourseDetail` yang diisi handler `DOMContentLoaded` file lain. | `store.js:336`, `course-modules.js:4`, `course-quizzes.js:4`, `course-grades.js:4` |
| 3 | **Fungsi terlalu panjang**: seluruh `quiz.js` dalam satu closure ±320 baris; `form.js` ±250; `openEditor` ±100 baris (`course-quizzes.js:77-180`); `openForm` ±80 (`users.js:105-184`); `renderLesson` ±57 (`course.js:126-183`). | |
| 4 | **Bug timestamp**: waktu disimpan dengan `toISOString().slice(...)` (UTC tanpa zona) lalu dibaca sebagai waktu lokal → aktivitas & attempt tampil **7 jam lebih awal** di WIB; tanggal selesai/sertifikat bisa mundur sehari antara 00:00–07:00. | `store.js:410,423,459,486`, `form.js:56` |
| 5 | **`MutationObserver` di seluruh `body`** melabeli ulang semua tabel pada setiap perubahan DOM — termasuk tiap detik saat timer quiz berjalan. | `main.js:480-490` |
| 6 | **Escape HTML tidak konsisten** di beberapa template: `laporan.js:103` (kode course), `student-dashboard.js:17` (semester), `style="background: ${course.color}"` (`course.js:149`, `student-dashboard.js:45,169`). Aman dengan mock, tapi jadi vektor XSS bila data datang dari API. | |
| 7 | **Magic value**: passing score 70 (`lecturer-dashboard.js:74`), `PAGE_SIZE` 7/8/10, palet `COLORS` (`form.js:28`), teks status di 3 tempat. | |
| 8 | Logika bisnis di halaman (cascade delete, cek kapasitas, aturan hapus dosen) — seharusnya di service/server. | `data-master.js:180-197`, `users.js:241-263`, `course-grades.js:83-92` |
| 9 | Listener `keydown` Escape global ditambahkan di beberapa tempat (sidebar, dropdown, modal) tanpa koordinasi — Esc saat modal terbuka juga menutup sidebar/dropdown. | `main.js:260,427,514` |
| ✓ | Sudah baik: komentar konsisten berbahasa Indonesia, nama fungsi jelas, `Utils.escape` dipakai hampir di semua tempat, event delegation, tidak ada dependency selain Chart.js lokal. | |

---

## 4. Ketidaksesuaian FITUR.md / PERANCANGAN.md vs Implementasi

| # | Dokumen | Klaim | Implementasi | Status |
|---|---|---|---|---|
| 1 | FITUR §3 Admin Dashboard | Grafik enrollment & completion, export metrics | Data statis `SEED.enrollmentChart` (Jan–Jun), tidak dihitung dari enrollment (`dashboard.js:5`) | Setengah jadi (mock statis) |
| 2 | FITUR §3 / PERANCANGAN §8 | Status sistem | Statis `SEED.systemStatus` (`dashboard.js:84`) | Setengah jadi (wajar untuk mock, perlu endpoint) |
| 3 | FITUR §3 Layout | Notifikasi dropdown | Teks statis per role (`data.js:191`), titik merah muncul lagi di setiap halaman, tidak terkait aktivitas nyata | Setengah jadi |
| 4 | FITUR §3 Quiz | Batas percobaan | Bisa dilewati dengan refresh / dua tab (§d.1, §d.3) | Bug |
| 5 | FITUR §3 Reports | Tabel progress & nilai (filter, …) | Filter hanya course; search topbar justru pindah halaman | Setengah jadi |
| 6 | FITUR §7 | Pesan error terhubung lewat `aria-describedby` / `aria-invalid` untuk semua input | Field modal (`UI.field`) hanya `aria-invalid` | Setengah jadi |
| 7 | FITUR §7 | `role="tab"` + panah keyboard pada tab | Hanya Detail Course; tab Users tanpa panah | Setengah jadi |
| 8 | PERANCANGAN §2 Dosen | "Membuat dan mengedit course … (dikirim ke admin untuk disetujui)" | Edit course **Active** langsung tayang tanpa persetujuan ulang (`form.js:239`, teks `form.js:42`) | Beda perilaku — perlu keputusan |
| 9 | PERANCANGAN §5 ERD | Skema entity | ERD tidak memuat: `COURSE.description/duration/start_date/enrollment_open/certificate/color`, `MODULE.tasks`, `ENROLLMENT.completed_at`, entity `ACTIVITY`; `QUESTION` tanpa `id/quiz_id`; `QUIZ_ATTEMPT` tanpa `id`/`enrollment_id` (di kode tertanam di enrollment) | Dokumen tertinggal — penting untuk skema PostgreSQL |
| 10 | PERANCANGAN §7 | Navbar search | Perilaku beda per halaman: filter lokal (Courses, Users, Dashboard Mahasiswa, Course) vs pindah ke Courses (dashboard, reports, detail, form, profile) | Tidak konsisten |
| 11 | PERANCANGAN §2 | (tidak menyebut) | Sertifikat PNG, pendaftaran mandiri mahasiswa, log aktivitas — ada di FITUR & kode | Sebaliknya: implementasi > PERANCANGAN — cukup sinkronkan dokumen |
| ✓ | FITUR §1 | 13 halaman, 5 grafik | 13 file HTML, 5 grafik (`dashboard`, `lecturer-dashboard`, `course-detail`, `laporan` ×2) | Sesuai |

---

## 5. Backlog (MoSCoW)

Effort: **S** ≤ ½ hari · **M** 1–2 hari · **L** 3–5 hari.

| ID | Item | Area | Prioritas | Effort | Dependensi |
|---|---|---|---|---|---|
| DL-01 | Service layer `Api` async: `client.js` (request, `ApiError`), `transport-local.js` (MockServer di atas DB/Store, cek auth & role, mode `?mock=slow`/`?mock=fail`), `services.js`; ID string opaque (UUID), konvensi waktu ISO UTC | a, b | Must | M | – |
| DL-02 | Pisahkan fungsi domain murni ke `domain.js` (grade, IPK, progress, sertifikat, format tanggal) | a, j | Must | S | DL-01 |
| DL-03 | Migrasi semua halaman dari `DB.*`/`Store.*`/`SEED` ke `Api.*` (await), termasuk cascade delete & aturan bisnis pindah ke MockServer | a, j | Must | L | DL-01, DL-02, ST-01 |
| DL-04 | Auth via `Api.auth.me()`: role dari data user, session hanya menyimpan token/ID | a, c | Must | S | DL-01 |
| DL-05 | Perbaiki timestamp: simpan ISO lengkap dengan zona (`toISOString()` utuh), tanggal lokal untuk validasi | j, e | Must | S | DL-02 |
| ST-01 | Komponen state di `UI`: `loading`, `empty`, `error` (dengan Retry), `busy(button, promise)`, helper `UI.load(container, loader, render)` | b | Must | M | – |
| ST-02 | Terapkan loading/empty/error ke semua view di tabel §b dan error ke semua aksi tulis | b | Must | M | ST-01, DL-03 |
| RG-01 | Guard memblokir: konten disembunyikan sampai guard lolos, script halaman hanya jalan via `App.ready()` setelah user terverifikasi | c | Must | S | DL-04 |
| RG-02 | Halaman `404.html` + state 403 / not-found di dalam halaman (gantikan redirect diam-diam) | c | Must | M | RG-01, ST-01 |
| QZ-01 | Attempt persisten: dibuat saat Start (`startedAt`, `deadline`, jawaban draft), refresh melanjutkan, deadline lewat → auto-submit, limit & deadline divalidasi di service | d | Must | M | DL-01 |
| QZ-02 | Snapshot soal di attempt untuk review; clamp sisa percobaan ≥ 0; editor quiz menolak `maxAttempts` < attempt terbanyak yang sudah dipakai | d | Must | M | QZ-01 |
| QZ-03 | UX quiz: bar sticky timer + "n answered" di ≤1024px, timer keluar dari `aria-live`, fokus ke judul soal saat pindah, modal submit tertutup saat waktu habis | d, g, h | Must | S | – |
| QZ-04 | Badge lulus di dashboard dosen memakai `passingScore` quiz | d | Must | S | – |
| FM-01 | Satu helper validasi `Form` (render error + `aria-describedby` + fokus + toast ringkas) dipakai semua form; samakan aturan nama Profile & Users | e, g | Must | M | – |
| FM-02 | Tombol submit busy/disabled selama proses di semua form & aksi konfirmasi | e | Must | S | ST-01 |
| FM-03 | Konfirmasi "Discard changes?" saat menutup modal form yang sudah diubah | e | Must | S | – |
| FM-04 | Tampilan nilai kosong course Draft ("–" bukan `null`/"—") | e | Must | S | – |
| A11Y-01 | Modal memakai elemen native `<dialog>` + `showModal()` (focus trap & latar inert bawaan browser), id judul unik, Esc hanya menutup modal teratas | g | Must | S | – |
| A11Y-02 | Sidebar off-canvas: `visibility: hidden`/`inert` saat tertutup, fokus masuk saat dibuka & kembali saat ditutup | g | Must | S | – |
| A11Y-03 | Perbaiki token kontras (`--color-text-muted`, `--color-success-text`, teks primary dark, putih di danger) hingga ≥ 4.5:1 | g, f | Must | S | DS-01 |
| DS-01 | Token `--color-on-primary`, `--color-scrim`, token font tambahan; hapus hex/rgba hardcoded di CSS & JS (grafik ambil seri dari token) | f | Must | S | – |
| CQ-01 | Satu fungsi `CourseActions.transition()` (konfirmasi + toast) di atas `Api.courses.transition` dipakai Dashboard, Courses, Detail Course | f, j | Must | S | DL-03 |
| DL-06 | Progress per ID modul (`completedModuleIds`) agar reorder/sisip modul tidak menggeser progress; bump `SEED.version` | a | Must | M | DL-01 |
| TB-02 | Search + pagination di Students & Grades; search + filter status di Reports; tombol Reset filters | i | Should | M | DL-03 |
| DL-08 | Data statis (grafik admin, status sistem, notifikasi, kategori) disajikan lewat `Api.meta`/`Api.dashboard` | a | Should | S | DL-01 |
| CQ-02 | Layout shell (sidebar, topbar, footer) dirender dari satu sumber JS; HTML halaman hanya berisi `<main>` | f, j | Should | M | RG-01 |
| CQ-03 | Hapus `MutationObserver` global; label kolom diberikan saat render tabel | j | Should | S | DL-03 |
| CQ-07 | Unit test `domain.js` dengan `node --test` (bawaan Node, tanpa dependency/build); `domain.js` tetap classic script dengan `if (typeof module !== "undefined") module.exports = Domain;` | j | Should | S | DL-02 |
| A11Y-04 | Toast error `role="alert"`, durasi lebih lama + tombol tutup | g | Should | S | – |
| A11Y-05 | Tabs Users mengikuti pola Detail Course; tab aktif di-scroll ke view di mobile | g, h | Should | S | – |
| A11Y-06 | Komponen `UI.progress()` tunggal dengan `role="progressbar"` + nilai | g, f | Should | S | DS-02 |
| A11Y-07 | Dropdown notifikasi: pola disclosure, fokus kembali ke tombol | g | Should | S | – |
| DS-02 | Konsolidasi komponen duplikat (badge, pagination, empty state, activity list, `setText`) & CSS ganda (`.modal__dialog`) | f | Should | M | DS-01 |
| RS-01 | Indikator scroll pada tabs, pagination ringkas di mobile, legenda grafik di bawah pada layar kecil | h | Should | S | – |
| DOC-01 | Sinkronkan ERD PERANCANGAN & FITUR.md dengan implementasi (termasuk keputusan §8); tulis `docs/API-CONTRACT.md` dari tabel service | a | Should | S | DL-03 |
| TB-01 | Controller tabel reusable `UI.table({ load, columns, filters, pageSize })` (search, filter, sort, pagination, empty, sinkron ke URL) — dipakai Courses, Users, Reports | i, f | Could | M | DL-03 |
| CQ-04 | Pecah fungsi panjang (quiz, form course, editor quiz, form user); kumpulkan global ke namespace `Learnova` | j | Could | M | DL-03 |
| CQ-06 | JSDoc `@typedef` entity (User, Course, Module, Quiz, Attempt, Enrollment) di `services.js` | j | Could | S | DL-01 |
| A11Y-08 | `prefers-reduced-motion` untuk animasi & smooth scroll | g | Could | S | – |
| DS-03 | Perlakuan warna thumbnail course di dark mode | f | Could | S | DS-01 |
| DL-07 | Sinkronisasi multi-tab (event `storage` → invalidasi cache `DB`) | a | Won't | – | diselesaikan backend |

Riwayat revisi backlog (review 10 Okt 2026): ST-03 digabung ke DL-01 · DL-06 naik ke Must · CQ-05 dihapus (masuk acceptance criteria DL-03) · CQ-07 naik ke Should & masuk Sprint 1 · A11Y-01 memakai `<dialog>` native (effort S) · TB-01 & CQ-04 turun ke Could · DL-07 menjadi Won't.

Ringkasan: **22 Must · 12 Should · 5 Could · 1 Won't**. Won't lainnya — lihat §8.

---

## 6. Rencana Bertahap

Urutan mengikuti dependensi. Data layer dikerjakan paling awal karena hampir semua item lain bergantung padanya. Quick win tanpa dependensi diselipkan di sprint awal agar ada perbaikan yang terlihat sejak awal.

### Sprint 1 — Fondasi: service layer & state

| ID | Item |
|---|---|
| DL-01 | Service layer `Api` + MockServer + `ApiError` |
| DL-02 | `domain.js` |
| DL-04 | Auth via `Api.auth.me()` |
| ST-01 | Komponen loading / empty / error / busy |
| RG-01 | Guard memblokir |
| DS-01 | Token warna & hapus hardcoded |
| QZ-04, FM-04 | Quick win bug |
| CQ-07 *(Should)* | Unit test `domain.js` dengan `node --test` |

Hasil: halaman lama masih jalan seperti sekarang, tetapi infrastruktur baru siap dipakai. `profile.html` dimigrasi penuh ke `Api` sebagai *reference implementation* (bagian pertama DL-03). Satu commit per item, pesan commit diawali ID item. Laporan: `docs/SPRINT-1-REPORT.md`.

### Sprint 2 — Migrasi halaman ke `Api`

Urutan migrasi (dari paling sederhana): Login → Profile → Dashboard Admin/Dosen/Mahasiswa → Users → Courses → Form → Detail Course (4 tab) → Reports → Course → Quiz (dasar).

| ID | Item |
|---|---|
| DL-03 | Migrasi semua halaman |
| DL-05 | Perbaikan timestamp |
| ST-02 | State di semua view |
| FM-02 | Busy state tombol |
| CQ-01 | Aksi transisi course tunggal |
| RG-02 | 404 + 403/not-found |

### Sprint 3 — Quiz, form, dan model data

Semua perubahan struktur data sisa (attempt, progress) digabung di sini supaya `SEED.version` hanya naik sekali lagi setelah migrasi ID di Sprint 1.

| ID | Item |
|---|---|
| QZ-01 | Attempt persisten |
| QZ-02 | Snapshot soal & clamp attempts |
| QZ-03 | UX & a11y quiz |
| DL-06 | Progress per ID modul |
| FM-01 | Helper validasi tunggal |
| FM-03 | Konfirmasi discard modal |

### Sprint 4 — Aksesibilitas, design system, tabel, dokumentasi

| ID | Item |
|---|---|
| A11Y-01, A11Y-02, A11Y-03 | Modal (`<dialog>`), sidebar, kontras (Must) |
| A11Y-04 – A11Y-07 | Toast, tabs, progress, dropdown |
| DS-02 | Konsolidasi komponen |
| TB-02 | Kelengkapan tabel Grades & Reports |
| RS-01 | Detail responsif |
| DOC-01 | Sinkron dokumen + kontrak API |
| A11Y-08, DS-03 *(Could)* | Reduced motion, thumbnail dark |

Setelah Sprint 4, frontend siap integrasi: mengganti `Api.config.transport = "http"` dan mengimplementasikan endpoint di FastAPI sesuai `docs/API-CONTRACT.md`.

### Cadangan — dikerjakan bila ada waktu

| ID | Item |
|---|---|
| CQ-02, CQ-03 *(Should)* | Layout shell dari JS, hapus observer global |
| DL-08 *(Should)* | Data statis via API |
| TB-01, CQ-04, CQ-06 *(Could)* | Controller tabel, refactor fungsi panjang, typedef |

---

## 7. Acceptance Criteria (item Must)

**DL-01 — Service layer `Api`**
- [ ] File baru `assets/js/api/client.js`, `transport-local.js`, `transport-http.js`, `services.js` dimuat sebagai classic script; aplikasi tetap bisa dibuka lewat `file://` dan Live Server.
- [ ] Setiap fungsi `Api.*` mengembalikan `Promise`; tidak ada yang mengembalikan nilai sinkron.
- [ ] Error selalu berupa `ApiError` dengan `status`, `code`, `message`, dan `fields` (untuk 400/409).
- [ ] MockServer menolak request tanpa session (401) dan request role yang tidak berhak (403), sesuai tabel hak akses PERANCANGAN §2.
- [ ] Endpoint list menerima `q`, filter, `sort`, `page`, `pageSize` dan mengembalikan `{ items, total, page, pageSize }`.
- [ ] Endpoint quiz untuk mahasiswa tidak pernah mengembalikan field `answer` sebelum attempt disubmit.
- [ ] `Api.config.transport` bisa diganti ke `"http"` tanpa mengubah kode halaman (`transport-http.js` boleh belum terhubung ke server).
- [ ] `?mock=slow` menambah latensi pada setiap request dan `?mock=fail` membuat request gagal dengan `ApiError` (mode bertahan antar halaman sampai `?mock=off`).
- [ ] Semua ID yang dikembalikan berupa string; ID baru dibuat dengan `crypto.randomUUID()`; data seed lama dimigrasi ke ID string (bump `SEED.version`).
- [ ] Semua datetime yang dikembalikan berformat ISO 8601 UTC dengan `Z`; tanggal kalender berformat `YYYY-MM-DD`.
- [ ] Perubahan status course hanya lewat `POST /courses/{id}/transitions` dengan `action` `submit`/`approve`/`reject`/`archive`/`restore`; MockServer menolak action yang tidak diizinkan untuk role (403) atau status asal yang tidak valid (409).
- [ ] Penambahan mahasiswa massal lewat `POST /courses/{id}/enrollments/batch`.
- [ ] Keputusan produk §8 diterapkan di MockServer: edit course Active langsung tayang dan tercatat di log aktivitas; course Archived menolak enrollment baru, penyelesaian modul, dan attempt baru.

**DL-02 — `domain.js`**
- [ ] `gradeFromScore`, `gradePoint`, `gpa`, `progressPercent`, `certificateNumber`, `formatDate` berada di `domain.js`, tanpa akses `DB`/`localStorage`/DOM.
- [ ] `store.js` dan halaman memakai fungsi tersebut; tidak ada duplikasi skala nilai.

**DL-03 — Migrasi halaman**
- [ ] `grep -E "DB\.|SEED\.|Storage\." assets/js/pages` tidak menemukan hasil.
- [ ] Tidak ada mutasi langsung objek data di halaman (`.order =`, `.attempts =`, `.completedModules =`).
- [ ] Cascade delete (course, user, quiz) dan aturan bisnis (hapus dosen yang masih mengajar, kapasitas, status course) dijalankan di MockServer, halaman hanya menampilkan hasil/error.
- [ ] Validasi keunikan email/NIM/kode course dikembalikan sebagai `ApiError` 409 dengan `fields`, dan ditampilkan di field terkait.
- [ ] Halaman tidak melakukan `Number()`/`parseInt` pada ID.
- [ ] Semua interpolasi template, termasuk atribut `style`, di-escape.
- [ ] Semua fitur di FITUR.md §3 tetap berfungsi (dicek dengan checklist manual per halaman).

**DL-04 — Auth via `Api.auth.me()`**
- [ ] `learnova.session` hanya berisi token/ID; mengubah nilai `role` di localStorage tidak memberi akses ke halaman role lain.
- [ ] Nama/role di sidebar & topbar berasal dari respons `me()`.
- [ ] User yang dihapus/dinonaktifkan saat sedang login diarahkan ke login dengan pesan.

**DL-05 — Timestamp**
- [ ] Seluruh kode mengikuti konvensi waktu DL-01 (ISO UTC `Z` untuk datetime, `YYYY-MM-DD` untuk tanggal kalender).
- [ ] Aktivitas & attempt yang dibuat sekarang tampil dengan jam lokal yang benar (WIB) di Dashboard, Reports, dan riwayat quiz.
- [ ] Validasi "start date cannot be in the past" memakai tanggal lokal (benar juga pada pukul 00:00–07:00 WIB).
- [ ] Data seed lama tetap tampil benar (dimigrasi via bump versi atau parser yang toleran).

**ST-01 — Komponen state**
- [ ] `UI.loading(el)`, `UI.empty(el, { title, text, action })`, `UI.error(el, err, onRetry)` menghasilkan markup dan kelas yang seragam (satu gaya empty state).
- [ ] Loading memakai skeleton/spinner berbasis token, punya `aria-busy="true"` pada container.
- [ ] `UI.busy(button, promise)` men-disable tombol, menampilkan spinner, dan memulihkannya setelah promise selesai (berhasil atau gagal).
- [ ] Semua komponen benar di light & dark mode.

**ST-02 — Penerapan state**
- [ ] Setiap baris berstatus ✗/⚠ di tabel §b punya state yang sesuai.
- [ ] Dengan `?mock=slow` (atau delay manual) setiap view menampilkan loading; dengan `?mock=fail` setiap view menampilkan error + tombol Retry yang berfungsi.
- [ ] Aksi tulis yang gagal menampilkan toast error dan **tidak** menampilkan toast sukses.
- [ ] Empty state membedakan "belum ada data" (dengan CTA bila relevan, mis. "Create course") dan "tidak ada hasil filter" (dengan "Reset filters").

**RG-01 — Guard memblokir**
- [ ] Membuka halaman terlindungi tanpa login tidak menampilkan konten apa pun (tidak ada kedipan sidebar/tabel) dan tidak ada error di console.
- [ ] Script halaman tidak dieksekusi sebelum guard lolos (tidak ada `TypeError` `me` null).
- [ ] Data role lain tidak pernah dirender ke DOM (cek: mahasiswa membuka `users.html`).

**RG-02 — 404 / 403 / not found**
- [ ] `pages/404.html` memakai design system, menampilkan tombol kembali ke dashboard sesuai role (atau login).
- [ ] Role yang salah melihat state 403 ("You don't have access to this page") dengan link ke dashboard-nya, bukan redirect diam-diam.
- [ ] ID course/quiz yang tidak ada atau bukan miliknya menampilkan state not-found di halaman, URL tidak berubah.
- [ ] Konfigurasi deploy statis (Vercel) diarahkan ke `404.html` untuk path yang tidak dikenal (dicatat di FITUR §10).

**QZ-01 — Attempt persisten**
- [ ] Klik *Start* membuat attempt berstatus `in_progress` dengan `deadline`; sisa percobaan langsung berkurang (intro memberi tahu hal ini sebelum mulai).
- [ ] Refresh atau membuka ulang quiz saat attempt masih berjalan melanjutkan soal & jawaban terakhir dengan sisa waktu yang benar.
- [ ] Membuka quiz setelah `deadline` lewat langsung men-submit jawaban yang tersimpan dan menampilkan hasil.
- [ ] Submit ditolak service bila attempt bukan `in_progress`, melewati deadline + toleransi, atau melebihi `maxAttempts` (uji: dua tab).
- [ ] Jawaban tersimpan setiap kali berubah (tanpa tombol simpan).
- [ ] Course Archived: tombol Start tidak tersedia, review attempt lama tetap bisa.

**DL-06 — Progress per ID modul**
- [ ] Enrollment menyimpan `completedModuleIds`; progress = jumlah ID yang masih ada di course ÷ jumlah modul.
- [ ] Memindahkan urutan modul tidak mengubah modul mana yang sudah selesai bagi mahasiswa.
- [ ] Menambah modul baru di tengah course membuka modul tersebut sebagai modul berikutnya yang harus diselesaikan, tanpa menandai modul lain belum selesai.
- [ ] Menghapus modul tidak membuat progress > 100% atau negatif; sertifikat tetap mengikuti aturan "semua modul selesai".
- [ ] Data lama dimigrasi (bump `SEED.version`) dan dashboard, laporan, serta grafik progress tetap menampilkan angka yang sama untuk data seed.

**QZ-02 — Snapshot & clamp**
- [ ] Review attempt lama tetap menampilkan soal, opsi, dan kunci sesuai saat attempt dikerjakan walaupun dosen mengubah quiz.
- [ ] "x of y correct" selalu konsisten dengan skor tersimpan.
- [ ] "Attempts left" tidak pernah negatif; label "Attempt n of m" tidak pernah n > m.
- [ ] Editor quiz menampilkan error bila `maxAttempts` < jumlah attempt terbanyak milik satu mahasiswa.

**QZ-03 — UX & a11y quiz**
- [ ] Di lebar ≤1024px timer dan "n answered" selalu terlihat (sticky) saat menjawab; terverifikasi di 375px.
- [ ] Timer tidak berada di dalam region `aria-live`; pengumuman hanya pada sisa 1 menit dan saat waktu habis.
- [ ] Setelah Next/Previous/nomor soal, fokus berpindah ke judul soal.
- [ ] Bila waktu habis saat modal konfirmasi terbuka, modal tertutup dan hasil tampil; toast waktu habis bertipe info/warning.

**QZ-04 — Passing score**
- [ ] Badge di "Recent quiz attempts" dashboard dosen hijau/merah sesuai `passingScore` quiz masing-masing.

**FM-01 — Validasi seragam**
- [ ] Hanya ada satu implementasi render error field; `login.js` dan `form.js` tidak lagi punya `setError`/`validate` sendiri.
- [ ] Setiap field punya `aria-describedby` ke hint & error, `aria-invalid` sesuai state.
- [ ] Semua form yang gagal validasi: error inline + fokus ke field pertama + toast ringkas "Please fix n fields" (kecuali login yang memakai alert).
- [ ] Aturan nama sama di Users & Profile, dan nama dengan huruf beraksen/apostrof valid di keduanya.

**FM-02 — Busy state**
- [ ] Semua tombol submit & tombol konfirmasi modal ter-disable dengan indikator saat request berjalan; klik ganda tidak membuat data ganda.

**FM-03 — Discard modal**
- [ ] Modal form (modul, quiz, user, tambah mahasiswa) yang sudah diubah meminta konfirmasi saat ditutup lewat Esc, backdrop, atau Cancel; modal yang belum diubah langsung tertutup.

**FM-04 — Draft course**
- [ ] Course Draft tanpa durasi/kapasitas/kode tampil "–" di tabel Courses dan Detail Course; tidak ada teks `null` di UI.

**A11Y-01 — Modal**
- [ ] `UI.modal` merender elemen `<dialog>` dan membukanya dengan `showModal()`; tidak ada focus trap buatan sendiri.
- [ ] Tab/Shift+Tab tidak mencapai elemen di belakang modal (perilaku inert bawaan `showModal()`).
- [ ] Setiap modal punya id judul unik; Esc hanya menutup modal teratas dan tidak menutup sidebar/dropdown sekaligus.
- [ ] Fokus kembali ke elemen pemicu setelah modal ditutup (perilaku yang sudah ada tetap terjaga).

**A11Y-02 — Sidebar off-canvas**
- [ ] Di ≤1024px saat sidebar tertutup, link sidebar tidak bisa dicapai dengan Tab.
- [ ] Membuka sidebar memindahkan fokus ke tombol tutup/link pertama; menutup (Esc/overlay/✕) mengembalikan fokus ke tombol menu.

**A11Y-03 — Kontras**
- [ ] Semua kombinasi teks/latar dari token mencapai ≥ 4.5:1 (teks normal) dan ≥ 3:1 (teks besar & komponen UI) di light dan dark mode, dibuktikan dengan tabel hasil cek di PR.
- [ ] Warna primary light tetap `#4F46E5` (design system tidak berubah); penyesuaian hanya pada token turunan/teks.

**DS-01 — Token**
- [ ] Tidak ada literal `#fff`/`#ffffff`/`rgba(` di `style.css` di luar blok token `:root` (kecuali print & ilustrasi login yang diberi komentar).
- [ ] Seri warna grafik diambil dari token CSS; `lecturer-dashboard.js` tidak punya warna hardcoded.
- [ ] Tampilan light & dark identik dengan sebelum perubahan (cek visual Dashboard, Courses, Quiz).

**CQ-01 — Transisi status course**
- [ ] Approve/Reject/Archive/Restore/Submit di Dashboard, Courses, dan Detail Course memakai satu fungsi di atas `Api.courses.transition`; teks konfirmasi, toast, dan log aktivitas identik untuk aksi yang sama.
- [ ] Reject menyediakan isian alasan opsional (`reason`).

---

## 8. Sengaja Tidak Dikerjakan (Out of Scope)

**Backend & keamanan nyata**
- Implementasi FastAPI + PostgreSQL, migrasi skema, JWT/refresh token, hashing password, rate limiting. Fase ini hanya menyiapkan kontrak dan transport `http`.
- Pagination/filter server-side sungguhan — hanya bentuk API-nya yang disiapkan.
- Mekanisme anti-tamper di klien (enkripsi localStorage, checksum, obfuscation) — lihat Prinsip MockServer §3a.
- Sinkronisasi multi-tab di mock (DL-07, Won't) — konsistensi data lintas tab diselesaikan backend.

**Fitur baru di luar FITUR.md**
- Notifikasi real-time, tandai sudah dibaca, notifikasi email.
- Lupa/reset password via email, registrasi mandiri, SSO.
- Upload & penyimpanan file nyata (thumbnail course, video materi, pengumpulan tugas), forum diskusi.
- Tipe soal selain pilihan ganda, bank soal, acak soal/opsi, penilaian esai.
- Kalender, pengumuman, chat, gamifikasi.
- Fitur SaaS: multi-tenant, billing, branding per institusi, manajemen role kustom.
- UI berbahasa Indonesia / i18n (UI tetap bahasa Inggris seperti sekarang).
- PWA / mode offline, analytics.

**Teknologi & tooling**
- Framework (React/Vue/Svelte), TypeScript, bundler/build tool (Vite, webpack), Tailwind, npm dependency baru.
- ES modules (`type="module"`) — ditunda agar `file://` tetap jalan.
- Test E2E otomatis (Playwright/Cypress); pengujian memakai checklist manual + unit test `node --test` untuk `domain.js` (CQ-07).

**Desain**
- Redesign visual, ganti palet/font, atau layout baru. Design system (Indigo `#4F46E5`, Inter, card-based) dipertahankan; perubahan warna hanya untuk lolos kontras AA pada token turunan.

### Keputusan produk

| # | Topik | Status | Keputusan |
|---|---|---|---|
| 1 | Edit course Active | **Diputuskan** (10 Okt 2026) | Edit langsung tayang tanpa approval ulang; setiap edit dicatat di log aktivitas. PERANCANGAN.md §2 disinkronkan di DOC-01. |
| 2 | Course Archived | **Diputuskan** (10 Okt 2026) | Modul read-only (tidak bisa ditandai selesai); tidak bisa memulai attempt baru; review hasil lama dan unduh sertifikat tetap bisa; enrollment baru ditutup. |
| 3 | Kapan attempt dihitung | **Diputuskan** (10 Okt 2026) | Attempt dihitung saat Start; intro quiz wajib menjelaskan hal ini (QZ-01). |
| 4 | Format script | **Diputuskan** (10 Okt 2026) | Classic script + namespace global `Api` (bukan ES module), demi dukungan `file://`. |
