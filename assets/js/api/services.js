// Learnova LMS — service API yang dipanggil halaman
// Satu fungsi = satu endpoint REST. Semua mengembalikan Promise dan melempar ApiError bila gagal.
// Query list yang umum: { q, sort ("title" | "-title"), page, pageSize } + filter per endpoint.

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
    update: (patch) => Api.patch("/me", patch), // { name }
    stats: () => Api.get("/me/stats"),
    /** "Start teaching": student → instructor ({ headline?, bio? }) */
    becomeInstructor: (data = {}) => Api.post("/me/become-instructor", data),
  },

  users: {
    list: (query) => Api.get("/users", query), // { role, q, status, sort, page, pageSize }
    get: (id) => Api.get(apiPath`/users/${id}`),
    create: (data) => Api.post("/users", data), // { role, name, email, status, password }
    update: (id, patch) => Api.patch(apiPath`/users/${id}`, patch),
    setStatus: (id, status) => Api.patch(apiPath`/users/${id}`, { status }),
    remove: (id) => Api.del(apiPath`/users/${id}`),
  },

  courses: {
    list: (query) => Api.get("/courses", query), // { q, status, category, instructorId, open, sort, page, pageSize }
    get: (id) => Api.get(apiPath`/courses/${id}`),
    stats: (id) => Api.get(apiPath`/courses/${id}/stats`),
    create: (data) => Api.post("/courses", data),
    update: (id, patch) => Api.patch(apiPath`/courses/${id}`, patch),
    remove: (id) => Api.del(apiPath`/courses/${id}`),
    /** action: "submit" | "approve" | "reject" | "archive" | "restore" */
    transition: (id, action, reason) => Api.post(apiPath`/courses/${id}/transitions`, { action, ...(reason ? { reason } : {}) }),
    statusLogs: (id) => Api.get(apiPath`/courses/${id}/status-logs`),
    /** Peserta course (read-only): progress, skor quiz terbaik, status selesai */
    students: (id, query) => Api.get(apiPath`/courses/${id}/students`, query),
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

  // Attempt quiz — soal tanpa kunci, skor dihitung server, kunci hanya muncul setelah submit
  attempts: {
    start: (quizId) => Api.post(apiPath`/quizzes/${quizId}/attempts`),
    mine: (quizId) => Api.get(apiPath`/quizzes/${quizId}/attempts`),
    get: (attemptId) => Api.get(apiPath`/attempts/${attemptId}`),
    /** answers: { [questionId]: optionId } */
    save: (attemptId, answers) => Api.patch(apiPath`/attempts/${attemptId}`, { answers }),
    submit: (attemptId, answers) => Api.post(apiPath`/attempts/${attemptId}/submit`, { answers }),
  },

  enrollments: {
    mine: (query) => Api.get("/me/enrollments", query), // { status, q, sort }
    open: (query) => Api.get("/courses", { ...query, open: true }),
    enroll: (courseId) => Api.post(apiPath`/courses/${courseId}/enrollments`),
    /** Enrollment student yang login di course tertentu (+ completedModuleIds) */
    forCourse: (courseId) => Api.get(apiPath`/courses/${courseId}/enrollment`),
    completeModule: (enrollmentId, moduleId) => Api.post(apiPath`/enrollments/${enrollmentId}/completed-modules`, { moduleId }),
  },


  reports: {
    summary: () => Api.get("/reports/summary"),
    enrollments: (query) => Api.get("/reports/enrollments", query), // { courseId, status, q, sort, page, pageSize }
    /** CSV dari server (semua baris sesuai filter) → unduh sebagai file */
    async downloadCsv(query) {
      const blob = await Api.download("/reports/enrollments.csv", query);
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), { href: url, download: "learnova-learning-report.csv" });
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  },

  dashboard: {
    admin: () => Api.get("/dashboard/admin"),
    instructor: () => Api.get("/dashboard/instructor"),
    student: () => Api.get("/dashboard/student"),
  },

  certificates: {
    verify: (code) => Api.get(apiPath`/certificates/${code}`),
  },

  activities: {
    recent: (limit = 5) => Api.get("/activities", { pageSize: limit }),
  },

  meta: {
    categories: () => Api.get("/meta/categories"),
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
