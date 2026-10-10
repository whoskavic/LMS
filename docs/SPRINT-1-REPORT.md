# 🏁 Laporan Sprint 1 — Fondasi Service Layer & State

> Branch: `sprint-1` (12 commit di atas `master` termasuk laporan ini, belum di-push / di-merge) · Tanggal: 10 Oktober 2026
> Acuan: [UI-ROADMAP.md](UI-ROADMAP.md) (revisi review 10 Okt 2026)

## 1. Ringkasan

- Semua 9 item Sprint 1 selesai (DL-01, DL-02, DL-04, ST-01, RG-01, DS-01, QZ-04, FM-04, CQ-07), ditambah migrasi penuh `profile.html` ke `Api` sebagai *reference implementation* (bagian pertama DL-03).
- Aplikasi sekarang punya service layer async `Api` dengan **MockServer** (45 route REST) yang memuat aturan bisnis & otorisasi sebagai spesifikasi untuk backend FastAPI.
- Identitas user selalu dari `GET /auth/me`; mengubah `role` di localStorage tidak lagi membuka halaman role lain. Halaman terlindungi tidak tampil sama sekali sampai sesi terverifikasi.
- Halaman lain masih memakai kode lama (DB/Store) dan **tetap berfungsi** — diverifikasi di 15 kombinasi halaman × role.
- Test otomatis: `node --test` → 14 test lulus (13 unit test `domain.js` + 1 test kontrak MockServer berisi 26 skenario berurutan).
- **Data browser di-seed ulang**: `SEED.version` naik 3 → 4 (ID string). Semua user otomatis keluar sekali dan data demo kembali ke kondisi awal.

## 2. Daftar Commit

| Commit | Item |
|---|---|
| `7e6a1de` | docs: UI-ROADMAP + revisi review |
| `cfbba04` | DS-01 — token warna |
| `7f582fe` | DL-02 — `domain.js` |
| `bf577c7` | CQ-07 — unit test `domain.js` |
| `63b5f82` | DL-01 — service layer `Api` + MockServer |
| `e4929ec` | ST-01 — komponen state |
| `67b96dd` | DL-04 — identitas dari `Api.auth.me()` |
| `d450321` | RG-01 — guard memblokir |
| `f3b0fb4` | QZ-04 — passing score di dashboard dosen |
| `7956757` | FM-04 — "–" untuk field Draft kosong |
| `02fa565` | DL-03 (sebagian) — `profile.html` ke `Api` |

## 3. Status Acceptance Criteria

Legenda: ✅ terpenuhi & diverifikasi · ⚠️ terpenuhi sebagian / dengan catatan · ⏳ dijadwalkan di sprint lain

### DL-01 — Service layer `Api`

