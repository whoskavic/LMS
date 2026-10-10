// Dashboard Instructor — ringkasan course yang diajar, grafik per course, percobaan quiz terbaru.
// Data dari GET /dashboard/instructor (rata-rata dihitung server).

App.ready(async () => {
  const setText = (id, value) => (document.getElementById(id).textContent = value);
  const courseList = document.getElementById("course-list");
  const attemptList = document.getElementById("attempt-list");
  const chartCanvas = document.getElementById("course-chart");

  async function load() {
    UI.loading(courseList, { label: "Loading your courses…" });
    UI.loading(attemptList);
    let d;
    try {
      d = await Api.dashboard.instructor();
    } catch (err) {
      UI.error(courseList, err, load, { title: "Could not load your dashboard" });
      attemptList.innerHTML = "";
      return;
    }
    const s = d.byStatus;

    // --- Kartu ringkasan ---
    setText("stat-courses", d.courses);
    setText("meta-courses", `${s.Active} active · ${s.Pending} pending · ${s.Draft} draft`);
    setText("stat-students", d.students);
    setText("stat-progress", `${d.avgProgress}%`);
    document.getElementById("stat-progress-bar").style.width = `${d.avgProgress}%`;
    setText("stat-quiz", d.avgQuiz ?? "–");
    setText("meta-quiz", `${d.quizTakers} students attempted a quiz`);

    // --- Grafik progress & skor quiz per course aktif ---
    const active = d.perCourse.filter((c) => c.status === "Active");
    if (!active.length) {
      UI.empty(chartCanvas.parentElement, { title: "No active courses yet", text: "The chart appears once a course is approved.", icon: "book" });
    } else {
      Charts.create(chartCanvas, (p) => ({
        type: "bar",
        data: {
          labels: active.map((c) => c.code || c.title),
          datasets: [
            { label: "Avg progress (%)", data: active.map((c) => c.avgProgress), backgroundColor: p.primary, borderRadius: 6, maxBarThickness: 32 },
            { label: "Avg quiz score", data: active.map((c) => c.avgQuiz ?? 0), backgroundColor: p.success, borderRadius: 6, maxBarThickness: 32 },
          ],
        },
        options: Charts.barOptions({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: 100, border: { display: false } } } }),
      }));
    }

    // --- Daftar course saya ---
    courseList.removeAttribute("aria-busy");
    if (!d.perCourse.length) {
      UI.empty(courseList, { title: "You have no courses yet", text: "Create your first course and submit it for approval.", icon: "book", action: { label: "Create course", href: "form.html" } });
    } else {
      courseList.innerHTML = d.perCourse
        .map(
          (c) => `
        <li>
          <span class="row-list__order" style="background: ${Utils.escape(c.color || "var(--color-primary-soft)")}; color: var(--color-on-pastel)">${Utils.escape((c.code || "–").slice(0, 3))}</span>
          <div class="row-list__main">
            <a class="row-list__title" href="course-detail.html?id=${encodeURIComponent(c.id)}">${Utils.escape(c.title)}</a>
            <p class="row-list__meta">${Utils.escape(Utils.orDash(c.code))} · ${c.students} students · ${c.modules} modules · ${c.quizzes} quizzes</p>
          </div>
          ${Utils.statusBadge(c.status)}
        </li>`
        )
        .join("");
    }

    // --- Percobaan quiz terbaru (lulus/tidak mengikuti nilai lulus quiz masing-masing) ---
    attemptList.removeAttribute("aria-busy");
    if (!d.recentAttempts.length) {
      UI.empty(attemptList, { title: "No quiz attempts yet", icon: "quiz" });
    } else {
      attemptList.innerHTML = d.recentAttempts
        .map(
          (a) => `
        <li class="list-row">
          <span>${Utils.escape(a.student)} · ${Utils.escape(a.course)}</span>
          <span class="badge ${a.passed ? "badge--success" : "badge--danger"}" title="${a.passed ? "Passed" : "Not passed"}">${a.score}</span>
        </li>`
        )
        .join("");
    }
  }

  await load();
});
