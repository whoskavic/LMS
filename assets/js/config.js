// Learnova LMS — konfigurasi frontend (dimuat sebelum api/client.js)
//   transport : "http"  → backend FastAPI (satu-satunya mode yang dipakai halaman)
//               MockServer lama (transport-local.js) tidak lagi dimuat halaman; disimpan sebagai
//               spesifikasi kontrak yang diuji `node --test` (tests/mockserver.test.js).
//   apiBaseUrl: URL dasar API, termasuk prefix /api/v1. Ubah saat deploy (lihat README › Deploy).
const AppConfig = {
  transport: "http",
  apiBaseUrl: "http://localhost:8000/api/v1",
};