| Kriteria | Status | Bukti / catatan |
|---|---|---|
| File `api/client.js`, `transport-local.js`, `transport-http.js`, `services.js` sebagai classic script; jalan di `file://` dan Live Server | ⚠️ | Dimuat di semua 13 HTML. Diverifikasi lewat server HTTP lokal (semua alur) dan `file://` (halaman termuat tanpa error, guard mengalihkan ke login). **Login lewat `file://` belum diuji otomatis** — ada di checklist §7. |
| Setiap fungsi `Api.*` mengembalikan Promise | ✅ | Transport local selalu `await` minimal satu `setTimeout`, termasuk saat error. |
| Error selalu `ApiError { status, code, message, fields }` | ✅ | Error non-API (bug/jaringan) dibungkus `NETWORK_ERROR` (status 0) dan dicatat ke console. |
| 401 tanpa sesi, 403 role tidak berhak (PERANCANGAN §2) | ✅ | `tests/mockserver.test.js` skenario 2, 7–9, 13–14, 19. |
| Endpoint list menerima `q`, filter, `sort`, `page`, `pageSize` → `{ items, total, page, pageSize }` | ✅ | Default `pageSize` 50 (maks 200); `page` di-clamp ke halaman terakhir. |
| Mahasiswa tidak pernah menerima kunci jawaban | ✅ | `GET /quizzes/{id}` dan `GET /courses/{id}/quizzes` membuang field `answer` untuk role student (skenario 19). |
| `Api.config.transport = "http"` tanpa mengubah halaman | ⚠️ | `transport-http.js` siap (fetch, Bearer token, error `{ error: { code, message, fields } }`), belum bisa diuji karena belum ada backend. |
| `?mock=slow` / `?mock=fail`, bertahan antar halaman sampai `?mock=off` | ✅ | Disimpan di `sessionStorage` per tab. `fail` mengecualikan `/auth/*` (lihat §5). |
| Semua ID string; ID baru `crypto.randomUUID()`; seed dimigrasi | ✅ | Seed memakai ID berprefix deterministik (`usr_1`, `crs_8`, `mod_…`, `quz_…`, `enr_…`, `act_…`). Cadangan UUID v4 via `getRandomValues` bila `randomUUID` tidak tersedia. |
| Datetime ISO 8601 UTC `Z`; tanggal kalender `YYYY-MM-DD` | ✅ | Seed aktivitas/attempt dikonversi dari WIB ke UTC; semua tulis baru memakai `Domain.nowIso()`. |
| Status course hanya lewat `POST /courses/{id}/transitions` | ✅ / ⏳ | Endpoint & matriks izin selesai (skenario 8, 13). Halaman lama masih mengubah status langsung sampai CQ-01 (Sprint 2). |
| `POST /courses/{id}/enrollments/batch` | ✅ | Skenario 18. |
| Keputusan produk §8 di MockServer | ⚠️ | #1 edit course Active langsung tayang & dicatat ("(live)" di log). #2 Archived: enrollment baru 409, penyelesaian modul 409, sertifikat tetap tersedia. **Penolakan attempt baru** menunggu endpoint attempt (QZ-01). |

### DL-02 — `domain.js`

| Kriteria | Status | Bukti / catatan |
|---|---|---|
| Fungsi domain murni di `domain.js`, tanpa DB/localStorage/DOM | ✅ | `gradeFromScore`, `gradePoint`, `gpa`, `average`, `progressPercent`, `certificateNumber`, `todayLocal`, `addDays`, `formatDate`, `formatDateTime`, `roleLabel`, `userTitle`. |
| `store.js` dan halaman memakai fungsi tersebut; skala nilai tidak duplikat | ✅ | `GRADE_SCALE` & `ROLE_LABELS` di `store.js` dihapus; `Utils.average`/`Utils.formatDate` jadi pembungkus tipis untuk halaman lama. |

### CQ-07 — Unit test `domain.js` *(Should)*

- ✅ `tests/domain.test.js` — 13 test, tanpa dependency, `module.exports` di `domain.js` sesuai arahan.
- Diverifikasi di zona WIB (Asia/Jakarta) dan UTC−8 (America/Los_Angeles) dengan variabel `TZ`.
- Test menemukan satu bug yang langsung diperbaiki: `formatDate(null)` sebelumnya menghasilkan "1 Jan 1970".

### DL-04 — Auth via `Api.auth.me()`

| Kriteria | Status | Bukti / catatan |
|---|---|---|
| `learnova.session` hanya token; mengubah `role` di localStorage tidak memberi akses | ✅ | Uji tamper: mahasiswa yang menambahkan `role: "admin"` ke session lalu membuka `users.html` tetap dialihkan ke dashboard mahasiswa. |
| Nama/role di sidebar & topbar dari `me()` | ✅ | `applyUserToLayout(user)` di `main.js`. |
| User dihapus/dinonaktifkan saat login → login dengan pesan | ✅ | Dosen dinonaktifkan → membuka dashboard → diarahkan ke login dengan toast "Your account has been deactivated…". |

### ST-01 — Komponen state

