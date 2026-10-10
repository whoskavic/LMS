// Learnova LMS — klien API
// Halaman hanya berbicara dengan backend lewat objek global `Api` (lihat services.js).
// Setiap fungsi mengembalikan Promise. Transport bisa ditukar tanpa mengubah halaman:
//   - "http" : fetch ke backend FastAPI (transport-http.js) — default, lihat assets/js/config.js
//   - "local": MockServer di browser (transport-local.js) — mock data tanpa backend
//
// Kontrak:
//   sukses list   → { items, total, page, pageSize }
//   sukses detail → objek entity
//   gagal         → throw ApiError { status, code, message, fields? }
// Konvensi: ID = string opaque · datetime = ISO 8601 UTC ("…Z") · tanggal kalender = "YYYY-MM-DD"

class ApiError extends Error {
  /**
   * @param {number} status  HTTP status (0 = tidak bisa menghubungi server)
   * @param {string} code    kode mesin, mis. "VALIDATION", "NOT_FOUND"
   * @param {string} message pesan untuk pengguna (bahasa Inggris, seperti UI)
   * @param {Object<string,string>} [fields] pesan error per field (400/409)
   */
  constructor(status, code, message, fields) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (fields && Object.keys(fields).length) this.fields = fields;
  }
}

const Api = {
  config: {
    // Nilai dari assets/js/config.js (AppConfig); default "local" bila config tidak dimuat (mis. test node)
    transport: typeof AppConfig !== "undefined" ? AppConfig.transport : "local", // "local" | "http"
    baseUrl: typeof AppConfig !== "undefined" ? AppConfig.apiBaseUrl : "/api/v1", // dipakai transport http
    mock: "off", // "off" | "slow" | "fail" — simulasi di transport local (?mock=…)
    slowMs: 1200,
  },

  /* ---------- Token sesi (satu-satunya data auth yang disimpan di browser) ---------- */
  session: {
    KEY: "learnova.session",
    token() {
      try {
        return JSON.parse(localStorage.getItem(this.KEY))?.token ?? null;
      } catch {
        return null;
      }
    },
    set(token) {
      try {
        localStorage.setItem(this.KEY, JSON.stringify({ token }));
      } catch {}
    },
    clear() {
      try {
        localStorage.removeItem(this.KEY);
      } catch {}
    },
  },

  /**
   * Kirim request ke transport aktif.
   * @param {"GET"|"POST"|"PATCH"|"PUT"|"DELETE"} method
   * @param {string} path  mis. "/courses/crs_8"
   * @param {{ query?: object, body?: object }} [options]
   */
  async request(method, path, { query, body } = {}) {
    const transport = this.config.transport === "http" ? HttpTransport : LocalTransport;
    try {
      return await transport.send({ method, path, query: compactQuery(query), body, token: this.session.token() });
    } catch (err) {
      const error = err instanceof ApiError ? err : new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection and try again.");
      if (!(err instanceof ApiError)) console.error(err);
      if (error.status === 401) this.session.clear();
      throw error;
    }
  },

  get(path, query) {
    return this.request("GET", path, { query });
  },
  post(path, body) {
    return this.request("POST", path, { body });
  },
  patch(path, body) {
    return this.request("PATCH", path, { body });
  },
  put(path, body) {
    return this.request("PUT", path, { body });
  },
  del(path) {
    return this.request("DELETE", path);
  },
};

// Buang parameter kosong agar query string bersih (dan sama di kedua transport)
function compactQuery(query) {
  if (!query) return {};
  return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

// Encode segmen path (ID opaque bisa berisi karakter apa pun)
function apiPath(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? encodeURIComponent(values[i]) : ""), "");
}

// Mode simulasi ?mock=slow | ?mock=fail bertahan selama tab terbuka; ?mock=off mematikannya
(function initMockMode() {
  if (typeof location === "undefined") return;
  try {
    const param = new URLSearchParams(location.search).get("mock");
    if (param === "off") sessionStorage.removeItem("learnova.mock");
    else if (param === "slow" || param === "fail") sessionStorage.setItem("learnova.mock", param);
    Api.config.mock = sessionStorage.getItem("learnova.mock") || "off";
  } catch {}
})();
