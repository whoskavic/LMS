// Laporan (admin) — rangkuman progress, nilai quiz, grafik, aktivitas sistem, cetak & export
// Semua angka dihitung dari data enrollment + percobaan quiz di database.

App.ready(() => {
  const PAGE_SIZE = 10;
  const setText = (id, value) => (document.getElementById(id).textContent = value);
  const courses = DB.all("courses");

  const statusOf = (r) => {
    if (r.progress === 100) return { label: "Completed", variant: "success" };
    if (r.progress < 40 || (r.quiz !== null && r.quiz < 65)) return { label: "At risk", variant: "danger" };
    return { label: "On track", variant: "primary" };
  };

  // Satu baris laporan = satu enrollment mahasiswa
  const reports = DB.all("enrollments")
    .map((e) => {
      const student = DB.get("users", e.studentId);
      const course = DB.get("courses", e.courseId);
      if (!student || !course) return null;
      const row = {
        name: student.name,
        nim: student.idNumber,
        course: course.code,
        progress: Store.progressOf(e),
        quiz: Store.averageQuiz(e),
        grade: e.grade,
      };
      row.status = statusOf(row).label;
      return row;
    })
    .filter(Boolean);

  // --- Ringkasan ---
  const withQuiz = reports.filter((r) => r.quiz !== null);
  const completed = reports.filter((r) => r.progress === 100).length;
  const atRisk = reports.filter((r) => r.status === "At risk").length;
  const avgProgress = Math.round(Utils.average(reports.map((r) => r.progress)));

  setText("report-date", `generated ${Utils.formatDate(new Date().toISOString(), false)}`);
  setText("avg-progress", `${avgProgress}%`);
  document.getElementById("avg-progress-bar").style.width = `${avgProgress}%`;
  setText("avg-quiz", withQuiz.length ? `${Math.round(Utils.average(withQuiz.map((r) => r.quiz)))} / 100` : "–");
  setText("quiz-meta", `${atRisk} enrollment${atRisk === 1 ? "" : "s"} at risk`);
  setText("completion-rate", `${reports.length ? Math.round((completed / reports.length) * 100) : 0}%`);
  setText("completion-meta", `${completed} of ${reports.length} enrollments completed`);

  // --- Grafik ---
  const categories = Utils.unique(courses.map((c) => c.category));
  Charts.create(document.getElementById("category-chart"), (p) => ({
    type: "doughnut",
    data: {
      labels: categories,
      datasets: [
        {
          data: categories.map((cat) => courses.filter((c) => c.category === cat).length),
          backgroundColor: p.series,
          borderWidth: 2,
          borderColor: p.surface,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: { legend: { position: "right", labels: { usePointStyle: true, boxWidth: 8 } } },
    },
  }));

  const codes = Utils.unique(withQuiz.map((r) => r.course));
  Charts.create(document.getElementById("quiz-chart"), (p) => ({
    type: "bar",
    data: {
      labels: codes,
      datasets: [
        {
          label: "Average quiz score",
          data: codes.map((code) => Math.round(Utils.average(withQuiz.filter((r) => r.course === code).map((r) => r.quiz)))),
          backgroundColor: p.primary,
          borderRadius: 6,
          maxBarThickness: 24,
        },
      ],
    },
    options: Charts.barOptions({
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 10 } } },
        y: { beginAtZero: true, max: 100, border: { display: false } },
      },
    }),
  }));

  // --- Tabel progress & nilai ---
  const table = document.getElementById("report-table");
  const courseSelect = document.getElementById("report-course");
  const pagination = document.getElementById("report-pagination");
  const state = { key: "name", dir: "asc", page: 1, printing: false };

  courseSelect.insertAdjacentHTML(
    "beforeend",
    Utils.unique(reports.map((r) => r.course)).map((c) => `<option value="${c}">${c}</option>`).join("")
  );

  const filteredReports = () =>
    Utils.sortBy(reports.filter((r) => !courseSelect.value || r.course === courseSelect.value), state.key, state.dir);

  const rowTemplate = (r) => `
    <tr>
      <td>${Utils.escape(r.name)}<span class="table__code">NIM ${Utils.escape(r.nim)}</span></td>
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
      <td>${r.grade ? `<strong>${Utils.escape(r.grade)}</strong>` : "–"}</td>
      <td><span class="badge badge--${statusOf(r).variant}">${r.status}</span></td>
    </tr>`;

  function renderTable() {
    const list = filteredReports();
    const start = UI.pagination(pagination, state, list.length, PAGE_SIZE, renderTable);
    const rows = state.printing ? list : list.slice(start, start + PAGE_SIZE);
    setText("report-count", `${list.length} enrollment${list.length === 1 ? "" : "s"}${courseSelect.value ? ` in ${courseSelect.value}` : ""}`);
    setText("report-summary", list.length ? `Showing ${start + 1}–${start + rows.length} of ${list.length}` : "No data");
    document.getElementById("report-rows").innerHTML = rows.length
      ? rows.map(rowTemplate).join("")
      : '<tr><td class="table__empty" colspan="6">No students in this course.</td></tr>';
  }

  courseSelect.addEventListener("change", () => {
    state.page = 1;
    renderTable();
  });
  UI.sortable(table, state, () => {
    state.page = 1;
    renderTable();
  });
  renderTable();

  // Saat dicetak, tampilkan semua baris (bukan hanya halaman aktif)
  window.addEventListener("beforeprint", () => {
    state.printing = true;
    renderTable();
  });
  window.addEventListener("afterprint", () => {
    state.printing = false;
    renderTable();
  });

  // --- Aktivitas sistem ---
  document.getElementById("activity-list").innerHTML = Store.recentActivities(8)
    .map(
      (a) => `
      <li class="list-row">
        <span><strong>${Utils.escape(a.actor)}</strong> · ${Utils.escape(a.action)}</span>
        <span class="list-row__meta">${Utils.formatDate(a.time)}</span>
      </li>`
    )
    .join("");

  // --- Cetak & export ---
  document.getElementById("print-report").addEventListener("click", () => window.print());

  document.getElementById("export-report").addEventListener("click", () => {
    Utils.downloadCSV(
      "learnova-learning-report.csv",
      filteredReports().map((r) => ({
        Student: r.name,
        NIM: r.nim,
        Course: r.course,
        Progress: `${r.progress}%`,
        Quiz: r.quiz ?? "",
        Grade: r.grade ?? "",
        Status: r.status,
      }))
    );
    UI.toast("Report exported as CSV.");
  });
});