| Kriteria | Status | Bukti / catatan |
|---|---|---|
| `UI.loading` / `UI.empty` / `UI.error` dengan markup & kelas seragam | ✅ | Satu blok `.state` untuk ketiganya; di `<tbody>` otomatis jadi satu baris penuh. |
| Loading berbasis token + `aria-busy="true"` | ✅ | Spinner CSS dari `--color-primary` / `--color-primary-soft`. |
| `UI.busy(button, promise)` | ✅ | Disable + spinner + `aria-busy`, selalu dipulihkan (berhasil/gagal). Dipakai di login & profil. |
| Benar di light & dark mode | ✅ | Dicek dengan screenshot keempat state di kedua tema. |

Tambahan di luar kriteria: `UI.load()` (loader → render/empty/error + Retry), `UI.applyFieldErrors()` (map `ApiError.fields` ke form), dan `UI.modal` menerima `onConfirm` async.

### RG-01 — Guard memblokir

| Kriteria | Status | Bukti / catatan |
|---|---|---|
| Tanpa login: tidak ada konten tampil, tidak ada error console | ✅ | `.app` tersembunyi (`visibility: hidden`) + spinner sampai sesi terverifikasi; tanpa token langsung ke login. |
| Script halaman tidak jalan sebelum guard lolos | ✅ | Semua script halaman (kecuali login) memakai `App.ready()`; tidak ada lagi `TypeError` `me` null. |
| Data role lain tidak pernah dirender (mahasiswa → `users.html`) | ✅ | Dengan `?mock=slow`: saat menunggu verifikasi, `#user-rows` berisi 0 baris dan halaman tersembunyi; lalu dialihkan ke dashboard mahasiswa. |

Tambahan: bila `/auth/me` gagal karena alasan selain 401, tampil halaman error "Could not load this page" dengan tombol "Try again".

### DS-01 — Token

| Kriteria | Status | Bukti / catatan |
|---|---|---|
| Tidak ada `#fff`/`rgba(` di luar blok token | ✅ | Satu pengecualian yang disengaja dan diberi komentar: latar putih di `@media print`. |
| Seri grafik dari token; `lecturer-dashboard.js` tanpa warna hardcoded | ✅ | Token `--chart-4..6`, `--color-on-pastel`. |
| Tampilan light & dark identik | ⚠️ | Nilai token sama persis dengan literal lama, jadi secara konstruksi identik; dicek visual di Dashboard (light/dark) tetapi **tanpa pixel-diff** terhadap `master`. |

### QZ-04 — Passing score

- ✅ Badge dihitung dari `passingScore` quiz. Diuji: skor 40 hijau saat passing 30, merah saat passing 70.

### FM-04 — Draft course

- ✅ Draft yang hanya berisi judul tampil "–" di tabel Courses, dashboard dosen, dan Detail Course; pemindaian teks halaman tidak menemukan `null`/`undefined`/`NaN`.

### DL-03 (sebagian) — `profile.html`

| Kriteria | Status | Bukti / catatan |
|---|---|---|
| Tidak ada `DB.`/`SEED.`/`Storage.` di `profile.js` | ✅ | Hanya `Api`, `Domain`, `UI`, `Theme`. |
| Tidak ada `Number()`/`parseInt` pada ID; interpolasi di-escape | ✅ | |
| Fitur FITUR.md §3 Profile tetap berfungsi | ✅ | Diuji: tampil normal, `?mock=slow` (loading), `?mock=fail` (error + Try again, toast saat simpan), ganti nama beraksen, error field dari server, password lama salah, ganti password, reset demo → login + toast. |
| Halaman lain | ⏳ | Sprint 2. |

## 4. Keputusan Teknis

