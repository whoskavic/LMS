// Learnova LMS — transport local: MockServer di browser
//
// MockServer adalah SPESIFIKASI YANG BISA DIJALANKAN untuk backend FastAPI: semua aturan bisnis dan
// otorisasi (role, kepemilikan, status course, kapasitas, validasi field) diputuskan di sini, bukan di
// halaman. Data disimpan lewat DB/Store (store.js) di localStorage.
// Tidak ada mekanisme anti-tamper di klien — keamanan sesungguhnya adalah tanggung jawab backend.
//
// Mode simulasi (Api.config.mock): "slow" menambah latensi, "fail" menggagalkan semua request
// kecuali /auth/* (agar halaman tetap bisa dibuka dan error state tiap view bisa didemokan).

const LocalTransport = {
  async send(request) {
    const mode = Api.config.mock;
    await new Promise((resolve) => setTimeout(resolve, mode === "slow" ? Api.config.slowMs : 0));
    if (mode === "fail" && !request.path.startsWith("/auth/")) {
      throw new ApiError(503, "MOCK_FAILURE", "The server is not responding (simulated with ?mock=fail). Open the page with ?mock=off to stop the simulation.");
    }
    return MockServer.handle(request);
  },
};

const MockServer = (() => {
  /* =======================================================================
     Utilitas
     ======================================================================= */
  const routes = [];
  const route = (method, pattern, options, handler) => {
    const keys = [];
    const regex = new RegExp(
      "^" + pattern.replace(/:([a-zA-Z]+)/g, (_, key) => (keys.push(key), "([^/]+)")) + "$"
    );
    routes.push({ method, regex, keys, handler, ...options });
  };

  const fail = (status, code, message, fields) => {
    throw new ApiError(status, code, message, fields);
  };
  const notFound = (what = "Resource") => fail(404, "NOT_FOUND", `${what} not found.`);
  const forbidden = (message = "You do not have permission to do this.") => fail(403, "FORBIDDEN", message);
  const conflict = (code, message, fields) => fail(409, code, message, fields);

  // Lempar 400 bila ada pesan error di salah satu field
  const assertValid = (fields) => {
    const errors = Object.fromEntries(Object.entries(fields).filter(([, message]) => message));
    if (Object.keys(errors).length) fail(400, "VALIDATION", "Please fix the highlighted fields.", errors);
  };

  const clone = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));
  const pick = (source, keys) => Object.fromEntries(keys.filter((k) => source?.[k] !== undefined).map((k) => [k, source[k]]));
  const text = (value) => (typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim());
  const isInt = (value) => Number.isInteger(typeof value === "string" && value.trim() !== "" ? Number(value) : value);
  const bool = (value) => value === true || value === "true";

  const log = (user, action) =>
    DB.insert("activities", { time: Domain.nowIso(), actor: user ? user.name : "System", actorId: user?.id ?? null, action });

  // Urutkan (nulls selalu di akhir); sort = "title" atau "-title" (descending)
  function sortItems(items, sort) {
    if (!sort) return items;
    const desc = sort.startsWith("-");
    const key = desc ? sort.slice(1) : sort;
    const factor = desc ? -1 : 1;
    return [...items].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * factor;
    });
  }

  // Cari teks di beberapa field (case-insensitive)
  const search = (items, q, fields) => {
    const needle = text(q).toLowerCase();
    if (!needle) return items;
    return items.filter((item) => fields.some((f) => String(item[f] ?? "").toLowerCase().includes(needle)));
  };

  // Bentuk respons list standar. page di-clamp ke halaman terakhir.
  function paginate(items, query = {}, defaultSort) {
    const sorted = sortItems(items, query.sort || defaultSort);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 50, 1), 200);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const page = Math.min(Math.max(Number(query.page) || 1, 1), totalPages);
    return { items: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length, page, pageSize };
  }
  const all = (items) => ({ items, total: items.length, page: 1, pageSize: Math.max(items.length, 1) });

  /* =======================================================================
     Aturan validasi (sama dengan yang ditampilkan di form)
     ======================================================================= */
  const ROLES = ["admin", "instructor", "student"];
  const ROLE_LABEL = { admin: "administrator", instructor: "instructor", student: "student" };
  const ID_RULES = {
    student: { label: "NIM", pattern: /^\d{5,10}$/, hint: "5–10 digits" },
    instructor: { label: "NIDN", pattern: /^\d{10}$/, hint: "10 digits" },
    admin: { label: "Staff ID", pattern: /^[A-Z]{3}-\d{3}$/, hint: "format ADM-001" },
  };
  const COURSE_STATUSES = ["Draft", "Pending", "Active", "Rejected", "Archived"];
  const COURSE_COLORS = ["#c7d2fe", "#bbf7d0", "#fbcfe8", "#fef3c7", "#bae6fd", "#ddd6fe", "#fed7aa", "#cffafe"];

  const Rules = {
    name(v) {
      if (!v) return "Full name is required.";
      if (v.length < 3) return "Name must be at least 3 characters.";
      if (v.length > 60) return "Name must be at most 60 characters.";
      if (!/^[\p{L}\p{M} .'-]+$/u.test(v)) return "Use letters, spaces, dots, apostrophes, or hyphens only.";
      return "";
    },
    email(v) {
      if (!v) return "Email is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email address.";
      return "";
    },
    department(v) {
      if (!v) return "Department is required.";
      if (v.length < 2) return "Department is too short.";
      if (v.length > 60) return "Department must be at most 60 characters.";
      return "";
    },
    password(v) {
      if (!v) return "Password is required.";
      if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(v)) return "Use at least 8 characters with letters and numbers.";
      return "";
    },
    idNumber(v, role) {
      const rule = ID_RULES[role];
      if (!v) return `${rule.label} is required.`;
      if (!rule.pattern.test(v)) return `${rule.label} must be ${rule.hint}.`;
      return "";
    },
  };

  const normalizeCode = (code) => text(code).toUpperCase().replace("-", "");

  // complete = true untuk course yang diajukan/terbit (semua field wajib); Draft cukup judul
  function courseErrors(c, { complete, isNew, exceptId }) {
    const filled = (v) => v !== null && v !== undefined && v !== "";
    const check = (value, rule) => (complete || filled(value) ? rule(value) : "");
    const enrolled = exceptId ? Store.enrollmentsOf(exceptId).length : 0;
    return {
      title: !c.title ? "Course title is required." : c.title.length < 5 ? "Title must be at least 5 characters." : c.title.length > 100 ? "Title must be at most 100 characters." : "",
      description: check(c.description, (v) => (!v ? "Description is required." : v.length < 20 ? `Description must be at least 20 characters (${v.length}/20).` : "")),
      category: check(c.category, (v) => (v ? "" : "Please choose a category.")),
      semester: check(c.semester, (v) => (v ? "" : "Please choose a semester.")),
      duration: check(c.duration, (v) => (!filled(v) ? "Duration is required." : !isInt(v) || v < 1 || v > 52 ? "Duration must be a whole number between 1 and 52 weeks." : "")),
      startDate: check(c.startDate, (v) =>
        !v ? "Start date is required." : !Domain.isCalendarDate(v) ? "Use the format YYYY-MM-DD." : isNew && v < Domain.todayLocal() ? "Start date cannot be in the past." : ""
      ),
      code: check(c.code, (v) => (!v ? "Course code is required." : !/^[A-Z]{2,5}-?\d{3}$/.test(v) ? "Use a format like DES-405 or CS101." : "")),
      maxStudents: check(c.maxStudents, (v) =>
        !filled(v) ? "Maximum students is required." : !isInt(v) || v < 1 || v > 500 ? "Enter a whole number between 1 and 500." : v < enrolled ? `Cannot be lower than current enrollment (${enrolled}).` : ""
      ),
    };
  }

  function assertCourseCodeFree(code, exceptId) {
    if (!code) return;
    const taken = DB.all("courses").some((c) => c.id !== exceptId && c.code && normalizeCode(c.code) === normalizeCode(code));
    if (taken) conflict("CONFLICT", "This course code is already used by another course.", { code: "This course code is already used by another course." });
  }

  function moduleErrors(m) {
    return {
      title: !m.title ? "Module title is required." : m.title.length < 5 ? "Title must be at least 5 characters." : m.title.length > 80 ? "Title must be at most 80 characters." : "",
      type: ["Lecture", "Practice"].includes(m.type) ? "" : "Choose Lecture or Practice.",
      minutes: !isInt(m.minutes) || m.minutes < 1 || m.minutes > 180 ? "Enter a whole number between 1 and 180." : "",
      content: !m.content ? "Content is required." : m.content.length < 20 ? `Content must be at least 20 characters (${m.content.length}/20).` : "",
      tasks: !Array.isArray(m.tasks) ? "Tasks must be a list." : m.type === "Practice" && !m.tasks.length ? "Add at least one task for a Practice module." : "",
    };
  }

  function quizErrors(q, { minAttempts = 0 } = {}) {
    const fields = {
      title: !q.title ? "Quiz title is required." : q.title.length < 5 ? "Title must be at least 5 characters." : q.title.length > 80 ? "Title must be at most 80 characters." : "",
      passingScore: !isInt(q.passingScore) || q.passingScore < 1 || q.passingScore > 100 ? "Enter a number between 1 and 100." : "",
      maxAttempts:
        !isInt(q.maxAttempts) || q.maxAttempts < 1 || q.maxAttempts > 5
          ? "Enter a number between 1 and 5."
          : q.maxAttempts < minAttempts
            ? `A student has already used ${minAttempts} attempts. Use at least ${minAttempts}.`
            : "",
      timeLimit: !isInt(q.timeLimit) || q.timeLimit < 1 || q.timeLimit > 120 ? "Enter a number between 1 and 120." : "",
      questions: !Array.isArray(q.questions) || !q.questions.length ? "Add at least one question." : "",
    };
    (Array.isArray(q.questions) ? q.questions : []).forEach((item, i) => {
      const options = Array.isArray(item?.options) ? item.options.map(text) : [];
      const error = !text(item?.text)
        ? "Write the question text."
        : options.length !== 4 || options.some((o) => !o)
          ? "Fill in all four options."
          : new Set(options.map((o) => o.toLowerCase())).size < 4
            ? "Options must be different from each other."
            : !isInt(item.answer) || item.answer < 0 || item.answer > 3
              ? "Select the correct answer."
              : "";
      fields[`questions.${i}`] = error;
    });
    return fields;
  }

  /* =======================================================================
     Representasi data yang dikirim ke halaman
     ======================================================================= */
  const publicUser = (u) => pick(u, ["id", "role", "name", "email", "idNumber", "department", "status"]);

  function courseView(c) {
    const stats = Store.courseStats(c.id);
    return {
      ...c,
      lecturerName: Store.lecturerName(c.lecturerId),
      students: stats.students,
      avgProgress: stats.avgProgress,
      seatsLeft: c.maxStudents ? Store.seatsLeft(c) : 0,
    };
  }

  function enrollmentView(e) {
    const course = DB.get("courses", e.courseId);
    const total = Store.modulesOf(e.courseId).length;
    const done = Math.min(e.completedModules, total);
    return {
      id: e.id,
      studentId: e.studentId,
      courseId: e.courseId,
      course: course && {
        ...pick(course, ["id", "code", "title", "semester", "status", "color", "certificate", "duration"]),
        lecturerName: Store.lecturerName(course.lecturerId),
      },
      completedModules: done,
      totalModules: total,
      progress: Store.progressOf(e),
      learningStatus: total && done >= total ? "Completed" : "Active",
      finalScore: e.finalScore,
      grade: e.grade,
      quizAverage: Store.averageQuiz(e),
      certificate: Store.certificateFor(e),
      completedAt: e.completedAt ?? null,
    };
  }

  // Mahasiswa tidak pernah menerima kunci jawaban
  function quizView(quiz, user) {
    const base = pick(quiz, ["id", "courseId", "title", "passingScore", "maxAttempts", "timeLimit"]);
    base.questionCount = quiz.questions.length;
    if (user.role === "student") {
      base.questions = quiz.questions.map((q) => ({ text: q.text, options: [...q.options] }));
      const enrollment = Store.enrollment(user.id, quiz.courseId);
      base.mine = enrollment
        ? { attempts: Store.attemptsOf(enrollment, quiz.id).length, bestScore: Store.bestScore(enrollment, quiz.id) }
        : { attempts: 0, bestScore: null };
    } else {
      base.questions = clone(quiz.questions);
      base.stats = quizStats(quiz);
    }
    return base;
  }

  function quizStats(quiz) {
    const enrollments = Store.enrollmentsOf(quiz.courseId);
    const best = enrollments.map((e) => Store.bestScore(e, quiz.id)).filter((s) => s !== null);
    const perStudent = enrollments.map((e) => Store.attemptsOf(e, quiz.id).length);
    return {
      attempts: perStudent.reduce((a, b) => a + b, 0),
      maxAttemptsUsed: Math.max(0, ...perStudent),
      takers: best.length,
      avgBestScore: best.length ? Math.round(Domain.average(best)) : null,
    };
  }

  function gradeRows(courseId) {
    return Store.enrollmentsOf(courseId).map((e) => {
      const student = DB.get("users", e.studentId);
      return {
        enrollmentId: e.id,
        studentId: e.studentId,
        name: student?.name || "Unknown student",
        nim: student?.idNumber || "",
        progress: Store.progressOf(e),
        quiz: Store.averageQuiz(e),
        finalScore: e.finalScore,
        grade: e.grade,
      };
    });
  }

  const reportStatus = (row) =>
    row.progress === 100 ? "Completed" : row.progress < 40 || (row.quiz !== null && row.quiz < 65) ? "At risk" : "On track";

  function reportRows() {
    return DB.all("enrollments")
      .map((e) => {
        const student = DB.get("users", e.studentId);
        const course = DB.get("courses", e.courseId);
        if (!student || !course) return null;
        const row = {
          enrollmentId: e.id,
          name: student.name,
          nim: student.idNumber,
          courseId: course.id,
          course: course.code,
          progress: Store.progressOf(e),
          quiz: Store.averageQuiz(e),
          grade: e.grade,
        };
        row.status = reportStatus(row);
        return row;
      })
      .filter(Boolean);
  }

  /* =======================================================================
     Akses
     ======================================================================= */
  function currentUser(token) {
    const session = token && DB.all("sessions").find((s) => s.token === token);
    const user = session && DB.get("users", session.userId);
    if (!session || !user) fail(401, "UNAUTHENTICATED", "Please sign in to continue.");
    if (user.status !== "Active") {
      DB.remove("sessions", session.id);
      fail(401, "ACCOUNT_INACTIVE", "Your account has been deactivated. Please contact the administrator.");
    }
    return user;
  }

  const findCourse = (id) => DB.get("courses", id) || notFound("Course");
  const isOwner = (user, course) => user.role === "instructor" && course.lecturerId === user.id;

  // Lihat course: admin semua, dosen miliknya, mahasiswa yang terdaftar atau course yang bisa didaftari
  function viewableCourse(user, id) {
    const course = findCourse(id);
    if (user.role === "admin" || isOwner(user, course)) return course;
    if (user.role === "student" && (Store.enrollment(user.id, course.id) || (course.status === "Active" && course.enrollmentOpen))) return course;
    return user.role === "student" ? notFound("Course") : forbidden("You do not have access to this course.");
  }

  // Ubah isi course (modul, quiz, nilai, mahasiswa): hanya dosen pemilik
  function ownedCourse(user, id) {
    const course = findCourse(id);
    if (!isOwner(user, course)) forbidden("Only the course lecturer can change this course.");
    return course;
  }

  // Laporan/nilai: admin atau dosen pemilik
  function managedCourse(user, id) {
    const course = findCourse(id);
    if (user.role !== "admin" && !isOwner(user, course)) forbidden("You do not have access to this course.");
    return course;
  }

  const userCourseCount = (u) =>
    u.role === "student" ? DB.where("enrollments", (e) => e.studentId === u.id).length : u.role === "instructor" ? Store.coursesOf(u.id).length : null;

  /* =======================================================================
     Auth & profil
     ======================================================================= */
  route("POST", "/auth/login", { public: true }, ({ body }) => {
    const email = text(body.email).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    assertValid({ email: email ? "" : "Email is required.", password: password ? "" : "Password is required." });
    const user = DB.all("users").find((u) => u.email.toLowerCase() === email);
    if (!user || user.password !== password) fail(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    if (user.status !== "Active") fail(403, "ACCOUNT_INACTIVE", "This account is inactive. Please contact the administrator.");
    const session = DB.insert("sessions", { token: newId(), userId: user.id, createdAt: Domain.nowIso() });
    return { token: session.token, user: publicUser(user) };
  });

  route("POST", "/auth/logout", { public: true }, ({ token }) => {
    DB.where("sessions", (s) => s.token === token).forEach((s) => DB.remove("sessions", s.id));
    return { ok: true };
  });

  route("GET", "/auth/me", {}, ({ user }) => publicUser(user));

  route("POST", "/auth/password", {}, ({ user, body }) => {
    const current = typeof body.current === "string" ? body.current : "";
    const next = typeof body.next === "string" ? body.next : "";
    assertValid({
      current: !current ? "Enter your current password." : current !== user.password ? "Current password is incorrect." : "",
      next: Rules.password(next) || (next === current ? "The new password must be different from the current one." : ""),
    });
    DB.update("users", user.id, { password: next });
    log(user, "Changed account password");
    return { ok: true };
  });

  route("PATCH", "/me", {}, ({ user, body }) => {
    const patch = { name: text(body.name ?? user.name), department: text(body.department ?? user.department) };
    assertValid({ name: Rules.name(patch.name), department: Rules.department(patch.department) });
    return publicUser(DB.update("users", user.id, patch));
  });

  route("GET", "/me/stats", {}, ({ user }) => {
    if (user.role === "student") {
      const enrollments = DB.where("enrollments", (e) => e.studentId === user.id);
      return { role: "student", courses: enrollments.length, gpa: Domain.gpa(enrollments.map((e) => e.grade)) };
    }
    if (user.role === "instructor") return { role: "instructor", coursesTaught: Store.coursesOf(user.id).length };
    return { role: "admin", usersManaged: DB.all("users").length };
  });

  /* =======================================================================
     Users (admin)
     ======================================================================= */
  const userRow = (u) => ({ ...publicUser(u), courses: userCourseCount(u) });

  function assertUserUnique(data, exceptId) {
    const taken = (key) => DB.all("users").some((u) => u.id !== exceptId && String(u[key]).toLowerCase() === String(data[key]).toLowerCase());
    const fields = {};
    if (taken("email")) fields.email = "This email is already registered.";
    if (taken("idNumber")) fields.idNumber = `This ${ID_RULES[data.role].label} is already used.`;
    if (Object.keys(fields).length) conflict("CONFLICT", "Some values are already in use.", fields);
  }

  route("GET", "/users", { roles: ["admin"] }, ({ query }) => {
    let items = DB.all("users").map(userRow);
    if (query.role) items = items.filter((u) => u.role === query.role);
    if (query.department) items = items.filter((u) => u.department === query.department);
    if (query.status) items = items.filter((u) => u.status === query.status);
    return paginate(search(items, query.q, ["name", "email", "idNumber"]), query, "name");
  });

  route("GET", "/users/:id", { roles: ["admin"] }, ({ params }) => userRow(DB.get("users", params.id) || notFound("User")));

  route("POST", "/users", { roles: ["admin"] }, ({ user, body }) => {
    const data = {
      role: body.role,
      name: text(body.name),
      email: text(body.email),
      idNumber: text(body.idNumber),
      department: text(body.department),
      status: body.status ?? "Active",
    };
    const password = typeof body.password === "string" ? body.password : "";
    assertValid({ role: ROLES.includes(data.role) ? "" : "Choose a valid role." });
    assertValid({
      name: Rules.name(data.name),
      email: Rules.email(data.email),
      idNumber: Rules.idNumber(data.idNumber, data.role),
      department: Rules.department(data.department),
      status: ["Active", "Inactive"].includes(data.status) ? "" : "Choose Active or Inactive.",
      password: Rules.password(password),
    });
    assertUserUnique(data);
    const created = DB.insert("users", { ...data, password });
    log(user, `Created ${ROLE_LABEL[data.role]} account ${data.name}`);
    return userRow(created);
  });

  route("PATCH", "/users/:id", { roles: ["admin"] }, ({ user, params, body }) => {
    const target = DB.get("users", params.id) || notFound("User");
    const data = { ...target, ...pick(body, ["name", "email", "idNumber", "department", "status"]) };
    ["name", "email", "idNumber", "department"].forEach((key) => (data[key] = text(data[key])));
    assertValid({
      name: Rules.name(data.name),
      email: Rules.email(data.email),
      idNumber: Rules.idNumber(data.idNumber, target.role),
      department: Rules.department(data.department),
      status: !["Active", "Inactive"].includes(data.status)
        ? "Choose Active or Inactive."
        : target.id === user.id && data.status !== "Active"
          ? "You cannot deactivate your own account."
          : "",
    });
    assertUserUnique(data, target.id);
    const updated = DB.update("users", target.id, pick(data, ["name", "email", "idNumber", "department", "status"]));
    const verb = target.status !== updated.status ? (updated.status === "Active" ? "Activated" : "Deactivated") : "Updated";
    log(user, `${verb} ${ROLE_LABEL[target.role]} account ${updated.name}`);
    return userRow(updated);
  });

  route("DELETE", "/users/:id", { roles: ["admin"] }, ({ user, params }) => {
    const target = DB.get("users", params.id) || notFound("User");
    if (target.id === user.id) conflict("CANNOT_DELETE_SELF", "You cannot delete your own account.");
    const teaching = target.role === "instructor" ? Store.coursesOf(target.id).length : 0;
    if (teaching) {
      conflict("LECTURER_HAS_COURSES", `${target.name} still teaches ${teaching} course${teaching > 1 ? "s" : ""}. Delete or reassign those courses first, or deactivate the account instead.`);
    }
    DB.where("enrollments", (e) => e.studentId === target.id).forEach((e) => DB.remove("enrollments", e.id));
    DB.where("sessions", (s) => s.userId === target.id).forEach((s) => DB.remove("sessions", s.id));
    DB.remove("users", target.id);
    log(user, `Deleted account ${target.name}`);
    return { id: target.id };
  });

  /* =======================================================================
     Courses
     ======================================================================= */
  const COURSE_FIELDS = ["title", "description", "category", "semester", "duration", "startDate", "code", "maxStudents", "enrollmentOpen", "certificate"];

  // Normalisasi input form course (angka kosong → null, kode huruf besar)
  function courseInput(body) {
    const data = pick(body, COURSE_FIELDS);
    ["title", "description", "category", "semester", "startDate"].forEach((k) => k in data && (data[k] = text(data[k])));
    if ("code" in data) data.code = text(data.code).toUpperCase().replace(/\s/g, "");
    ["duration", "maxStudents"].forEach((k) => {
      if (!(k in data)) return;
      const raw = data[k];
      data[k] = raw === "" || raw === null ? null : isInt(raw) ? Number(raw) : raw;
    });
    ["enrollmentOpen", "certificate"].forEach((k) => k in data && (data[k] = Boolean(data[k])));
    return data;
  }

  route("GET", "/courses", {}, ({ user, query }) => {
    let items;
    if (user.role === "admin") items = DB.all("courses");
    else if (user.role === "instructor") items = Store.coursesOf(user.id);
    else if (bool(query.open)) items = Store.openCoursesFor(user.id);
    else forbidden("Students can list open courses with ?open=true or their own courses with /me/enrollments.");

    items = items.map(courseView);
    if (query.status) items = items.filter((c) => c.status === query.status);
    if (query.category) items = items.filter((c) => c.category === query.category);
    if (query.semester) items = items.filter((c) => c.semester === query.semester);
    if (query.lecturerId) items = items.filter((c) => c.lecturerId === String(query.lecturerId));
    return paginate(search(items, query.q, ["title", "code", "lecturerName"]), query, "title");
  });

  route("GET", "/courses/:id", {}, ({ user, params }) => courseView(viewableCourse(user, params.id)));

  route("POST", "/courses", { roles: ["instructor"] }, ({ user, body }) => {
    const data = { title: "", ...courseInput(body) };
    assertValid(courseErrors(data, { complete: false, isNew: true }));
    assertCourseCodeFree(data.code);
    const course = DB.insert("courses", {
      title: data.title,
      description: data.description ?? "",
      category: data.category ?? "",
      semester: data.semester ?? "",
      duration: data.duration ?? null,
      startDate: data.startDate ?? "",
      code: data.code ?? "",
      maxStudents: data.maxStudents ?? null,
      enrollmentOpen: data.enrollmentOpen ?? true,
      certificate: data.certificate ?? false,
      lecturerId: user.id,
      status: "Draft",
      color: COURSE_COLORS[DB.all("courses").length % COURSE_COLORS.length],
    });
    log(user, `Created course ${course.code || "(no code)"} ${course.title} (Draft)`);
    return courseView(course);
  });

  route("PATCH", "/courses/:id", {}, ({ user, params, body }) => {
    const course = ownedCourse(user, params.id);
    const data = { ...course, ...courseInput(body) };
    assertValid(courseErrors(data, { complete: course.status !== "Draft", isNew: false, exceptId: course.id }));
    assertCourseCodeFree(data.code, course.id);
    const updated = DB.update("courses", course.id, pick(data, COURSE_FIELDS));
    // Keputusan produk #1: edit course Active langsung tayang dan selalu dicatat
    log(user, `Updated course ${updated.code || "(no code)"} ${updated.title}${course.status === "Active" ? " (live)" : ""}`);
    return courseView(updated);
  });

  route("DELETE", "/courses/:id", {}, ({ user, params }) => {
    const course = findCourse(params.id);
    if (user.role === "instructor") {
      if (!isOwner(user, course)) forbidden("Only the course lecturer can delete this course.");
      if (course.status === "Active" || course.status === "Archived") {
        conflict("COURSE_PUBLISHED", "Published courses can only be removed by the administrator.");
      }
    } else if (user.role !== "admin") {
      forbidden();
    }
    ["modules", "quizzes", "enrollments"].forEach((collection) =>
      DB.where(collection, (x) => x.courseId === course.id).forEach((x) => DB.remove(collection, x.id))
    );
    DB.remove("courses", course.id);
    log(user, `Deleted course ${course.code || "(no code)"} ${course.title}`);
    return { id: course.id };
  });

  // Mesin status course — izin per action sesuai PERANCANGAN §2
  const TRANSITIONS = {
    submit: { role: "instructor", from: ["Draft", "Rejected"], to: "Pending", verb: "Submitted for approval" },
    approve: { role: "admin", from: ["Pending"], to: "Active", verb: "Approved" },
    reject: { role: "admin", from: ["Pending"], to: "Rejected", verb: "Rejected" },
    archive: { role: "admin", from: ["Active"], to: "Archived", verb: "Archived" },
    restore: { role: "admin", from: ["Archived"], to: "Active", verb: "Restored" },
  };

  route("POST", "/courses/:id/transitions", {}, ({ user, params, body }) => {
    const rule = TRANSITIONS[body.action];
    if (!rule) assertValid({ action: `Unknown action. Use one of: ${Object.keys(TRANSITIONS).join(", ")}.` });
    const course = findCourse(params.id);
    if (user.role !== rule.role) forbidden(`Only ${rule.role === "admin" ? "administrators" : "the course lecturer"} can ${body.action} a course.`);
    if (rule.role === "instructor" && !isOwner(user, course)) forbidden("Only the course lecturer can submit this course.");
    if (!rule.from.includes(course.status)) {
      conflict("INVALID_TRANSITION", `Cannot ${body.action} a course that is ${course.status.toLowerCase()}.`);
    }
    if (body.action === "submit") {
      const errors = courseErrors(course, { complete: true, isNew: false, exceptId: course.id });
      if (Object.values(errors).some(Boolean)) {
        fail(400, "INCOMPLETE_COURSE", "Complete all required course details before submitting for approval.", Object.fromEntries(Object.entries(errors).filter(([, m]) => m)));
      }
    }
    const reason = text(body.reason).slice(0, 500) || null;
    const patch = { status: rule.to };
    if (body.action === "reject") patch.rejectionReason = reason;
    if (body.action === "submit") patch.rejectionReason = null;
    const updated = DB.update("courses", course.id, patch);
    log(user, `${rule.verb} course ${course.code} ${course.title}${body.action === "reject" && reason ? ` — ${reason}` : ""}`);
    return courseView(updated);
  });

  route("GET", "/courses/:id/stats", {}, ({ user, params }) => {
    const course = managedCourse(user, params.id);
    const buckets = [0, 0, 0, 0, 0];
    Store.enrollmentsOf(course.id).forEach((e) => {
      const p = Store.progressOf(e);
      buckets[p === 100 ? 4 : Math.min(3, Math.floor(p / 25))] += 1;
    });
    return {
      ...Store.courseStats(course.id),
      capacity: course.maxStudents,
      progressDistribution: ["0–24%", "25–49%", "50–74%", "75–99%", "100%"].map((range, i) => ({ range, students: buckets[i] })),
    };
  });

  /* =======================================================================
     Modules
     ======================================================================= */
  const moduleInput = (body) => {
    const data = pick(body, ["title", "type", "minutes", "content", "tasks"]);
    ["title", "content"].forEach((k) => k in data && (data[k] = text(data[k])));
    if ("minutes" in data && isInt(data.minutes)) data.minutes = Number(data.minutes);
    if ("tasks" in data && Array.isArray(data.tasks)) data.tasks = data.tasks.map(text).filter(Boolean);
    return data;
  };
  const normalizeOrder = (courseId) => Store.modulesOf(courseId).forEach((m, i) => (m.order = i + 1));

  route("GET", "/courses/:id/modules", {}, ({ user, params }) => all(Store.modulesOf(viewableCourse(user, params.id).id)));

  route("POST", "/courses/:id/modules", {}, ({ user, params, body }) => {
    const course = ownedCourse(user, params.id);
    const data = { title: "", type: "Lecture", minutes: null, content: "", tasks: [], ...moduleInput(body) };
    assertValid(moduleErrors(data));
    const created = DB.insert("modules", { ...data, courseId: course.id, order: Store.modulesOf(course.id).length + 1 });
    log(user, `Added module "${created.title}" to ${course.code}`);
    return created;
  });

  route("PATCH", "/modules/:id", {}, ({ user, params, body }) => {
    const module = DB.get("modules", params.id) || notFound("Module");
    const course = ownedCourse(user, module.courseId);
    const data = { ...module, ...moduleInput(body) };
    assertValid(moduleErrors(data));
    const updated = DB.update("modules", module.id, pick(data, ["title", "type", "minutes", "content", "tasks"]));
    log(user, `Updated module "${updated.title}" in ${course.code}`);
    return updated;
  });

  route("DELETE", "/modules/:id", {}, ({ user, params }) => {
    const module = DB.get("modules", params.id) || notFound("Module");
    const course = ownedCourse(user, module.courseId);
    DB.remove("modules", module.id);
    normalizeOrder(course.id);
    DB.save();
    log(user, `Deleted module "${module.title}" from ${course.code}`);
    return { id: module.id };
  });

  route("PUT", "/courses/:id/modules/order", {}, ({ user, params, body }) => {
    const course = ownedCourse(user, params.id);
    const modules = Store.modulesOf(course.id);
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const same = ids.length === modules.length && new Set(ids).size === ids.length && modules.every((m) => ids.includes(m.id));
    if (!same) assertValid({ ids: "Send every module ID of this course exactly once." });
    ids.forEach((id, i) => (DB.get("modules", id).order = i + 1));
    DB.save();
    log(user, `Reordered modules in ${course.code}`);
    return all(Store.modulesOf(course.id));
  });

  /* =======================================================================
     Quizzes (attempt quiz didefinisikan di QZ-01)
     ======================================================================= */
  const quizInput = (body) => {
    const data = pick(body, ["title", "passingScore", "maxAttempts", "timeLimit", "questions"]);
    if ("title" in data) data.title = text(data.title);
    ["passingScore", "maxAttempts", "timeLimit"].forEach((k) => k in data && isInt(data[k]) && (data[k] = Number(data[k])));
    if (Array.isArray(data.questions)) {
      data.questions = data.questions.map((q) => ({
        text: text(q?.text),
        options: Array.isArray(q?.options) ? q.options.map(text) : [],
        answer: isInt(q?.answer) ? Number(q.answer) : null,
      }));
    }
    return data;
  };

  route("GET", "/courses/:id/quizzes", {}, ({ user, params }) => {
    const course = viewableCourse(user, params.id);
    return all(Store.quizzesOf(course.id).map((q) => quizView(q, user)));
  });

  route("GET", "/quizzes/:id", {}, ({ user, params }) => {
    const quiz = DB.get("quizzes", params.id) || notFound("Quiz");
    viewableCourse(user, quiz.courseId);
    if (user.role === "student" && !Store.enrollment(user.id, quiz.courseId)) notFound("Quiz");
    return quizView(quiz, user);
  });

  route("POST", "/courses/:id/quizzes", {}, ({ user, params, body }) => {
    const course = ownedCourse(user, params.id);
    const data = { title: "", passingScore: 70, maxAttempts: 3, timeLimit: 10, questions: [], ...quizInput(body) };
    assertValid(quizErrors(data));
    const created = DB.insert("quizzes", { ...data, courseId: course.id });
    log(user, `Created quiz "${created.title}" in ${course.code}`);
    return quizView(created, user);
  });

  route("PATCH", "/quizzes/:id", {}, ({ user, params, body }) => {
    const quiz = DB.get("quizzes", params.id) || notFound("Quiz");
    const course = ownedCourse(user, quiz.courseId);
    const data = { ...quiz, ...quizInput(body) };
    assertValid(quizErrors(data, { minAttempts: quizStats(quiz).maxAttemptsUsed }));
    const updated = DB.update("quizzes", quiz.id, pick(data, ["title", "passingScore", "maxAttempts", "timeLimit", "questions"]));
    log(user, `Updated quiz "${updated.title}" in ${course.code}`);
    return quizView(updated, user);
  });

  route("DELETE", "/quizzes/:id", {}, ({ user, params }) => {
    const quiz = DB.get("quizzes", params.id) || notFound("Quiz");
    const course = ownedCourse(user, quiz.courseId);
    Store.enrollmentsOf(course.id).forEach((e) => (e.attempts = e.attempts.filter((a) => a.quizId !== quiz.id)));
    DB.remove("quizzes", quiz.id);
    log(user, `Deleted quiz "${quiz.title}" from ${course.code}`);
    return { id: quiz.id };
  });

  /* =======================================================================
     Enrollments
     ======================================================================= */
  route("GET", "/me/enrollments", { roles: ["student"] }, ({ user, query }) => {
    let items = DB.where("enrollments", (e) => e.studentId === user.id)
      .map(enrollmentView)
      .filter((e) => e.course);
    if (query.semester) items = items.filter((e) => e.course.semester === query.semester);
    if (query.status) items = items.filter((e) => e.learningStatus === query.status);
    const q = text(query.q).toLowerCase();
    if (q) items = items.filter((e) => [e.course.title, e.course.code, e.course.lecturerName].some((v) => v.toLowerCase().includes(q)));
    return paginate(items.map((e) => ({ ...e, title: e.course.title })), query, "title");
  });

  function assertSeats(course, count) {
    const seats = Store.seatsLeft(course);
    if (count > seats) conflict("COURSE_FULL", seats ? `Only ${seats} seat${seats === 1 ? "" : "s"} left in this course.` : "This course is full.");
  }

  // Keputusan produk #2: course Archived/selain Active tidak menerima enrollment baru
  route("POST", "/courses/:id/enrollments", { roles: ["student"] }, ({ user, params }) => {
    const course = findCourse(params.id);
    if (course.status !== "Active") conflict("COURSE_NOT_ACTIVE", "Only approved (active) courses accept new students.");
    if (!course.enrollmentOpen) conflict("ENROLLMENT_CLOSED", "Enrollment for this course is closed.");
    if (Store.enrollment(user.id, course.id)) conflict("ALREADY_ENROLLED", "You are already enrolled in this course.");
    assertSeats(course, 1);
    const enrollment = DB.insert("enrollments", { studentId: user.id, courseId: course.id, completedModules: 0, attempts: [], finalScore: null, grade: null });
    log(user, `Enrolled in ${course.code} ${course.title}`);
    return enrollmentView(enrollment);
  });

  route("POST", "/courses/:id/enrollments/batch", {}, ({ user, params, body }) => {
    const course = ownedCourse(user, params.id);
    if (course.status !== "Active") conflict("COURSE_NOT_ACTIVE", "Students can be added after the course is approved by the administrator.");
    const ids = Array.isArray(body.studentIds) ? [...new Set(body.studentIds.map(String))] : [];
    if (!ids.length) assertValid({ studentIds: "Select at least one student." });
    const invalid = ids.filter((id) => {
      const student = DB.get("users", id);
      return !student || student.role !== "student" || student.status !== "Active" || Store.enrollment(id, course.id);
    });
    if (invalid.length) assertValid({ studentIds: `${invalid.length} selected student${invalid.length > 1 ? "s are" : " is"} not available (inactive or already enrolled).` });
    assertSeats(course, ids.length);
    const created = ids.map((studentId) =>
      DB.insert("enrollments", { studentId, courseId: course.id, completedModules: 0, attempts: [], finalScore: null, grade: null })
    );
    log(user, `Enrolled ${created.length} student${created.length > 1 ? "s" : ""} in ${course.code} ${course.title}`);
    return all(created.map(enrollmentView));
  });

  route("DELETE", "/enrollments/:id", {}, ({ user, params }) => {
    const enrollment = DB.get("enrollments", params.id) || notFound("Enrollment");
    const course = ownedCourse(user, enrollment.courseId);
    const student = DB.get("users", enrollment.studentId);
    DB.remove("enrollments", enrollment.id);
    log(user, `Removed ${student?.name || "a student"} from ${course.code}`);
    return { id: enrollment.id };
  });

  route("POST", "/enrollments/:id/completed-modules", { roles: ["student"] }, ({ user, params, body }) => {
    const enrollment = DB.get("enrollments", params.id);
    if (!enrollment || enrollment.studentId !== user.id) notFound("Enrollment");
    const course = findCourse(enrollment.courseId);
    if (course.status === "Archived") conflict("COURSE_ARCHIVED", "This course is archived. Modules are read-only.");
    const modules = Store.modulesOf(course.id);
    const index = modules.findIndex((m) => m.id === String(body.moduleId));
    if (index === -1) assertValid({ moduleId: "Module not found in this course." });
    if (index < enrollment.completedModules) return enrollmentView(enrollment); // sudah selesai — idempoten
    if (index > enrollment.completedModules) conflict("MODULE_LOCKED", `Complete module ${enrollment.completedModules + 1} first.`);
    Store.completeModule(enrollment.id, index + 1);
    if (index + 1 >= modules.length) log(user, `Completed all modules of ${course.code} ${course.title}`);
    return enrollmentView(DB.get("enrollments", enrollment.id));
  });

  /* =======================================================================
     Grades
     ======================================================================= */
  route("GET", "/courses/:id/grades", {}, ({ user, params, query }) =>
    paginate(gradeRows(managedCourse(user, params.id).id), query, "name")
  );

  route("PUT", "/courses/:id/grades", {}, ({ user, params, body }) => {
    const course = ownedCourse(user, params.id);
    const grades = Array.isArray(body.grades) ? body.grades : [];
    if (!grades.length) assertValid({ grades: "Send at least one grade." });
    const fields = {};
    grades.forEach((g) => {
      const enrollment = DB.get("enrollments", g?.enrollmentId);
      const score = g?.finalScore;
      if (!enrollment || enrollment.courseId !== course.id) fields[String(g?.enrollmentId)] = "Student is not enrolled in this course.";
      else if (score !== null && (!isInt(score) || score < 0 || score > 100)) fields[enrollment.id] = "Enter a whole number from 0 to 100.";
    });
    assertValid(fields);
    grades.forEach(({ enrollmentId, finalScore }) => {
      const score = finalScore === null ? null : Number(finalScore);
      DB.update("enrollments", enrollmentId, { finalScore: score, grade: Domain.gradeFromScore(score) });
    });
    log(user, `Updated ${grades.length} final grade${grades.length > 1 ? "s" : ""} in ${course.code}`);
    return all(gradeRows(course.id));
  });

  /* =======================================================================
     Laporan & aktivitas (admin)
     ======================================================================= */
  route("GET", "/reports/summary", { roles: ["admin"] }, () => {
    const rows = reportRows();
    const withQuiz = rows.filter((r) => r.quiz !== null);
    const completed = rows.filter((r) => r.status === "Completed").length;
    const courses = DB.all("courses");
    const codes = [...new Set(withQuiz.map((r) => r.course))].sort();
    return {
      enrollments: rows.length,
      completed,
      atRisk: rows.filter((r) => r.status === "At risk").length,
      completionRate: rows.length ? Math.round((completed / rows.length) * 100) : 0,
      avgProgress: Math.round(Domain.average(rows.map((r) => r.progress))),
      avgQuiz: withQuiz.length ? Math.round(Domain.average(withQuiz.map((r) => r.quiz))) : null,
      coursesByCategory: [...new Set(courses.map((c) => c.category).filter(Boolean))].sort().map((category) => ({
        category,
        courses: courses.filter((c) => c.category === category).length,
      })),
      quizByCourse: codes.map((code) => ({ course: code, avgQuiz: Math.round(Domain.average(withQuiz.filter((r) => r.course === code).map((r) => r.quiz))) })),
    };
  });

  route("GET", "/reports/enrollments", { roles: ["admin"] }, ({ query }) => {
    let items = reportRows();
    if (query.courseId) items = items.filter((r) => r.courseId === String(query.courseId));
    if (query.status) items = items.filter((r) => r.status === query.status);
    return paginate(search(items, query.q, ["name", "nim", "course"]), query, "name");
  });

  route("GET", "/activities", { roles: ["admin"] }, ({ query }) => paginate(DB.all("activities"), query, "-time"));

  /* =======================================================================
     Meta (data pendukung UI)
     ======================================================================= */
  route("GET", "/meta/categories", {}, () => [...new Set([...SEED.categories, ...DB.all("courses").map((c) => c.category)].filter(Boolean))].sort());

  route("GET", "/meta/departments", { roles: ["admin"] }, ({ query }) =>
    [...new Set(DB.all("users").filter((u) => !query.role || u.role === query.role).map((u) => u.department))].sort()
  );

  route("GET", "/meta/lecturers", { roles: ["admin"] }, () =>
    DB.where("users", (u) => u.role === "instructor").map((u) => pick(u, ["id", "name", "department", "status"])).sort((a, b) => a.name.localeCompare(b.name))
  );

  route("GET", "/meta/notifications", {}, ({ user }) => clone(SEED.notifications[user.role] || []));
  route("GET", "/meta/system-status", { roles: ["admin"] }, () => clone(SEED.systemStatus));
  route("GET", "/meta/enrollment-chart", { roles: ["admin"] }, () => clone(SEED.enrollmentChart));

  /* =======================================================================
     Khusus mock (tidak ada di backend)
     ======================================================================= */
  route("POST", "/dev/reset", { public: true }, () => {
    Store.resetDemo();
    return { ok: true };
  });

  /* =======================================================================
     Dispatcher
     ======================================================================= */
  function handle({ method, path, query = {}, body, token }) {
    const [pathname] = path.split("?");
    let match = null;
    const candidates = routes.filter((r) => r.regex.test(pathname));
    if (!candidates.length) fail(404, "NOT_FOUND", `No endpoint for ${method} ${pathname}.`);
    match = candidates.find((r) => r.method === method);
    if (!match) fail(405, "METHOD_NOT_ALLOWED", `${method} is not allowed on ${pathname}.`);

    const values = match.regex.exec(pathname).slice(1).map(decodeURIComponent);
    const params = Object.fromEntries(match.keys.map((key, i) => [key, values[i]]));

    DB.writeFailed = false;
    const user = match.public ? null : currentUser(token);
    if (match.roles && !match.roles.includes(user.role)) forbidden("Your role cannot access this endpoint.");

    const result = match.handler({ params, query, body: clone(body) || {}, user, token });
    if (DB.writeFailed) {
      fail(500, "STORAGE_ERROR", "Changes could not be saved in this browser (storage is full or unavailable).");
    }
    return clone(result);
  }

  return { handle, routes };
})();
