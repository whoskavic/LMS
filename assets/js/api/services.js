// Learnova LMS — service API yang dipanggil halaman
// Satu fungsi = satu endpoint REST. Semua mengembalikan Promise dan melempar ApiError bila gagal.
// Query list yang umum: { q, sort ("title" | "-title"), page, pageSize } + filter per endpoint.
// Endpoint attempt quiz (start / simpan jawaban / submit) ditambahkan di QZ-01.

Object.assign(Api, {
  auth: {
    /** @returns {Promise<{ token: string, user: object }>} token disimpan otomatis */
    async login(email, password) {
      const result = await Api.post("/auth/login", { email, password });
      Api.session.set(result.token);
      return result;
    },
    async logout() {
      try {
        await Api.post("/auth/logout");
      } finally {
        Api.session.clear();
      }
    },
    /** Registrasi publik (role: "student" | "instructor"); token disimpan otomatis */
    async register(data) {
      const result = await Api.post("/auth/register", data);
      Api.session.set(result.token);
      return result;
    },
    me: () => Api.get("/auth/me"),
    changePassword: (current, next) => Api.post("/auth/password", { current, next }),
  },

  profile: {
    update: (patch) => Api.patch("/me", patch), // { name, department }
    stats: () => Api.get("/me/stats"),
  },

  users: {
    list: (query) => Api.get("/users", query), // { role, q, department, status, sort, page, pageSize }
    get: (id) => Api.get(apiPath`/users/${id}`),
    create: (data) => Api.post("/users", data), // { role, name, email, idNumber, department, status, password }
    update: (id, patch) => Api.patch(apiPath`/users/${id}`, patch),
    setStatus: (id, status) => Api.patch(apiPath`/users/${id}`, { status }),
    remove: (id) => Api.del(apiPath`/users/${id}`),
  },

  courses: {
    list: (query) => Api.get("/courses", query), // { q, status, category, semester, instructorId, open, sort, page, pageSize }
    get: (id) => Api.get(apiPath`/courses/${id}`),
    stats: (id) => Api.get(apiPath`/courses/${id}/stats`),
    create: (data) => Api.post("/courses", data),
    update: (id, patch) => Api.patch(apiPath`/courses/${id}`, patch),
    remove: (id) => Api.del(apiPath`/courses/${id}`),
    /** action: "submit" | "approve" | "reject" | "archive" | "restore" */
    transition: (id, action, reason) => Api.post(apiPath`/courses/${id}/transitions`, { action, ...(reason ? { reason } : {}) }),
    statusLogs: (id) => Api.get(apiPath`/courses/${id}/status-logs`),
  },

  // Katalog publik (tanpa login): hanya course Active
  catalog: {
    list: (query) => Api.get("/catalog/courses", query), // { q, category, sort, page, pageSize }
    get: (idOrSlug) => Api.get(apiPath`/catalog/courses/${idOrSlug}`),
  },

  categories: {
    list: () => Api.get("/categories"),
    create: (name) => Api.post("/categories", { name }),
    update: (id, name) => Api.patch(apiPath`/categories/${id}`, { name }),
    remove: (id) => Api.del(apiPath`/categories/${id}`),
  },

  modules: {
    list: (courseId) => Api.get(apiPath`/courses/${courseId}/modules`),
    create: (courseId, data) => Api.post(apiPath`/courses/${courseId}/modules`, data),
    update: (id, patch) => Api.patch(apiPath`/modules/${id}`, patch),
    remove: (id) => Api.del(apiPath`/modules/${id}`),
    reorder: (courseId, ids) => Api.put(apiPath`/courses/${courseId}/modules/order`, { ids }),
  },

  quizzes: {
    list: (courseId) => Api.get(apiPath`/courses/${courseId}/quizzes`),
    get: (id) => Api.get(apiPath`/quizzes/${id}`),
    create: (courseId, data) => Api.post(apiPath`/courses/${courseId}/quizzes`, data),
    update: (id, patch) => Api.patch(apiPath`/quizzes/${id}`, patch),
    remove: (id) => Api.del(apiPath`/quizzes/${id}`),
  },

  enrollments: {
    mine: (query) => Api.get("/me/enrollments", query), // { semester, status, q, sort }
    open: (query) => Api.get("/courses", { ...query, open: true }),
    enroll: (courseId) => Api.post(apiPath`/courses/${courseId}/enrollments`),
    addStudents: (courseId, studentIds) => Api.post(apiPath`/courses/${courseId}/enrollments/batch`, { studentIds }),
    remove: (id) => Api.del(apiPath`/enrollments/${id}`),
    completeModule: (enrollmentId, moduleId) => Api.post(apiPath`/enrollments/${enrollmentId}/completed-modules`, { moduleId }),
  },

  grades: {
    list: (courseId, query) => Api.get(apiPath`/courses/${courseId}/grades`, query),
    /** grades: [{ enrollmentId, finalScore: number | null }] */
    save: (courseId, grades) => Api.put(apiPath`/courses/${courseId}/grades`, { grades }),
  },

  reports: {
    summary: () => Api.get("/reports/summary"),
    enrollments: (query) => Api.get("/reports/enrollments", query), // { courseId, status, q, sort, page, pageSize }
  },

  activities: {
    recent: (limit = 5) => Api.get("/activities", { pageSize: limit }),
  },

  meta: {
    categories: () => Api.get("/meta/categories"),
    departments: (role) => Api.get("/meta/departments", { role }),
    instructors: () => Api.get("/meta/instructors"),
    notifications: () => Api.get("/meta/notifications"),
    systemStatus: () => Api.get("/meta/system-status"),
    enrollmentChart: () => Api.get("/meta/enrollment-chart"),
  },

  // Hanya tersedia di transport local (data demo)
  dev: {
    reset: () => Api.post("/dev/reset"),
  },
});