1. **MockServer sebagai router REST.** Service ditulis sebagai pemanggilan `method + path`; MockServer mencocokkan route lalu menjalankan aturan bisnis. Pindah ke FastAPI = mengganti transport, kontrak (path, status, kode error) sudah terdokumentasi lewat kode dan test.
2. **Sesi disimpan di "server" mock.** Login membuat record di koleksi `sessions` (`token` = UUID acak). Browser hanya menyimpan `{ token }`. Token yang tidak dikenal, user terhapus, atau user nonaktif → 401 (sesi nonaktif sekalian dihapus).
3. **Respons selalu di-clone.** MockServer mengembalikan salinan data sehingga halaman tidak bisa lagi memutasi cache DB seperti pola lama.
4. **Kegagalan tulis localStorage → 500 `STORAGE_ERROR`.** `Storage.write` kini mengembalikan `false` saat gagal; MockServer mengubahnya menjadi error, bukan sukses palsu.
5. **ID seed berprefix (`usr_1`, `crs_8`, …), ID baru UUID.** Prefix memastikan sisa `Number(id)` langsung ketahuan (menjadi `NaN`) dan seed tetap deterministik di semua browser.
6. **`App.ready(fn)` sebagai satu-satunya titik masuk halaman.** Callback dijalankan berurutan setelah DOM siap, sesi terverifikasi, dan layout diisi; halaman baru ditampilkan (`body.is-ready`) setelah render awal selesai.
7. **Aturan nama di server memakai huruf Unicode** (`\p{L}`), minimal 3 karakter. Profil kini menerima nama beraksen/apostrof (menyelesaikan sisi Profile dari temuan FM-01; modal Users lama masih divalidasi di klien).
8. **Validasi di halaman yang sudah dimigrasi hanya "ringan"** (wajib isi, konfirmasi password). Aturan lengkap ada di MockServer agar tidak ada dua sumber kebenaran.
9. **Test kontrak MockServer di-commit** (`tests/mockserver.test.js`): memuat script browser ke `vm` context Node, tanpa DOM dan tanpa dependency.

## 5. Penyimpangan dari Rencana

| # | Penyimpangan | Alasan |
|---|---|---|
| 1 | Sebagian **DL-05** dikerjakan lebih awal: seed & semua penulisan waktu di `store.js` kini ISO UTC `Z`, tampilan lewat `Domain.formatDateTime` (jam aktivitas kini benar di WIB). Sisa DL-05: `form.js:56` masih memakai tanggal UTC untuk validasi "start date in the past". | Konvensi waktu DL-01 wajib dipenuhi oleh data yang dikembalikan MockServer. |
| 2 | `?mock=fail` **tidak** menggagalkan `/auth/*`. | Bila `/auth/me` ikut gagal, setiap halaman berhenti di halaman error guard sehingga error state per view tidak bisa didemokan. Error guard tetap bisa diuji terpisah. |
| 3 | Endpoint **attempt quiz** (`start`/`save`/`submit`) belum dibuat. | Bergantung pada model attempt `in_progress` dari QZ-01 (Sprint 3); membuatnya sekarang berarti kontrak yang akan berubah. |
| 4 | Endpoint agregat **`/dashboard/{role}`** belum dibuat. | Bentuk respons sebaiknya ditentukan saat dashboard dimigrasi (Sprint 2). Data penyusunnya sudah tersedia lewat endpoint lain. |
| 5 | Endpoint tambahan di luar tabel roadmap: `GET /me/stats`, `GET /meta/departments`, `GET /meta/lecturers`, `GET /meta/enrollment-chart`, `POST /dev/reset` (khusus mock), dan `GET /courses/{id}/stats` kini menyertakan distribusi progress. | Dibutuhkan halaman yang akan dimigrasi (opsi filter, profil, grafik). |
| 6 | `PATCH /quizzes/{id}` sudah menolak `maxAttempts` < attempt terbanyak yang sudah dipakai. | Aturan QZ-02; murah dan memang aturan server. UI-nya tetap di Sprint 3. |
| 7 | Reject menyimpan `rejectionReason` (field baru, belum ditampilkan). | Bagian dari kontrak `transitions` (`reason?`). |
| 8 | Notifikasi topbar sudah diambil lewat `Api.meta.notifications()` (bagian kecil DL-08). | `main.js` disentuh untuk DL-04, sekalian berhenti membaca `SEED` langsung. |
| 9 | Halaman lama ikut disentuh: perbaikan `Number(id)` di `course-modules.js`, `course-grades.js`, `student-dashboard.js`; `login.js` pindah ke `Api.auth.login`; `users.js` berhenti memanggil `Store.setSession`; semua halaman memakai `App.ready`. | Wajib agar halaman lama tetap berfungsi setelah perubahan ID dan sesi. |
| 10 | `Store.login/setSession/getSession/logout/userTitle` dihapus; record aktivitas mendapat `actorId`. | Satu-satunya jalur sesi sekarang `Api.auth`. |

