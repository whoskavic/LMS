// Dashboard Dosen — ringkasan course yang diajar, grafik per course, percobaan quiz terbaru

App.ready(() => {
  const me = Store.currentUser();
  const setText = (id, value) => (document.getElementById(id).textContent = value);

  const courses = Store.coursesOf(me.id);
  const active = courses.filter((c) => c.status === "Active");
  const stats = Object.fromEntries(active.map((c) => [c.id, Store.courseStats(c.id)]));
  const enrollments = active.flatMap((c) => Store.enrollmentsOf(c.id));

  // --- Kartu ringkasan ---
  const byStatus = (status) => courses.filter((c) => c.status === status).length;
  const quizScores = enrollments.map((e) => Store.averageQuiz(e)).filter((s) => s !== null);
  const avgProgress = Math.round(Utils.average(enrollments.map((e) => Store.progressOf(e))));

  setText("stat-courses", courses.length);
  setText("meta-courses", `${byStatus("Active")} active · ${byStatus("Pending")} pending · ${byStatus("Draft")} draft`);
  setText("stat-students", new Set(enrollments.map((e) => e.studentId)).size);
  setText("stat-progress", `${avgProgress}%`);
  document.getElementById("stat-progress-bar").style.width = `${avgProgress}%`;
  setText("stat-quiz", quizScores.length ? Math.round(Utils.average(quizScores)) : "–");
  setText("meta-quiz", `${quizScores.length} students attempted a quiz`);

  // --- Grafik progress & skor quiz per course ---
  Charts.create(document.getElementById("course-chart"), (p) => ({
    type: "bar",
    data: {
      labels: active.map((c) => c.code),
      datasets: [
        { label: "Avg progress (%)", data: active.map((c) => stats[c.id].avgProgress), backgroundColor: p.primary, borderRadius: 6, maxBarThickness: 32 },
        { label: "Avg quiz score", data: active.map((c) => stats[c.id].avgQuiz ?? 0), backgroundColor: p.success, borderRadius: 6, maxBarThickness: 32 },
      ],
    },
    options: Charts.barOptions({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: 100, border: { display: false } } } }),
  }));

  // --- Daftar course saya ---
  document.getElementById("course-list").innerHTML = courses.length
    ? courses
        .map((c) => {
          const s = Store.courseStats(c.id);
          return `
          <li>
            <span class="row-list__order" style="background: ${c.color}; color: var(--color-on-pastel)">${Utils.escape(c.code.slice(0, 3))}</span>
            <div class="row-list__main">
              <a class="row-list__title" href="course-detail.html?id=${c.id}">${Utils.escape(c.title)}</a>
              <p class="row-list__meta">${Utils.escape(c.code)} · ${s.students} students · ${s.modules} modules · ${s.quizzes} quizzes</p>
            </div>
            ${Utils.statusBadge(c.status)}
          </li>`;
        })
        .join("")
    : '<li class="empty">You have no courses yet. <a class="btn btn--link" href="form.html">Create one</a></li>';

  // --- Percobaan quiz terbaru dari mahasiswa ---
  const attempts = enrollments
    .flatMap((e) =>
      e.attempts.map((a) => ({
        ...a,
        student: DB.get("users", e.studentId)?.name || "Student",
        course: DB.get("courses", e.courseId).code,
      }))
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  document.getElementById("attempt-list").innerHTML = attempts.length
    ? attempts
        .map(
          (a) => `
        <li class="list-row">
          <span>${Utils.escape(a.student)} · ${Utils.escape(a.course)}</span>
          <span class="badge ${a.score >= 70 ? "badge--success" : "badge--danger"}">${a.score}</span>
        </li>`
        )
        .join("")
    : '<li class="empty">No quiz attempts yet.</li>';
});
