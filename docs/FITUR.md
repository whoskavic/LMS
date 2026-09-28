# 📗 Rekap Fitur — Learnova LMS

Dokumen ini merangkum semua fitur yang sudah diimplementasikan pada Admin Panel **Learnova** (Tugas Pemrograman Web 2 — Client-Side Programming). Rancangan awal ada di [PERANCANGAN.md](PERANCANGAN.md).

---

## 1. Ringkasan

| Item | Keterangan |
|---|---|
| Topik | Learning Management System (LMS) |
| Teknologi | HTML5, CSS3, JavaScript murni (tanpa framework), Chart.js 4.4.1 |
| Design system | Material Design, warna Indigo/Green, font Inter, mode terang & gelap |
| Data | Mock data (hardcode di JS), disimpan di `localStorage` browser |
| Backend | Tidak ada |
| Role | Admin (operator), Dosen, Mahasiswa |
| Jumlah halaman | 13 (1 login + 1 template + 11 halaman aplikasi) |
| Repository | https://github.com/whoskavic/LMS |

---

## 2. Cara Menjalankan

1. Buka `index.html` langsung di browser (Chrome / Edge / Firefox versi terbaru), atau jalankan lewat Live Server di VS Code.
2. Klik salah satu **akun demo** di halaman login untuk mengisi form otomatis, lalu klik **Sign in**.
3. Semua perubahan (course, user, progress, nilai) tersimpan di browser. Untuk mengembalikan data awal: klik **Reset demo data** di halaman login atau di halaman **Profile**.

> Tidak butuh internet, kecuali font Inter (jika offline, otomatis memakai font sistem).

### Akun demo

| Role | Email | Password | Halaman awal |
|---|---|---|---|
| Admin | admin@learnova.ac.id | admin123 | Dashboard Admin |
| Dosen | budi@learnova.ac.id | dosen123 | Dashboard Dosen |
| Mahasiswa | alex@learnova.ac.id | student123 | Dashboard Mahasiswa |

Akun lain: semua dosen memakai password `dosen123` dan semua mahasiswa `student123` (lihat menu **Users** sebagai admin).

---

## 3. Fitur per Role

### 👨‍💼 Admin (Operator)

| Halaman | Fitur |
|---|---|
| **Dashboard** (`dashboard.html`) | 4 kartu ringkasan (course, mahasiswa, dosen, pending), grafik enrollment & completion, daftar *Pending approvals* dengan tombol Approve/Reject, status sistem, aktivitas terbaru, export metrics CSV |
| **Users** (`users.html`) | Tab Mahasiswa / Dosen / Admin dengan jumlah, cari, filter departemen & status, sortir kolom, pagination, tambah & edit user lewat modal (validasi), aktif/nonaktifkan akun, hapus (dengan konfirmasi), export CSV |
| **Courses** (`data-master.html`) | Semua course, cari, filter kategori/status/dosen, sortir kolom, pagination, Approve/Reject (Pending), Archive/Restore, Delete (hapus juga modul, quiz, enrollment), export CSV |
| **Detail Course** (`course-detail.html`) | Lihat overview, modul, quiz, dan nilai mahasiswa (read-only), tombol Approve/Reject/Archive/Restore |
| **Reports** (`laporan.html`) | Rata-rata progress, rata-rata skor quiz, completion rate, grafik course per kategori & skor quiz per course, tabel progress & nilai (filter, sortir, pagination), aktivitas sistem, **cetak** (semua baris ikut tercetak) & export CSV |

Aturan: admin tidak bisa menonaktifkan/menghapus akunnya sendiri; dosen yang masih punya course tidak bisa dihapus; user nonaktif tidak bisa login.

### 👩‍🏫 Dosen

| Halaman | Fitur |
|---|---|
| **Dashboard** (`lecturer-dashboard.html`) | Kartu jumlah course (per status), mahasiswa, rata-rata progress, rata-rata skor quiz; grafik progress & skor per course; daftar course saya; percobaan quiz terbaru |
| **My Courses** (`data-master.html`) | Hanya course milik dosen, cari/filter/sortir, Edit, Delete (hanya Draft/Pending/Rejected) |
| **New Course / Edit** (`form.html`) | Validasi 8 field, kode course unik & otomatis huruf besar, penghitung karakter, preview thumbnail (drag & drop), status perubahan belum tersimpan, **Save draft** atau **Submit for approval** (status Pending) |
| **Detail Course** (`course-detail.html`) | 4 tab (bisa pakai panah keyboard): **Overview** (statistik, detail, grafik distribusi progress) · **Modules** (tambah/edit modal, urutkan naik/turun, hapus) · **Quizzes** (editor soal pilihan ganda, validasi opsi & kunci jawaban) · **Students & Grades** (isi nilai akhir 0–100, grade huruf otomatis, simpan, export CSV) |