## 6. Catatan & Risiko untuk Sprint 2

- **Aturan MockServer belum berlaku di halaman lama.** Halaman yang belum dimigrasi masih menulis DB langsung, sehingga misalnya mahasiswa masih bisa menandai modul selesai di course Archived lewat `course.js`, dan `quiz.js` masih membaca kunci jawaban dari DB. Ini tertutup otomatis begitu halaman dimigrasi (DL-03).
- **Submit for approval di Detail Course (halaman lama) belum mewajibkan Draft lengkap.** Draft yang hanya berisi judul bisa diajukan lalu disetujui admin. Endpoint `transitions` sudah menolak kasus ini (`400 INCOMPLETE_COURSE`); akan tertutup oleh CQ-01.
- **`form.js:56`** masih memakai tanggal UTC (sisa DL-05).
- **Login lewat `file://`** perlu dicek manual sekali (checklist §7).
- Script pengujian headless Chrome yang saya pakai (server statis + probe per halaman) tidak di-commit karena hanya alat bantu verifikasi; bisa ditambahkan bila diinginkan.
- FITUR.md belum diperbarui (struktur folder `api/`, `tests/`, format `learnova.session`, cara menjalankan test) — dijadwalkan di DOC-01.

## 7. Checklist Uji Manual (Regresi)

Persiapan: buka `index.html` (Live Server atau langsung `file://`). Data lama akan di-seed ulang otomatis; jika masih login dari versi sebelumnya, Anda akan diarahkan ke halaman login. Jalankan juga `node --test` di root repo (harus 14 lulus).

### Umum (semua role)
- [ ] Membuka halaman `pages/*.html` tanpa login → langsung ke login, tidak ada kedipan sidebar/tabel.
- [ ] Login sebagai mahasiswa, lalu buka `pages/users.html` lewat URL → kembali ke dashboard mahasiswa tanpa melihat tabel user.
- [ ] DevTools → localStorage `learnova.session` hanya berisi `{"token": "…"}`; menambahkan `"role":"admin"` tidak mengubah apa pun.
- [ ] Tombol tema di topbar & pilihan tema di Profile tetap berfungsi; warna tombol, toast, badge sama seperti sebelumnya di light & dark.
- [ ] Notifikasi topbar menampilkan 3 item sesuai role.
- [ ] Logout → konfirmasi → kembali ke login; tombol Back tidak membuka panel lagi.
- [ ] Tambahkan `?mock=slow` ke URL halaman mana pun → spinner tampil sebentar sebelum halaman muncul. `?mock=off` mematikannya.

### Login (`index.html`)
- [ ] Klik akun demo → Log in → dashboard sesuai role + toast "Welcome back, …".
- [ ] Password salah → alert "Email or password is incorrect." dan field password dikosongkan.
- [ ] `david@learnova.ac.id` / `dosen123` → alert akun nonaktif.
- [ ] Tombol Log in menampilkan spinner saat proses (terlihat jelas dengan `?mock=slow`).
- [ ] "Reset demo data" → konfirmasi → toast berhasil.
- [ ] Sudah login lalu membuka `index.html` → langsung ke dashboard.
- [ ] Ulangi login sekali lewat `file://` (buka file langsung tanpa Live Server).

