// Detail Course · tab Students — daftar learner (read-only): progress, skor quiz terbaik, status selesai.
// Learner enroll sendiri dari katalog; tidak ada input nilai atau tambah student manual (ADR-009).

App.ready(async () => {
  const course = await CourseDetail.loaded;
  const table = document.getElementById("student-table");
  const tbody = document.getElementById("student-rows");
  const state = { key: "name", dir: "asc" };
  let rows = [];

  const statusBadge = (r) =>
    r.completed
      ? `<span class="badge badge--success">Completed</span>${r.certificate ? ' <span class="badge badge--primary">Certificate</span>' : ""}`
      : '<span class="badge badge--neutral">In progress</span>';

  const rowTemplate = (r) => `
    <tr>
      <td>${Utils.escape(r.name)}<span class="table__code">${Utils.escape(r.email)}</span></td>
      <td>
        <div class="table-progress">
          <div class="progress"><div class="progress__bar" style="width: ${r.progress}%"></div></div>
          <span>${r.progress}%</span>
        </div>
      </td>
      <td>${r.bestQuiz ?? "–"}</td>
      <td>${statusBadge(r)}</td>
      <td>${Utils.formatDate(r.enrolledAt, false)}</td>
    </tr>`;

  function render() {
    if (!rows.length) {
      UI.empty(tbody, { title: "No learners yet", text: "Learners appear here after they enroll from the catalog.", icon: "users" });
      return;
    }
    tbody.innerHTML = Utils.sortBy(rows, state.key, state.dir).map(rowTemplate).join("");
  }

  async function load() {
    UI.loading(tbody, { label: "Loading learners…" });
    try {
      rows = (await Api.courses.students(course.id, { pageSize: 200 })).items;
      tbody.removeAttribute("aria-busy");
      render();
    } catch (err) {
      UI.error(tbody, err, load, { title: "Could not load learners" });
    }
  }

  document.getElementById("export-students").addEventListener("click", () => {
    if (!rows.length) return UI.toast("Nothing to export.", "error");
    Utils.downloadCSV(
      `learnova-${course.slug || "course"}-learners.csv`,
      Utils.sortBy(rows, state.key, state.dir).map((r) => ({
        Learner: r.name,
        Email: r.email,
        Progress: `${r.progress}%`,
        "Best quiz": r.bestQuiz ?? "",
        Status: r.completed ? "Completed" : "In progress",
        Certificate: r.certificate ? "Yes" : "No",
        Enrolled: Utils.formatDate(r.enrolledAt, false),
      }))
    );
    UI.toast("Learners exported as CSV.");
  });

  UI.sortable(table, state, render);
  load();
});
