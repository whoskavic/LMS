// Laporan (admin) — rangkuman progress, nilai quiz, grafik, aktivitas sistem, cetak & export CSV.
// Angka dihitung server (GET /reports/summary, /reports/enrollments); CSV dibuat server (/reports/enrollments.csv).

App.ready(() => {
  const PAGE_SIZE = 10;
  const setText = (id, value) => (document.getElementById(id).textContent = value);
  const VARIANT = { Completed: "success", "At risk": "danger", "On track": "primary" };

  setText("report-date", `generated ${Utils.formatDate(new Date().toISOString(), false)}`);

  /* ---------- Ringkasan & grafik ---------- */
  async function loadSummary() {
    let s;
    try {
      s = await Api.reports.summary();
    } catch (err) {
      ["avg-progress", "avg-quiz", "completion-rate"].forEach((id) => setText(id, "–"));
      setText("completion-meta", err.message);
      return;
    }
    setText("total-learners", Utils.number(s.learners));
    setText("total-instructors", Utils.number(s.instructors));
    setText("total-enrollments", Utils.number(s.enrollments));
    const popular = document.getElementById("popular-list");
    if (!s.popularCourses.length) UI.empty(popular, { title: "No enrollments yet", icon: "book" });
    else
      popular.innerHTML = s.popularCourses
        .map(
          (c, i) => `
        <li>
          <span class="row-list__order">${i + 1}</span>
          <div class="row-list__main">
            <a class="row-list__title" href="course-detail.html?id=${encodeURIComponent(c.courseId)}">${Utils.escape(c.title)}</a>
            <p class="row-list__meta">${c.students} learners · ${c.completed} completed</p>
          </div>
        </li>`
        )
        .join("");
    setText("avg-progress", `${s.avgProgress}%`);
    document.getElementById("avg-progress-bar").style.width = `${s.avgProgress}%`;
    setText("avg-quiz", s.avgQuiz !== null ? `${s.avgQuiz} / 100` : "–");
    setText("quiz-meta", `${s.atRisk} enrollment${s.atRisk === 1 ? "" : "s"} at risk`);
    setText("completion-rate", `${s.completionRate}%`);
    setText("completion-meta", `${s.completed} of ${s.enrollments} enrollments completed`);

    const categoryCanvas = document.getElementById("category-chart");
    if (!s.coursesByCategory.length) UI.empty(categoryCanvas.parentElement, { title: "No courses yet", icon: "book" });
    else
      Charts.create(categoryCanvas, (p) => ({
        type: "doughnut",
        data: {
          labels: s.coursesByCategory.map((c) => c.category),
          datasets: [{ data: s.coursesByCategory.map((c) => c.courses), backgroundColor: p.series, borderWidth: 2, borderColor: p.surface }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "62%",
          plugins: { legend: { position: "right", labels: { usePointStyle: true, boxWidth: 8 } } },
        },
      }));

    const quizCanvas = document.getElementById("quiz-chart");
    if (!s.quizByCourse.length) UI.empty(quizCanvas.parentElement, { title: "No quiz attempts yet", icon: "quiz" });
    else
      Charts.create(quizCanvas, (p) => ({
        type: "bar",
        data: {
          labels: s.quizByCourse.map((q) => q.course),
          datasets: [{ label: "Average quiz score", data: s.quizByCourse.map((q) => q.avgQuiz), backgroundColor: p.primary, borderRadius: 6, maxBarThickness: 24 }],
        },
        options: Charts.barOptions({
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 10 } } },
            y: { beginAtZero: true, max: 100, border: { display: false } },
          },
        }),
      }));
  }

  /* ---------- Tabel progress & nilai (server-side) ---------- */
  const table = document.getElementById("report-table");
  const tbody = document.getElementById("report-rows");
  const courseSelect = document.getElementById("report-course");
  const paginationNav = document.getElementById("report-pagination");
  const state = { key: "name", dir: "asc", page: 1 };
  let requestId = 0;

  Api.courses
    .list({ pageSize: 200, sort: "title" })
    .then((res) =>
      courseSelect.insertAdjacentHTML(
        "beforeend",
        res.items.map((c) => `<option value="${Utils.escape(c.id)}">${Utils.escape(c.title)}</option>`).join("")
      )
    )
    .catch(() => {});

  const query = (extra = {}) => ({
    courseId: courseSelect.value,
    sort: `${state.dir === "desc" ? "-" : ""}${state.key}`,
    page: state.page,
    pageSize: PAGE_SIZE,
    ...extra,
  });

  const rowTemplate = (r) => `
    <tr>
      <td>${Utils.escape(r.name)}<span class="table__code">${Utils.escape(r.email)}</span></td>
      <td>${Utils.escape(r.course)}</td>
      <td>
        <div class="table-progress">
          <div class="progress" role="progressbar" aria-label="${Utils.escape(r.name)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${r.progress}">
            <div class="progress__bar" style="width: ${r.progress}%"></div>
          </div>
          <span>${r.progress}%</span>
        </div>
      </td>
      <td class="${r.quiz !== null && r.quiz < 65 ? "text-danger" : ""}">${r.quiz ?? "–"}</td>
      <td><span class="badge badge--${VARIANT[r.status]}">${r.status}</span></td>
    </tr>`;

  const courseLabel = () => (courseSelect.value ? courseSelect.selectedOptions[0].textContent : "");

  async function renderTable() {
    const id = ++requestId;
    UI.loading(tbody, { label: "Loading report…" });
    try {
      const res = await Api.reports.enrollments(query());
      if (id !== requestId) return;
      state.page = res.page;
      UI.pagination(paginationNav, state, res.total, PAGE_SIZE, renderTable);
      tbody.removeAttribute("aria-busy");
      setText("report-count", `${res.total} enrollment${res.total === 1 ? "" : "s"}${courseLabel() ? ` in ${courseLabel()}` : ""}`);
      if (!res.items.length) {
        UI.empty(tbody, { title: courseSelect.value ? "No learners in this course" : "No enrollments yet", icon: "users" });
        setText("report-summary", "No data");
        return;
      }
      tbody.innerHTML = res.items.map(rowTemplate).join("");
      const start = (res.page - 1) * res.pageSize;
      setText("report-summary", `Showing ${start + 1}–${start + res.items.length} of ${res.total}`);
    } catch (err) {
      if (id !== requestId) return;
      UI.error(tbody, err, renderTable, { title: "Could not load the report" });
    }
  }

  courseSelect.addEventListener("change", () => {
    state.page = 1;
    renderTable();
  });
  UI.sortable(table, state, () => {
    state.page = 1;
    renderTable();
  });

  /* ---------- Aktivitas sistem ---------- */
  const activityList = document.getElementById("activity-list");
  UI.load(
    activityList,
    () => Api.activities.recent(8),
    (res) => {
      activityList.innerHTML = res.items
        .map(
          (a) => `
        <li class="list-row">
          <span><strong>${Utils.escape(a.actor)}</strong> · ${Utils.escape(a.action)}</span>
          <span class="list-row__meta">${Utils.formatDate(a.time)}</span>
        </li>`
        )
        .join("");
    },
    { empty: { title: "No activity yet", icon: "clock" } }
  );

  /* ---------- Cetak (semua baris, bukan hanya halaman aktif) & export ---------- */
  document.getElementById("print-report").addEventListener("click", async (e) => {
    try {
      const res = await UI.busy(e.currentTarget, Api.reports.enrollments(query({ page: 1, pageSize: 200 })));
      tbody.innerHTML = res.items.map(rowTemplate).join("") || '<tr><td class="table__empty" colspan="5">No data</td></tr>';
      setTimeout(() => {
        window.print();
        renderTable();
      }, 50);
    } catch (err) {
      UI.toast(err.message, "error");
    }
  });

  document.getElementById("export-report").addEventListener("click", async (e) => {
    try {
      await UI.busy(e.currentTarget, Api.reports.downloadCsv({ courseId: courseSelect.value, sort: query().sort }));
      UI.toast("Report exported as CSV.");
    } catch (err) {
      UI.toast(err.message, "error");
    }
  });

  loadSummary();
  renderTable();
});
