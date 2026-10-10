// Learnova LMS — konfigurasi frontend (dimuat sebelum api/client.js)
//   transport : "http"  → backend FastAPI (default)
//               "local" → MockServer di browser (mock data localStorage, tanpa backend)
//   apiBaseUrl: URL dasar API, termasuk prefix /api/v1. Ubah saat deploy (lihat README › Deploy).
const AppConfig = {
  transport: "http",
  apiBaseUrl: "http://localhost:8000/api/v1",
};
