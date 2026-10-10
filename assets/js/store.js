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
  // Mengembalikan false bila gagal (storage tidak tersedia / kuota penuh) — data hanya bertahan di halaman ini
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
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

// ID entity adalah string opaque. Data seed memakai ID berprefix yang deterministik (mis. "usr_1"),
// record baru memakai UUID (lihat newId). Jangan pernah mengubah ID menjadi angka.
const seedId = (prefix, n) => `${prefix}_${n}`;

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // Cadangan untuk browser lama / konteks non-secure: UUID v4 dari getRandomValues
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildDatabase() {
  const random = seededRandom(2026);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const withIds = (prefix, list) => list.map((item, i) => ({ id: seedId(prefix, i + 1), ...item }));

  // --- Users --- (ID numerik di SEED → string berprefix)
  const users = SEED.users.map((u) => ({ ...u, id: seedId("usr", u.id) }));
  SEED.studentNames.forEach(([name, nim, department], i) => {
    const first = name.split(" ")[0].toLowerCase();
    const email = i === 0 ? "alex@learnova.ac.id" : `${first}.${nim}@learnova.ac.id`;
    users.push({ id: seedId("usr", users.length + 1), role: "student", name, email, password: "student123", idNumber: nim, department, status: "Active" });
  });

  // --- Courses, modules, quizzes ---
  const courses = SEED.courses.map((c) => ({ ...c, id: seedId("crs", c.id), lecturerId: seedId("usr", c.lecturerId) }));
  const modules = withIds(
    "mod",
    courses.flatMap((c) => courseModules(c, SEED.courseTopics[c.code] || []).map((m, i) => ({ ...m, order: i + 1 })))
  );
  const quizzes = withIds(
    "quz",
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
      attempts.push({ quizId: quiz.id, score: quizScore, answers: seedAnswers(quiz.questions, correct), date: "2026-09-20T03:00:00.000Z" });
    }
    enrollments.push({
      id: seedId("enr", enrollments.length + 1),
      studentId,
      courseId: course.id,
      completedModules: done == null ? total : Math.min(done, total),
      attempts,
      finalScore: finalScore ?? null,
      grade: finalScore != null ? Domain.gradeFromScore(finalScore) : null,
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
    activities: withIds("act", SEED.activities),
    sessions: [], // sesi login MockServer: { id, token, userId, createdAt }
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

  // false bila gagal menulis (mis. kuota penuh / mode private). MockServer memakai writeFailed → 500.
  writeFailed: false,

  save() {
    const ok = Storage.write(STORAGE_KEYS.db, this.load());
    if (!ok) this.writeFailed = true;
    return ok;
  },

  all(collection) {
    return this.load()[collection];
  },

  // ID dibandingkan sebagai string (opaque) — tidak pernah diubah menjadi angka
  get(collection, id) {
    return this.all(collection).find((item) => item.id === String(id)) || null;
  },

  where(collection, predicate) {
    return this.all(collection).filter(predicate);
  },

  insert(collection, item) {
    const list = this.all(collection);
    const record = { ...item, id: newId() };
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
    data[collection] = data[collection].filter((item) => item.id !== String(id));
    this.save();
  },

  reset() {
    Storage.remove(STORAGE_KEYS.db);
    this.data = null;
    this.load();
  },
};

/* =========================================================================
   Store — logika domain yang butuh data (auth, course, progress, quiz, nilai)
   Perhitungan murni (skala nilai, IPK, progress, tanggal) ada di domain.js.
   ========================================================================= */
const Store = {
  /* ---------- Sesi ----------
     Login/logout lewat Api.auth (MockServer). Browser hanya menyimpan { token } di learnova.session;
     identitas & role selalu dibaca dari data user, bukan dari localStorage. */

  // User aktif pemilik token sesi saat ini (dipakai halaman yang belum dimigrasi ke Api)
  currentUser() {
    const token = Storage.read(STORAGE_KEYS.session, null)?.token;
    const session = token && DB.all("sessions").find((s) => s.token === token);
    const user = session && DB.get("users", session.userId);
    return user && user.status === "Active" ? user : null;
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
    return DB.where("courses", (c) => c.lecturerId === String(lecturerId));
  },

  modulesOf(courseId) {
    return DB.where("modules", (m) => m.courseId === String(courseId)).sort((a, b) => a.order - b.order);
  },

  quizzesOf(courseId) {
    return DB.where("quizzes", (q) => q.courseId === String(courseId));
  },

  enrollmentsOf(courseId) {
    return DB.where("enrollments", (e) => e.courseId === String(courseId));
  },

  enrollment(studentId, courseId) {
    return DB.all("enrollments").find((e) => e.studentId === String(studentId) && e.courseId === String(courseId)) || null;
  },

  progressOf(enrollment) {
    return Domain.progressPercent(enrollment.completedModules, this.modulesOf(enrollment.courseId).length);
  },

  // Ringkasan statistik satu course (dipakai dashboard, tabel, laporan)
  courseStats(courseId) {
    const list = this.enrollmentsOf(courseId);
    const quizScores = list.map((e) => this.averageQuiz(e)).filter((s) => s !== null);
    return {
      students: list.length,
      avgProgress: Math.round(Domain.average(list.map((e) => this.progressOf(e)))),
      avgQuiz: quizScores.length ? Math.round(Domain.average(quizScores)) : null,
      completed: list.filter((e) => this.progressOf(e) === 100).length,
      modules: this.modulesOf(courseId).length,
      quizzes: this.quizzesOf(courseId).length,
    };
  },

  // Course milik mahasiswa + progress & nilai (untuk dashboard mahasiswa)
  studentCourses(studentId) {
    return DB.where("enrollments", (e) => e.studentId === String(studentId))
      .map((enrollment) => {
        const course = DB.get("courses", enrollment.courseId);
        if (!course) return null;
        const total = this.modulesOf(course.id).length;
        const done = Math.min(enrollment.completedModules, total);
        return {
          ...course,
          enrollment,
          instructor: this.lecturerName(course.lecturerId),
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
    const finished = number >= this.modulesOf(enrollment.courseId).length;
    DB.update("enrollments", enrollment.id, {
      completedModules: number,
      ...(finished && { completedAt: Domain.todayLocal() }),
    });
    return true;
  },

  /**
   * Sertifikat kelulusan: tersedia bila course menerbitkan sertifikat dan semua modul selesai.
   * Mengembalikan { number, date } atau null.
   */
  certificateFor(enrollment) {
    const course = DB.get("courses", enrollment.courseId);
    if (!course?.certificate || !this.modulesOf(course.id).length || this.progressOf(enrollment) < 100) return null;
    // Data seed tidak punya tanggal selesai → pakai akhir course (paling lambat hari ini)
    const today = Domain.todayLocal();
    const fallback = Domain.addDays(course.startDate, course.duration * 7);
    return {
      number: Domain.certificateNumber(course.code, enrollment.id),
      date: enrollment.completedAt || (fallback < today ? fallback : today),
    };
  },

  /* ---------- Quiz ---------- */
  attemptsOf(enrollment, quizId) {
    return enrollment.attempts.filter((a) => a.quizId === String(quizId));
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
    return scores.length ? Math.round(Domain.average(scores)) : null;
  },

  submitAttempt(enrollmentId, quizId, answers) {
    const enrollment = DB.get("enrollments", enrollmentId);
    const quiz = DB.get("quizzes", quizId);
    const correct = quiz.questions.filter((q, i) => answers[i] === q.answer).length;
    const attempt = {
      quizId: quiz.id,
      score: Math.round((correct / quiz.questions.length) * 100),
      answers,
      date: Domain.nowIso(),
    };
    enrollment.attempts.push(attempt);
    DB.save();
    return { ...attempt, correct, total: quiz.questions.length };
  },

  /* ---------- Nilai ---------- */
  gradeFromScore(score) {
    return Domain.gradeFromScore(score);
  },

  gpa(studentId) {
    return Domain.gpa(DB.where("enrollments", (e) => e.studentId === String(studentId)).map((e) => e.grade));
  },

  /* ---------- Aktivitas & demo ---------- */
  logActivity(action) {
    const user = this.currentUser();
    DB.insert("activities", {
      time: Domain.nowIso(),
      actor: user ? user.name : "System",
      actorId: user?.id ?? null,
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
