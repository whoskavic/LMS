// Learnova LMS — konfigurasi frontend (dimuat sebelum api/client.js)
//
// apiBaseUrl dipilih otomatis:
//   - dibuka dari localhost / 127.0.0.1 / file:// → backend lokal (docker compose) di port 8000
//   - selain itu (static site produksi)          → PRODUCTION_API_URL di bawah
// Saat deploy: ganti PRODUCTION_API_URL dengan URL backend Anda (lihat README › Deploy), termasuk /api/v1.
// transport: "http" (backend FastAPI). MockServer lama (transport-local.js) tidak lagi dimuat halaman;
// file tersebut disimpan sebagai spesifikasi kontrak yang diuji `node --test`.
const PRODUCTION_API_URL = "https://learnova-api.onrender.com/api/v1";

const AppConfig = (() => {
  const local = typeof location === "undefined" || location.protocol === "file:" || ["localhost", "127.0.0.1", ""].includes(location.hostname);
  return {
    transport: "http",
    apiBaseUrl: local ? "http://localhost:8000/api/v1" : PRODUCTION_API_URL,
  };
})();
