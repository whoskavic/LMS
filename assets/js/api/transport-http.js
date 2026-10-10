// Learnova LMS — transport HTTP (fetch ke backend FastAPI)
// Disiapkan untuk integrasi backend; belum dipakai selama Api.config.transport = "local".
// Backend diharapkan mengikuti kontrak yang sama dengan MockServer (transport-local.js):
//   - auth  : header "Authorization: Bearer <token>"
//   - error : body JSON { error: { code, message, fields? } } dengan HTTP status yang sesuai

const HttpTransport = {
  async send({ method, path, query, body, token }) {
    const url = new URL(Api.config.baseUrl.replace(/\/$/, "") + path, location.origin);
    Object.entries(query || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));

    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const error = data?.error || {};
      throw new ApiError(
        response.status,
        error.code || `HTTP_${response.status}`,
        error.message || response.statusText || "Request failed.",
        error.fields
      );
    }
    return data;
  },
};
