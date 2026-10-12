# Misi
Kamu bekerja secara otonom di repo Learnova LMS (branch utama: `master`). Buat SATU PR kecil agar aplikasi bisa di-deploy sepenuhnya di Vercel:
- Project Vercel 1 `learnova-api`: Root Directory `backend/`, FastAPI berjalan sebagai Vercel Function (zero-config, entrypoint `app/main.py` dengan objek `app`).
- Project Vercel 2 `learnova-web`: Root Directory repo root, static site tanpa build.
- Database: Neon Postgres lewat Vercel Marketplace. Integrasi Neon menyuntikkan `DATABASE_URL` (pooled) dan `DATABASE_URL_UNPOOLED` (direct).

Kerjakan dari awal sampai akhir: branch, commit, push, buka PR, tunggu CI hijau, lalu merge (squash). Jangan mengubah fitur atau perilaku aplikasi di luar yang tertulis di sini. Deployment Docker/Render/Railway yang sudah ada HARUS tetap berfungsi.

# Konteks
- Image Docker produksi menjalankan `start.sh` (alembic upgrade head → seed opsional → uvicorn). Di Vercel tidak ada `start.sh`, jadi migrasi dan seed dipindah ke build step Vercel.
- Vercel menjalankan perintah build Python dari `[tool.vercel.scripts] build` di `pyproject.toml`, setelah dependency terpasang. Environment variable project tersedia saat build.
- Vercel bisa membaca dependency dari `pyproject.toml` maupun `requirements.txt`. Agar tidak ambigu, dependency runtime harus ada di keduanya dengan versi yang sama.
- Function serverless + connection pooler (PgBouncer mode transaction di Neon) tidak cocok dengan pool koneksi SQLAlchemy yang panjang umurnya dan prepared statement otomatis psycopg 3.

# Perubahan yang diminta
1. `backend/pyproject.toml`
   - Tambahkan `dependencies = [...]` di `[project]` berisi PERSIS paket runtime dari `requirements.txt` (versi sama). `uvicorn` boleh tetap ada.
   - Tambahkan:
     [tool.vercel.scripts]
     build = "python vercel_build.py"
   - Jangan mengubah konfigurasi ruff/pytest.
2. `backend/vercel_build.py` (baru)
   - Jika `DATABASE_URL_UNPOOLED` ada, pakai nilainya sebagai `DATABASE_URL` untuk proses build ini (set `os.environ` SEBELUM mengimpor modul `app`), karena migrasi sebaiknya lewat koneksi direct.
   - Jalankan `alembic upgrade head` (lewat API `alembic.command` dengan `alembic.ini`).
   - Jika `SEED_DEMO=true`, jalankan seed yang sama dengan `python -m app.seed` (idempoten, dilewati bila data sudah ada).
   - Cetak log yang jelas; exit non-zero bila migrasi gagal agar deploy ikut gagal.
3. `backend/app/db.py`
   - Saat berjalan di Vercel (env `VERCEL` ada), buat engine dengan `poolclass=NullPool`. Di luar Vercel, perilaku pool tetap seperti sekarang.
   - Untuk semua environment, tambahkan `connect_args={"prepare_threshold": None}` agar kompatibel dengan PgBouncer mode transaction.
   - Pastikan semua test tetap hijau.
4. `backend/app/config.py`
   - Tidak perlu field baru. Pastikan URL Neon dengan query string (mis. `?sslmode=require&channel_binding=require`) tetap dinormalisasi ke `postgresql+psycopg://` dengan benar. Tambahkan test untuk kasus ini di `tests/test_config.py`.
5. `assets/js/config.js`
   - Jangan hardcode URL Vercel yang belum diketahui. Ubah komentar agar menjelaskan: untuk Vercel, isi `PRODUCTION_API_URL` dengan `https://<domain-learnova-api>.vercel.app/api/v1`. Biarkan nilai default saat ini bila tidak ada URL pasti.
6. `README.md` bagian Deploy
   - Tambahkan "Opsi Vercel (disarankan untuk demo kuliah)" sebagai opsi PERTAMA, berisi langkah:
     a. Import repo ke Vercel sebagai project `learnova-api`, Root Directory `backend`, framework FastAPI (terdeteksi otomatis), Build Command dibiarkan kosong.
     b. Tab Storage → buat/hubungkan database Neon ke project `learnova-api` (environment Production, Preview, Development).
     c. Environment variable: `APP_ENV=production`, `JWT_SECRET` (acak ≥ 32 karakter), `JWT_EXPIRES_MINUTES=720`, `SEED_DEMO=true`, `CORS_ORIGINS` (diisi setelah langkah e).
     d. Redeploy, lalu cek `https://<api>.vercel.app/api/v1/health` → status ok.
     e. Isi `PRODUCTION_API_URL` di `assets/js/config.js`, push, lalu import repo lagi sebagai project `learnova-web` dengan Root Directory repo root, Framework Preset "Other", tanpa Build Command, Output Directory `.`.
     f. Isi `CORS_ORIGINS` di `learnova-api` dengan domain `learnova-web` (tanpa garis miring di akhir), lalu redeploy `learnova-api`.
     g. Catatan: build menjalankan migrasi + seed otomatis; reset data demo dengan menjalankan `python -m app.seed --reset` dari lokal memakai `DATABASE_URL_UNPOOLED` dari Neon.
   - Perbarui tabel Environment variable bila ada variabel baru yang dibaca (`DATABASE_URL_UNPOOLED`, `VERCEL`).
7. `docs/DECISIONS.md`: tambahkan ADR singkat "Deploy demo kuliah di Vercel + Neon" (Konteks → Opsi: Vercel+Neon / Render blueprint / Railway → Keputusan → Konsekuensi: tanpa server yang tidur, migrasi saat build, NullPool + tanpa prepared statement, Hobby plan hanya untuk non-komersial).

# Aturan
- Branch: `chore/vercel-deploy` dari `master` terbaru. Conventional Commits.
- Sebelum merge: `ruff check . && ruff format --check .`, `alembic upgrade head`, `pytest` di `backend/`, dan `node --test` di root harus hijau. Uji juga `python vercel_build.py` terhadap database lokal (dengan dan tanpa `SEED_DEMO=true`, serta dengan `DATABASE_URL_UNPOOLED` diset).
- Pastikan image Docker masih bisa di-build dan `start.sh` tidak berubah perilakunya.
- Deskripsi PR (bahasa Indonesia): ringkasan, perubahan, cara menguji, baris "README: diperbarui bagian Deploy", baris "ERD: tidak ada perubahan skema".
- Merge squash hanya jika CI hijau; maksimal 3 percobaan perbaikan CI.
- DILARANG: commit secret, force push ke master, menonaktifkan test, mengubah skema database.

# Laporan akhir
Tulis ringkasan PR (link), daftar file yang berubah, dan checklist langkah manual di dashboard Vercel yang harus dilakukan pemilik repo.
