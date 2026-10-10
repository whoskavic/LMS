// Learnova LMS — "database" di browser (localStorage)
// Semua data (user, course, modul, quiz, enrollment, aktivitas) dirakit dari SEED lalu disimpan
// dalam satu key. Halaman membaca/menulis lewat DB (CRUD generik) dan Store (logika domain).

const STORAGE_KEYS = {
  db: "learnova.db",
  session: "learnova.session",
  flash: "learnova.flash",
};
const LEGACY_KEYS = ["learnova.courses", "learnova.progress"];

/* =========================================================================
   Helper penyimpanan (aman bila localStorage tidak tersedia)
   ========================================================================= */
const Storage = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage tidak tersedia (mode private) — data hanya bertahan di halaman ini
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

/* =========================================================================
   Perakitan database dari SEED
   ========================================================================= */

// Pseudo-random deterministik agar data mock selalu sama di setiap browser
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Modul course: setiap topik = 1 modul Lecture + 1 modul Practice
function courseModules(course, topics) {
  return topics.flatMap((topic, i) => [
    {
      courseId: course.id,
      title: `${topic} — Lecture`,
      type: "Lecture",
      minutes: 10 + ((i * 7) % 15),
      content:
        `In this lecture you will explore ${topic} as part of ${course.title}. ` +
        `We introduce the core ideas behind the topic, why it matters, and how it is applied through worked examples.\n\n` +
        `Watch the video first, then read these notes. Try to connect ${topic} with what you learned in earlier modules — ` +
        `the practice session that follows will ask you to apply these ideas.`,
      tasks: [],
    },
    {
      courseId: course.id,
      title: `${topic} — Practice`,
      type: "Practice",
      minutes: 20 + ((i * 5) % 20),
      content: `Time to put ${topic} into practice. Work through the tasks below and tick each one when you have finished.`,
      tasks: [
        `Review your notes from the ${topic} lecture`,
        `Complete the ${topic} exercise set (5 questions)`,
        `Share one question or insight about ${topic} in the discussion forum`,
      ],
    },
  ]);
}

// Jawaban attempt dengan jumlah benar tertentu (untuk data seed)
function seedAnswers(questions, correctCount) {
  return questions.map((q, i) => (i < correctCount ? q.answer : (q.answer + 1) % q.options.length));
}

function buildDatabase() {
  const random = seededRandom(2026);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const withIds = (list) => list.map((item, i) => ({ id: i + 1, ...item }));

  // --- Users ---
  const users = SEED.users.map((u) => ({ ...u }));
  SEED.studentNames.forEach(([name, nim, department], i) => {
    const first = name.split(" ")[0].toLowerCase();
    const email = i === 0 ? "alex@learnova.ac.id" : `${first}.${nim}@learnova.ac.id`;
    users.push({ id: users.length + 1, role: "student", name, email, password: "student123", idNumber: nim, department, status: "Active" });
  });

  // --- Courses, modules, quizzes ---
  const courses = SEED.courses.map((c) => ({ ...c }));
  const modules = withIds(
    courses.flatMap((c) => courseModules(c, SEED.courseTopics[c.code] || []).map((m, i) => ({ ...m, order: i + 1 })))
  );
  const quizzes = withIds(
    courses
      .filter((c) => SEED.quizBank[c.code])
      .map((c) => ({
        courseId: c.id,
        title: `${c.code} Quiz 1 · Fundamentals`,
        passingScore: 70,
        maxAttempts: 3,
        timeLimit: 10,
        questions: SEED.quizBank[c.code].map((q) => ({ ...q, options: [...q.options] })),
      }))
  );

  const courseByCode = Object.fromEntries(courses.map((c) => [c.code, c]));
  const totalModules = (courseId) => modules.filter((m) => m.courseId === courseId).length;
  const quizOf = (courseId) => quizzes.find((q) => q.courseId === courseId);

  // --- Enrollments ---
  const enrollments = [];
  const enroll = (studentId, course, done, quizScore, finalScore) => {
    const total = totalModules(course.id);
    const quiz = quizOf(course.id);
    const attempts = [];
    if (quiz && quizScore != null) {
      const correct = Math.round((quizScore / 100) * quiz.questions.length);
      attempts.push({ quizId: quiz.id, score: quizScore, answers: seedAnswers(quiz.questions, correct), date: "2026-09-20T10:00" });
    }
    enrollments.push({
      id: enrollments.length + 1,
      studentId,
      courseId: course.id,
      completedModules: done == null ? total : Math.min(done, total),
      attempts,
      finalScore: finalScore ?? null,
      grade: finalScore != null ? Store.gradeFromScore(finalScore) : null,
    });
  };

  const students = users.filter((u) => u.role === "student");
  const demoStudent = students[0];
  SEED.demoEnrollments.forEach((e) => enroll(demoStudent.id, courseByCode[e.code], e.done, e.quiz, e.finalScore));

  const openCourses = courses.filter((c) => c.status === "Active" || c.status === "Archived");
  students.slice(1).forEach((student) => {
    const chosen = new Set();
    while (chosen.size < 4) chosen.add(pick(openCourses));
    chosen.forEach((course) => {
      const total = totalModules(course.id);
      const finished = course.semester === "Spring 2026";
      const done = finished ? null : Math.floor(random() * (total + 1));
      const quiz = quizOf(course.id);
      const progressed = finished || done >= total / 2;
      const quizScore = quiz && progressed ? pick([40, 60, 80, 80, 100, 100]) : null;
      const finalScore = finished ? 55 + Math.floor(random() * 44) : null;
      enroll(student.id, course, done, quizScore, finalScore);
    });
  });

  return {
    version: SEED.version,
    users,
    courses,
    modules,
    quizzes,
    enrollments,
    activities: withIds(SEED.activities),
  };
}