### 🎓 Mahasiswa

| Halaman | Fitur |
|---|---|
| **Dashboard** (`student-dashboard.html`) | Ringkasan per semester (total course, progress, IPK dari nilai dosen), tampilan Grid / Table, filter semester & status, pencarian, modal Continue course / View final grade |
| **Course** (`course.html`) | Daftar modul (selesai / berjalan / terkunci), video demo (simulasi 3 detik), materi dari dosen, checklist tugas latihan, **Mark as complete**, navigasi Previous/Next, daftar quiz dengan skor terbaik, pencarian modul |
| **Quiz** (`quiz.html`) | Intro (jumlah soal, batas waktu, nilai lulus, sisa percobaan), pengerjaan 1 soal per layar, **timer** hitung mundur (submit otomatis saat habis), navigasi nomor soal, pintasan keyboard (1–4, ← →), konfirmasi submit dengan peringatan soal kosong, hasil (cincin skor, lulus/tidak), **review jawaban** benar/salah, batas percobaan |

### Semua role

| Halaman | Fitur |
|---|---|
| **Login** (`index.html`) | Validasi email & password, pesan akun salah/nonaktif, tampil/sembunyikan password, akun demo klik-untuk-isi, tombol tema, reset data |
| **Profile** (`profile.html`) | Kartu profil, edit nama & departemen, ganti password (password lama harus benar, minimal 8 karakter huruf + angka, konfirmasi harus sama), pilihan tema Light/Dark/System, reset data demo |
| **Layout** | Sidebar dengan menu sesuai role, sidebar off-canvas di mobile, search, notifikasi dropdown, tombol dark mode, logout dengan konfirmasi |

---

## 4. Interaktivitas JavaScript (sesuai kriteria penilaian)

| Kriteria | Implementasi |
|---|---|
| Toggle sidebar | Tombol menu di mobile, tutup dengan overlay / tombol ✕ / Esc |
| Modal konfirmasi | Hapus course/user/modul/quiz, approve/reject/archive, logout, submit quiz, reset data, batal form |
| Validasi input | Login, form course, form user, form modul, editor quiz, input nilai, ganti password |
| Grafik (Chart.js) | 5 grafik di dashboard admin, dashboard dosen, detail course, dan laporan — warna menyesuaikan tema |
| Manipulasi mock data | CRUD course, user, modul, quiz; progress modul; percobaan quiz; nilai akhir — semua tersimpan di `localStorage` |
| Lainnya | Sortir kolom tabel, pagination, filter & pencarian live, tab, toast, drag & drop thumbnail, timer quiz, pintasan keyboard, dark mode, export CSV, cetak laporan |

---

## 5. Struktur Folder

```
lms/
├── index.html                  ← Login
├── docs/
│   ├── PERANCANGAN.md          ← Milestone 1
│   └── FITUR.md                ← Rekap fitur (dokumen ini)
├── assets/
│   ├── css/style.css           ← Design token, layout, komponen, dark mode, responsive, print
│   ├── img/favicon.svg
│   └── js/
│       ├── theme.js            ← Tema terang/gelap (dimuat di <head>)
│       ├── data.js             ← Mock data (seed)
│       ├── store.js            ← "Database" localStorage + logika (login, progress, quiz, nilai)
│       ├── main.js             ← Guard role, sidebar, ikon, modal, toast, sortir, pagination, grafik
│       ├── vendor/chart.umd.min.js
│       └── pages/              ← Satu script per halaman
└── pages/
    ├── layout.html             ← Template master (Milestone 2)
    ├── dashboard.html          ← Admin
    ├── users.html              ← Admin
    ├── laporan.html            ← Admin
    ├── data-master.html        ← Admin & Dosen
    ├── course-detail.html      ← Admin & Dosen
    ├── lecturer-dashboard.html ← Dosen
    ├── form.html               ← Dosen
    ├── student-dashboard.html  ← Mahasiswa
    ├── course.html             ← Mahasiswa
    ├── quiz.html               ← Mahasiswa
    └── profile.html            ← Semua role
```

