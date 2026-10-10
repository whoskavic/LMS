// Dashboard Student — ringkasan, daftar course (grid/table), filter semester & status, nilai akhir, IPK.
// Data dari GET /me/enrollments dan GET /me/stats (IPK dihitung server dari nilai akhir instructor).

// Enrollment API → bentuk baris dashboard
const toCourseRow = (e) => ({
  ...e.course,
  id: e.course.id,
  enrollment: e,
  instructor: e.course.instructorName,
  modules: e.completedModules,
  totalModules: e.totalModules,
  progress: e.progress,
  learningStatus: e.learningStatus,
  grade: e.grade,
  finalScore: e.finalScore,
});

App.ready(async (me) => {
  let courses = [];
  let gpa = null;
  const view = document.getElementById("course-view");
  const semesterSelect = document.getElementById("semester");
  const setText = (id, value) => (document.getElementById(id).textContent = value);

  // Pilihan semester dari course yang diikuti (terbaru di atas). "Fall 2026" datang setelah "Spring 2026".
  const semesterRank = (s) => {
    const [season, year] = s.split(" ");
    return Number(year) * 2 + (season === "Fall" ? 1 : 0);
  };
  function fillSemesters() {
    const semesters = Utils.unique(courses.map((c) => c.semester).filter(Boolean)).sort((a, b) => semesterRank(b) - semesterRank(a));
    semesterSelect.innerHTML =
      semesters.map((s) => `<option value="${Utils.escape(s)}">Semester: ${Utils.escape(s)}</option>`).join("") +
      '<option value="">All semesters</option>';
    return semesters;
  }

  const state = { semester: null, status: "", q: Utils.params().get("q") || "", view: "grid" };

  async function loadData() {
    const [res, stats] = await Promise.all([Api.enrollments.mine({ pageSize: 200 }), Api.profile.stats()]);
    courses = res.items.map(toCourseRow);
    gpa = stats.gpa;
    const semesters = fillSemesters();
    if (state.semester && !semesters.includes(state.semester)) state.semester = semesters[0] || "";
    if (state.semester === null) state.semester = semesters[0] || "";
    semesterSelect.value = state.semester;
  }
  document.getElementById("global-search").value = state.q;

  const progressBar = (value, label) => `
    <div class="progress" role="progressbar" aria-label="${Utils.escape(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
      <div class="progress__bar" style="width: ${value}%"></div>
    </div>`;

  const statusBadge = (status) =>
    `<span class="badge ${status === "Completed" ? "badge--success" : "badge--primary"}">${status.toUpperCase()}</span>`;

  const actionButton = (c) =>
    c.learningStatus === "Completed"
      ? `<button class="btn btn--outline" type="button" data-grade="${c.id}">View final grade</button>${
          c.enrollment.certificate
            ? `<button class="btn btn--outline" type="button" data-certificate="${c.id}"><i data-icon="download" class="icon--sm"></i>Certificate</button>`
            : ""
        }`
      : `<button class="btn btn--primary" type="button" data-continue="${c.id}">Continue course <i data-icon="arrow-right" class="icon--sm"></i></button>`;

  const cardTemplate = (c) => `
    <article class="card course-card">
      <div class="course-card__body">
        <div class="course-card__thumb" style="background: ${Utils.escape(c.color || "var(--color-primary-soft)")}"></div>
        <p class="course-card__code">${Utils.escape(Utils.orDash(c.code))}</p>
        ${statusBadge(c.learningStatus)}
        <h3 class="course-card__title">${Utils.escape(c.title)}</h3>
        <p class="course-card__instructor">${Utils.escape(c.instructor)}</p>
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
            <tr><th scope="col">Course</th><th scope="col">Instructor</th><th scope="col">Progress</th><th scope="col">Status</th><th scope="col">Grade</th><th scope="col">Action</th></tr>
          </thead>
          <tbody>
            ${list
              .map(
                (c) => `
              <tr>
                <td>${Utils.escape(c.title)}<span class="table__code">${Utils.escape(c.code)}</span></td>
                <td>${Utils.escape(c.instructor)}</td>
                <td><div class="table-progress">${progressBar(c.progress, `${c.code} progress`)}<span>${c.progress}%</span></div></td>
                <td>${statusBadge(c.learningStatus)}</td>
                <td>${c.grade ? `<strong>${Utils.escape(c.grade)}</strong>` : "–"}</td>
                <td>${actionButton(c).replace(/btn--(primary|outline)/g, "btn--link")}</td>
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

    setText("portal-label", state.semester ? `Student portal · ${state.semester}` : "Student portal");
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
    const inSemester = state.semester ? courses.filter((c) => c.semester === state.semester) : courses;
    renderSummary(inSemester);

    const q = state.q.toLowerCase();
    const list = inSemester
      .filter((c) => !state.status || c.learningStatus === state.status)
      .filter((c) => !q || [c.title, c.code, c.instructor].some((v) => (v || "").toLowerCase().includes(q)));

    setText("course-count", `${list.length} course${list.length === 1 ? "" : "s"}`);

    if (!courses.length) {
      view.innerHTML = '<div class="card"></div>';
      UI.empty(view.firstElementChild, {
        title: "You are not enrolled in any course yet",
        text: "Browse the free catalog and enroll to start learning.",
        icon: "book",
        action: { label: "Browse courses", href: "../catalog.html" },
      });
      return;
    } else if (!list.length) {
      view.innerHTML = '<div class="card"></div>';
      UI.empty(view.firstElementChild, { title: "No courses match your filters", icon: "search" });
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

  // --- Daftar (enroll) course baru: course Active yang terbuka & masih ada kursi ---
  document.getElementById("browse-courses").addEventListener("click", () => {
    UI.modal({
      title: "Browse courses",
      size: "lg",
      body: '<p class="text-muted">Free courses that are open for enrollment. <a href="../catalog.html">Open the full catalog</a> to search by topic.</p><div id="open-courses"></div>',
      onOpen: (modal) => {
        const box = modal.querySelector("#open-courses");
        const load = () =>
          UI.load(
            box,
            () => Api.enrollments.open({ sort: "code", pageSize: 50 }),
            (res) => {
              box.innerHTML = `<ul class="row-list">${res.items
                .map((c) => `
                <li>
                  <span class="row-list__order" style="background: ${Utils.escape(c.color || "var(--color-primary-soft)")}" aria-hidden="true"></span>
                  <div class="row-list__main">
                    <p class="row-list__title">${Utils.escape(c.title)} <span class="table__code">${Utils.escape(Utils.orDash(c.code))} · ${Utils.escape(c.instructorName)}</span></p>
                    <p class="row-list__meta">${Utils.escape(Utils.orDash(c.semester))} · ${Utils.orDash(c.duration)} weeks · ${c.maxStudents ? `${c.seatsLeft} seat${c.seatsLeft === 1 ? "" : "s"} left` : "open"}</p>
                  </div>
                  <button class="btn btn--primary" type="button" data-enroll="${Utils.escape(c.id)}">Enroll</button>
                </li>`)
                .join("")}</ul>`;
            },
            { label: "Loading open courses…", empty: { title: "No open courses right now", text: "Check back later — new courses are published regularly.", icon: "book" } }
          );
        load();
        box.addEventListener("click", async (e) => {
          const btn = e.target.closest("[data-enroll]");
          if (!btn) return;
          try {
            const enrollment = await UI.busy(btn, Api.enrollments.enroll(btn.dataset.enroll));
            UI.toast(`You are now enrolled in ${enrollment.course.code || enrollment.course.title}.`);
            modal.querySelector(".btn[data-modal-close]").click();
            state.semester = enrollment.course.semester;
            await refresh();
          } catch (err) {
            UI.toast(err.message, "error");
          }
        });
      },
    });
  });

  // --- Aksi course (event delegation) ---
  view.addEventListener("click", (e) => {
    const certBtn = e.target.closest("[data-certificate]");
    if (certBtn) return Certificate.download(courses.find((c) => c.id === certBtn.dataset.certificate).enrollment, me);

    const continueBtn = e.target.closest("[data-continue]");
    const gradeBtn = e.target.closest("[data-grade]");
    if (!continueBtn && !gradeBtn) return;

    const course = courses.find((c) => c.id === (continueBtn || gradeBtn).dataset[continueBtn ? "continue" : "grade"]);
    const openCourse = () => (location.href = `course.html?id=${encodeURIComponent(course.id)}`);

    if (continueBtn) {
      UI.modal({
        title: course.title,
        body: `
          <p>Continue where you left off in <strong>${Utils.escape(course.code || course.title)}</strong>.</p>
          <dl class="detail-list">
            <dt>Next module</dt><dd>${course.totalModules ? `Module ${Math.min(course.modules + 1, course.totalModules)} of ${course.totalModules}` : "No modules published yet"}</dd>
            <dt>Progress</dt><dd>${course.progress}% · ${course.modules}/${course.totalModules} modules</dd>
            <dt>Instructor</dt><dd>${Utils.escape(course.instructor)}</dd>
          </dl>`,
        confirmText: "Open module",
        onConfirm: openCourse,
      });
    } else {
      UI.modal({
        title: "Final grade",
        body: `
          <p><strong>${Utils.escape(course.title)}</strong> · ${Utils.escape(Utils.orDash(course.code))}</p>
          <dl class="detail-list">
            <dt>Grade</dt><dd>${course.grade ? Utils.escape(course.grade) : "Pending"}</dd>
            <dt>Final score</dt><dd>${course.finalScore !== null ? `${course.finalScore} / 100` : "Awaiting instructor review"}</dd>
            <dt>Instructor</dt><dd>${Utils.escape(course.instructor)}</dd>
            <dt>Semester</dt><dd>${Utils.escape(Utils.orDash(course.semester))}</dd>
          </dl>`,
        confirmText: "Review modules",
        cancelText: "Close",
        onConfirm: openCourse,
      });
    }
  });

  async function refresh() {
    UI.loading(view, { label: "Loading your courses…" });
    try {
      await loadData();
      render();
    } catch (err) {
      UI.error(view, err, refresh, { title: "Could not load your courses" });
    }
  }

  await refresh();
});