/* =========================================================================
   DB — CRUD generik untuk setiap koleksi
   ========================================================================= */
const DB = {
  data: null,

  load() {
    if (this.data) return this.data;
    let data = Storage.read(STORAGE_KEYS.db, null);
    const legacy = LEGACY_KEYS.some((key) => Storage.read(key, null) !== null);
    if (!data || data.version !== SEED.version || legacy) {
      LEGACY_KEYS.forEach((key) => Storage.remove(key));
      data = buildDatabase();
      Storage.write(STORAGE_KEYS.db, data);
    }
    this.data = data;
    return data;
  },

  save() {
    Storage.write(STORAGE_KEYS.db, this.load());
  },

  all(collection) {
    return this.load()[collection];
  },

  get(collection, id) {
    return this.all(collection).find((item) => item.id === Number(id)) || null;
  },

  where(collection, predicate) {
    return this.all(collection).filter(predicate);
  },

  insert(collection, item) {
    const list = this.all(collection);
    const record = { ...item, id: Math.max(0, ...list.map((x) => x.id)) + 1 };
    list.push(record);
    this.save();
    return record;
  },

  update(collection, id, patch) {
    const record = this.get(collection, id);
    if (!record) return null;
    Object.assign(record, patch);
    this.save();
    return record;
  },

  remove(collection, id) {
    const data = this.load();
    data[collection] = data[collection].filter((item) => item.id !== Number(id));
    this.save();
  },

  reset() {
    Storage.remove(STORAGE_KEYS.db);
    this.data = null;
    this.load();
  },
};

/* =========================================================================
   Store — logika domain (auth, course, progress, quiz, nilai)
   ========================================================================= */
const GRADE_SCALE = [
  { min: 85, grade: "A", point: 4.0 },
  { min: 80, grade: "A-", point: 3.7 },
  { min: 75, grade: "B+", point: 3.3 },
  { min: 70, grade: "B", point: 3.0 },
  { min: 65, grade: "B-", point: 2.7 },
  { min: 60, grade: "C+", point: 2.3 },
  { min: 55, grade: "C", point: 2.0 },
  { min: 45, grade: "D", point: 1.0 },
  { min: 0, grade: "E", point: 0 },
];

const ROLE_LABELS = { admin: "Administrator", lecturer: "Lecturer", student: "Student" };