---

## 6. Model Data & Penyimpanan

- **`data.js`** berisi data mentah: 1 admin, 11 dosen, 24 mahasiswa, 13 course, topik materi, bank soal quiz, dan progress mahasiswa demo.
- **`store.js`** merakit data tersebut menjadi satu "database" (users, courses, modules, quizzes, enrollments, activities) dan menyimpannya di `localStorage` dengan key `learnova.db`. Data mahasiswa lain dibuat dengan angka acak ber-*seed*, sehingga hasilnya selalu sama di setiap browser.
- Key lain: `learnova.session` (user yang login), `learnova.theme` (tema), `learnova.flash` (pesan setelah pindah halaman).
- **Relasi penting:** modul, quiz, dan nilai yang dibuat dosen langsung terlihat oleh mahasiswa; course baru dari dosen baru tampil setelah disetujui admin.
- **Status course:** Draft → Pending (diajukan) → Active (disetujui) / Rejected (ditolak) → Archived.
- **Konversi nilai:** A ≥ 85 · A- ≥ 80 · B+ ≥ 75 · B ≥ 70 · B- ≥ 65 · C+ ≥ 60 · C ≥ 55 · D ≥ 45 · E < 45. IPK = rata-rata bobot (A = 4.0 … E = 0).

---

## 7. Aksesibilitas & Responsif

- Tag semantik (`header`, `nav`, `main`, `aside`, `section`, `article`, `footer`), link *Skip to content*
- Label untuk semua input, pesan error terhubung lewat `aria-describedby` / `aria-invalid`
- `aria-sort` pada header tabel, `role="tab"` + panah keyboard pada tab, `role="dialog"` pada modal, fokus kembali setelah modal ditutup
- Breakpoint 1024px (sidebar off-canvas, grid 1 kolom) dan 640px (tabel berubah jadi kartu, tombol penuh)
- Mode cetak: sidebar, header, dan tombol disembunyikan

---

## 8. Checklist Milestone

| Milestone | Syarat | Status |
|---|---|---|
| 1 | `PERANCANGAN.md`: menu, ERD Mermaid, link Figma & Stitch | ✅ (diperbarui sesuai implementasi 3 role) |
| 2 | Slicing Figma → HTML/CSS, layout responsif `layout.html` | ✅ `pages/layout.html` |
| 3 | Dashboard (cards + Chart.js) | ✅ Admin, Dosen, Mahasiswa |
| 3 | Data tabel (Tambah, Edit, Hapus) | ✅ Courses, Users, Modul, Quiz |
| 3 | Form input/edit + validasi JS | ✅ Course, User, Modul, Quiz, Nilai, Password |
| 3 | Laporan / detail (cetak / rangkuman) | ✅ Reports + Detail Course |
| 3 | Interaktivitas client-side | ✅ Lihat bagian 4 |
| 3 | Upload ke GitHub / Vercel | ✅ GitHub: [whoskavic/LMS](https://github.com/whoskavic/LMS) · Vercel: opsional, lihat bagian 10 |

---

## 9. Keterbatasan

- Tidak ada backend: data hanya tersimpan di browser yang sedang dipakai, dan hilang bila data situs dihapus.
- Password disimpan sebagai teks biasa di mock data (hanya untuk demo, bukan praktik keamanan nyata).
- Video materi hanyalah simulasi, dan thumbnail course hanya berupa preview (tidak disimpan).
- Mahasiswa belum bisa mendaftar (enroll) course baru sendiri — enrollment berasal dari data seed.

---

## 10. Repository & Deploy

Source code: **https://github.com/whoskavic/LMS**

Menjalankan dari repository:

```bash
git clone https://github.com/whoskavic/LMS.git
cd LMS
# buka index.html di browser (atau pakai Live Server)
```

Deploy ke Vercel (opsional, agar bisa diakses lewat link publik saat demo):

1. Masuk ke vercel.com dengan akun GitHub.
2. **Add New → Project → Import** repository `whoskavic/LMS`.
3. Framework Preset **Other**, tanpa build command dan output directory.
4. Klik **Deploy**. Aplikasi langsung jalan karena seluruhnya file statis.
