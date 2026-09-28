// Dashboard Mahasiswa — ringkasan, daftar course (grid/table), filter semester & status, nilai akhir

document.addEventListener("DOMContentLoaded", () => {
  const me = Store.currentUser();
  const courses = Store.studentCourses(me.id);
  const view = document.getElementById("course-view");
  const semesterSelect = document.getElementById("semester");
  const setText = (id, value) => (document.getElementById(id).textContent = value);

  // Pilihan semester dari course yang diikuti (terbaru di atas). "Fall 2026" datang setelah "Spring 2026".
  const semesterRank = (s) => {
    const [season, year] = s.split(" ");
    return Number(year) * 2 + (season === "Fall" ? 1 : 0);
  };
  const semesters = Utils.unique(courses.map((c) => c.semester)).sort((a, b) => semesterRank(b) - semesterRank(a));
  semesterSelect.innerHTML = semesters.map((s) => `<option value="${s}">Semester: ${s}</option>`).join("");

  const state = { semester: semesters[0] || "", status: "", q: Utils.params().get("q") || "", view: "grid" };
  document.getElementById("global-search").value = state.q;

  const progressBar = (value, label) => `
    <div class="progress" role="progressbar" aria-label="${Utils.escape(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
      <div class="progress__bar" style="width: ${value}%"></div>
    </div>`;

  const statusBadge = (status) =>
    `<span class="badge ${status === "Completed" ? "badge--success" : "badge--primary"}">${status.toUpperCase()}</span>`;

  const actionButton = (c) =>
    c.learningStatus === "Completed"
      ? `<button class="btn btn--outline" type="button" data-grade="${c.id}">View final grade</button>`
      : `<button class="btn btn--primary" type="button" data-continue="${c.id}">Continue course <i data-icon="arrow-right" class="icon--sm"></i></button>`;

  const cardTemplate = (c) => `
    <article class="card course-card">
      <div class="course-card__body">
        <div class="course-card__thumb" style="background: ${c.color}"></div>
        <p class="course-card__code">${Utils.escape(c.code)}</p>
        ${statusBadge(c.learningStatus)}
        <h3 class="course-card__title">${Utils.escape(c.title)}</h3>
        <p class="course-card__instructor">${Utils.escape(c.lecturer)}</p>
        <p class="course-card__meta">${c.progress}% complete<br>${c.modules}/${c.totalModules} modules</p>
        ${progressBar(c.progress, `${c.code} progress`)}
      </div>
      <div class="course-card__footer">${actionButton(c)}</div>
    </article>`;

  const tableTemplate = (list) => `
    <section class="card table-card">
      <div class="table-wrap">
        <table class="table table--stack">
          <caption class="visually-hidden">Enrolled courses</caption>
          <thead>
            <tr><th scope="col">Course</th><th scope="col">Lecturer</th><th scope="col">Progress</th><th scope="col">Status</th><th scope="col">Grade</th><th scope="col">Action</th></tr>
          </thead>
          <tbody>
            ${list
              .map(
                (c) => `
              <tr>
                <td>${Utils.escape(c.title)}<span class="table__code">${Utils.escape(c.code)}</span></td>
                <td>${Utils.escape(c.lecturer)}</td>
                <td><div class="table-progress">${progressBar(c.progress, `${c.code} progress`)}<span>${c.progress}%</span></div></td>
                <td>${statusBadge(c.learningStatus)}</td>
                <td>${c.grade ? `<strong>${Utils.escape(c.grade)}</strong>` : "–"}</td>
                <td>${actionButton(c).replace(/btn--(primary|outline)/, "btn--link")}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>`;

  function renderSummary(inSemester) {
    const active = inSemester.filter((c) => c.learningStatus === "Active").length;
    const avgProgress = Math.round(Utils.average(inSemester.map((c) => c.progress)));
    const gpa = Store.gpa(me.id);

    setText("portal-label", `Student portal · ${state.semester}`);
    setText("sum-total", inSemester.length);
    setText("sum-meta", `${active} active · ${inSemester.length - active} completed`);
    setText("sum-progress", `${avgProgress}%`);
    document.getElementById("sum-progress-bar").style.width = `${avgProgress}%`;
    document.getElementById("sum-progress-track").setAttribute("aria-valuenow", avgProgress);
    setText("sum-points", `${avgProgress} / 100 points`);
    setText("sum-gpa", gpa === null ? "– / 4.0" : `${gpa.toFixed(2)} / 4.0`);
    setText(
      "sum-standing",
      gpa === null ? "No graded courses yet" : gpa >= 3.5 ? "Dean's List standing" : gpa >= 3 ? "Good academic standing" : "Keep going — you can improve"
    );
  }

  function render() {
    const inSemester = courses.filter((c) => c.semester === state.semester);
    renderSummary(inSemester);

    const q = state.q.toLowerCase();
    const list = inSemester
      .filter((c) => !state.status || c.learningStatus === state.status)
      .filter((c) => !q || [c.title, c.code, c.lecturer].some((v) => v.toLowerCase().includes(q)));

    setText("course-count", `${list.length} course${list.length === 1 ? "" : "s"}`);

    if (!list.length) {
      view.innerHTML = '<div class="card empty">No courses match your filters.</div>';
    } else if (state.view === "table") {
      view.innerHTML = tableTemplate(list);
    } else {
      view.innerHTML = `<div class="course-grid">${list.map(cardTemplate).join("")}</div>`;
    }
    renderIcons(view);

    const now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    setText("sync-info", `Showing ${list.length} of ${inSemester.length} · Last sync ${now}`);
  }

  // --- Filter & tampilan ---
  semesterSelect.addEventListener("change", (e) => {
    state.semester = e.target.value;
    render();
  });

  document.getElementById("status-filter").addEventListener("change", (e) => {
    state.status = e.target.value;
    render();
  });

  document.getElementById("global-search").addEventListener("input", (e) => {
    state.q = e.target.value.trim();
    render();
  });

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      document.querySelectorAll("[data-view]").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-pressed", String(b === btn));
      });
      render();
    });
  });

  // --- Aksi course (event delegation) ---
  view.addEventListener("click", (e) => {
    const continueBtn = e.target.closest("[data-continue]");
    const gradeBtn = e.target.closest("[data-grade]");
    if (!continueBtn && !gradeBtn) return;

    const course = courses.find((c) => c.id === Number((continueBtn || gradeBtn).dataset[continueBtn ? "continue" : "grade"]));
    const openCourse = () => (location.href = `course.html?id=${course.id}`);

    if (continueBtn) {
      const next = Store.modulesOf(course.id)[course.modules];
      UI.modal({
        title: course.title,
        body: `
          <p>Continue where you left off in <strong>${Utils.escape(course.code)}</strong>.</p>
          <dl class="detail-list">
            <dt>Next module</dt><dd>${next ? `${course.modules + 1}. ${Utils.escape(next.title)}` : "No modules published yet"}</dd>
            <dt>Progress</dt><dd>${course.progress}% · ${course.modules}/${course.totalModules} modules</dd>
            <dt>Lecturer</dt><dd>${Utils.escape(course.lecturer)}</dd>
          </dl>`,
        confirmText: "Open module",
        onConfirm: openCourse,
      });
    } else {
      UI.modal({
        title: "Final grade",
        body: `
          <p><strong>${Utils.escape(course.title)}</strong> · ${Utils.escape(course.code)}</p>
          <dl class="detail-list">
            <dt>Grade</dt><dd>${course.grade ? Utils.escape(course.grade) : "Pending"}</dd>
            <dt>Final score</dt><dd>${course.finalScore !== null ? `${course.finalScore} / 100` : "Awaiting lecturer review"}</dd>
            <dt>Lecturer</dt><dd>${Utils.escape(course.lecturer)}</dd>
            <dt>Semester</dt><dd>${Utils.escape(course.semester)}</dd>
          </dl>`,
        confirmText: "Review modules",
        cancelText: "Close",
        onConfirm: openCourse,
      });
    }
  });

  render();
});