const Store = {
  /* ---------- Autentikasi ---------- */
  login(email, password) {
    const user = DB.all("users").find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.password !== password) return { error: "Email or password is incorrect." };
    if (user.status !== "Active") return { error: "This account is inactive. Please contact the administrator." };
    return { session: this.setSession(user) };
  },

  setSession(user) {
    const session = { id: user.id, name: user.name, email: user.email, role: user.role, title: this.userTitle(user) };
    Storage.write(STORAGE_KEYS.session, session);
    return session;
  },

  getSession() {
    return Storage.read(STORAGE_KEYS.session, null);
  },

  currentUser() {
    const session = this.getSession();
    return session ? DB.get("users", session.id) : null;
  },

  logout() {
    Storage.remove(STORAGE_KEYS.session);
  },

  userTitle(user) {
    if (user.role === "student") return `Student · NIM ${user.idNumber}`;
    if (user.role === "lecturer") return `Lecturer · ${user.department}`;
    return "System administrator";
  },

  /* ---------- Pesan sekali tampil (setelah redirect) ---------- */
  setFlash(message, type = "success") {
    Storage.write(STORAGE_KEYS.flash, { message, type });
  },

  takeFlash() {
    const flash = Storage.read(STORAGE_KEYS.flash, null);
    Storage.remove(STORAGE_KEYS.flash);
    return flash;
  },

  /* ---------- Course ---------- */
  lecturerName(id) {
    return DB.get("users", id)?.name || "Unassigned";
  },

  coursesOf(lecturerId) {
    return DB.where("courses", (c) => c.lecturerId === Number(lecturerId));
  },

  modulesOf(courseId) {
    return DB.where("modules", (m) => m.courseId === Number(courseId)).sort((a, b) => a.order - b.order);
  },

  quizzesOf(courseId) {
    return DB.where("quizzes", (q) => q.courseId === Number(courseId));
  },

  enrollmentsOf(courseId) {
    return DB.where("enrollments", (e) => e.courseId === Number(courseId));
  },

  enrollment(studentId, courseId) {
    return DB.all("enrollments").find((e) => e.studentId === Number(studentId) && e.courseId === Number(courseId)) || null;
  },

  progressOf(enrollment) {
    const total = this.modulesOf(enrollment.courseId).length;
    return total ? Math.round((Math.min(enrollment.completedModules, total) / total) * 100) : 0;
  },

  // Ringkasan statistik satu course (dipakai dashboard, tabel, laporan)
  courseStats(courseId) {
    const list = this.enrollmentsOf(courseId);
    const quizScores = list.map((e) => this.averageQuiz(e)).filter((s) => s !== null);
    return {
      students: list.length,
      avgProgress: Math.round(Utils.average(list.map((e) => this.progressOf(e)))),
      avgQuiz: quizScores.length ? Math.round(Utils.average(quizScores)) : null,
      completed: list.filter((e) => this.progressOf(e) === 100).length,
      modules: this.modulesOf(courseId).length,
      quizzes: this.quizzesOf(courseId).length,
    };
  },

  // Course milik mahasiswa + progress & nilai (untuk dashboard mahasiswa)
  studentCourses(studentId) {
    return DB.where("enrollments", (e) => e.studentId === Number(studentId))
      .map((enrollment) => {
        const course = DB.get("courses", enrollment.courseId);
        if (!course) return null;
        const total = this.modulesOf(course.id).length;
        const done = Math.min(enrollment.completedModules, total);
        return {
          ...course,
          enrollment,
          lecturer: this.lecturerName(course.lecturerId),
          modules: done,
          totalModules: total,
          progress: this.progressOf(enrollment),
          learningStatus: total && done >= total ? "Completed" : "Active",
          grade: enrollment.grade,
          finalScore: enrollment.finalScore,
        };
      })
      .filter(Boolean);
  },

  // Sisa kursi course (kapasitas dikurangi jumlah mahasiswa terdaftar)
  seatsLeft(course) {
    return Math.max(0, course.maxStudents - this.enrollmentsOf(course.id).length);
  },

  // Course yang bisa didaftari sendiri oleh mahasiswa: aktif, enrollment dibuka, masih ada kursi
  openCoursesFor(studentId) {
    return DB.where(
      "courses",
      (c) => c.status === "Active" && c.enrollmentOpen && !this.enrollment(studentId, c.id) && this.seatsLeft(c) > 0
    );
  },

  /**
   * Daftarkan mahasiswa ke course. Mengembalikan { enrollment } atau { error }.
   * byLecturer: dosen boleh menambahkan mahasiswa walau pendaftaran mandiri ditutup.
   */
  enrollStudent(studentId, courseId, { byLecturer = false } = {}) {
    const course = DB.get("courses", courseId);
    const student = DB.get("users", studentId);
    if (!course || !student || student.role !== "student") return { error: "Course or student not found." };
    if (course.status !== "Active") return { error: "Only approved (active) courses can accept students." };
    if (!byLecturer && !course.enrollmentOpen) return { error: "Enrollment for this course is closed." };
    if (this.enrollment(student.id, course.id)) return { error: `${student.name} is already enrolled.` };
    if (this.seatsLeft(course) <= 0) return { error: "This course is full." };
    const enrollment = DB.insert("enrollments", {
      studentId: student.id,
      courseId: course.id,
      completedModules: 0,
      attempts: [],
      finalScore: null,
      grade: null,
    });
    return { enrollment };
  },

  // Tandai modul ke-n selesai (hanya modul berikutnya yang bisa diselesaikan)
  completeModule(enrollmentId, number) {
    const enrollment = DB.get("enrollments", enrollmentId);
    if (!enrollment || number !== enrollment.completedModules + 1) return false;
    DB.update("enrollments", enrollment.id, { completedModules: number });
    return true;
  },

  /* ---------- Quiz ---------- */
  attemptsOf(enrollment, quizId) {
    return enrollment.attempts.filter((a) => a.quizId === Number(quizId));
  },

  bestScore(enrollment, quizId) {
    const scores = this.attemptsOf(enrollment, quizId).map((a) => a.score);
    return scores.length ? Math.max(...scores) : null;
  },

  // Rata-rata skor terbaik dari semua quiz course yang sudah dikerjakan
  averageQuiz(enrollment) {
    const scores = this.quizzesOf(enrollment.courseId)
      .map((q) => this.bestScore(enrollment, q.id))
      .filter((s) => s !== null);
    return scores.length ? Math.round(Utils.average(scores)) : null;
  },

  submitAttempt(enrollmentId, quizId, answers) {
    const enrollment = DB.get("enrollments", enrollmentId);
    const quiz = DB.get("quizzes", quizId);
    const correct = quiz.questions.filter((q, i) => answers[i] === q.answer).length;
    const attempt = {
      quizId: quiz.id,
      score: Math.round((correct / quiz.questions.length) * 100),
      answers,
      date: new Date().toISOString().slice(0, 16),
    };
    enrollment.attempts.push(attempt);
    DB.save();
    return { ...attempt, correct, total: quiz.questions.length };
  },

  /* ---------- Nilai ---------- */
  gradeFromScore(score) {
    return GRADE_SCALE.find((g) => score >= g.min).grade;
  },

  gradePoint(grade) {
    return GRADE_SCALE.find((g) => g.grade === grade)?.point ?? null;
  },

  gpa(studentId) {
    const points = DB.where("enrollments", (e) => e.studentId === Number(studentId) && e.grade)
      .map((e) => this.gradePoint(e.grade))
      .filter((p) => p !== null);
    return points.length ? Utils.average(points) : null;
  },

  /* ---------- Aktivitas & demo ---------- */
  logActivity(action) {
    const session = this.getSession();
    DB.insert("activities", {
      time: new Date().toISOString().slice(0, 16),
      actor: session ? session.name : "System",
      action,
    });
  },

  recentActivities(limit = 5) {
    return [...DB.all("activities")].sort((a, b) => b.time.localeCompare(a.time)).slice(0, limit);
  },

  resetDemo() {
    DB.reset();
    Storage.remove(STORAGE_KEYS.flash);
  },
};

// Halaman awal sesuai role (path relatif dari folder pages/)
function homeFor(role) {
  return { admin: "dashboard.html", lecturer: "lecturer-dashboard.html", student: "student-dashboard.html" }[role] || "../index.html";
}