### Admin
- [ ] **Dashboard**: 4 kartu (13 course · 24 mahasiswa · 11 dosen · 1 pending), grafik tampil, Approve/Reject MOB301 berfungsi, aktivitas terbaru menampilkan jam lokal yang benar.
- [ ] **Users**: tab Students/Lecturers/Admins, cari, filter, sortir, pagination; tambah user (ID baru berbentuk UUID tidak mengganggu apa pun), edit, nonaktifkan, hapus; tidak bisa menonaktifkan/menghapus diri sendiri; dosen yang masih mengajar tidak bisa dihapus.
- [ ] **Courses**: cari, filter kategori/status/dosen, sortir, pagination, Approve/Reject/Archive/Restore, Delete, Export CSV.
- [ ] **Detail Course** (`?id=crs_8`): 4 tab, statistik, grafik distribusi, nilai read-only, Archive/Restore.
- [ ] **Reports**: ringkasan (59% · 82/100 · 29%), 2 grafik, tabel + filter course + sortir + pagination, cetak, Export CSV, aktivitas.
- [ ] **Profile**: lihat poin "Profile" di bawah.

### Dosen (`budi@learnova.ac.id`)
- [ ] **Dashboard**: kartu, grafik, daftar course; badge "Recent quiz attempts" hijau/merah mengikuti passing score quiz.
- [ ] **My Courses**: hanya CS205 & MOB301; Edit; Delete hanya untuk Draft/Pending/Rejected.
- [ ] **New Course**: Save draft hanya dengan judul → di My Courses & Detail tampil "–" untuk kode, kategori, semester, kapasitas (tidak ada teks `null`).
- [ ] **Edit Course** (`form.html?id=crs_8`): data terisi, simpan → kembali ke detail + toast.
- [ ] **Detail Course › Modules**: tambah, edit, naik/turun urutan, hapus.
- [ ] **Detail Course › Quizzes**: buat, edit, hapus quiz.
- [ ] **Detail Course › Students & Grades**: isi nilai → grade huruf berubah → Save grades; Add students (pilih beberapa) → jumlah bertambah; keluarkan mahasiswa; Export CSV.

### Mahasiswa (`alex@learnova.ac.id`)
- [ ] **Dashboard**: ringkasan semester & IPK (3.67), grid/table, filter semester & status, Continue course (modal), View final grade (semester Spring 2026), Browse courses → Enroll, Certificate di course yang selesai.
- [ ] **Course** (`course.html?id=crs_8`): daftar modul, video simulasi, checklist tugas, Mark as complete, Previous/Next, pencarian modul, daftar quiz.
- [ ] **Quiz** (`quiz.html?id=quz_6`): intro, Start, timer, navigasi nomor, pintasan 1–4 & ←/→, konfirmasi submit, hasil & review, riwayat attempt dengan jam lokal yang benar.

### Profile (semua role) — halaman yang sudah memakai `Api`
- [ ] Kartu profil menampilkan ID, departemen, dan statistik role (mahasiswa: Courses 8 · GPA 3.67).
- [ ] `profile.html?mock=slow` → kartu detail menampilkan "Loading…" sebelum data muncul.
- [ ] `profile.html?mock=fail` → kartu detail menampilkan error + "Try again"; klik Save changes → toast error dan tidak ada toast sukses. Buka `?mock=off` setelahnya.
- [ ] Ubah nama (mis. "Alex Mércer") → toast, nama di sidebar & topbar ikut berubah.
- [ ] Nama "A1" → pesan error di bawah field (dari server), fokus ke field nama.
- [ ] Password lama salah → error di field "Current password"; password baru valid → toast, lalu login ulang dengan password baru berhasil.
- [ ] Reset demo data → kembali ke login dengan toast "Demo data has been reset."
- [ ] Tidak ada peringatan "[DOM] Password forms should have … username" di console.
