// My Learning — course yang sedang dipelajari, selesai, dan sertifikat (learner & instructor mode Learn).
// Data dari GET /me/enrollments. "Continue learning" membuka modul berikutnya yang belum selesai.

App.ready(async (me) => {
  const view = document.getElementById("course-view");
  const setText = (id, value) => (document.getElementById(id).textContent = value);
  const state = { tab: Utils.params().get("tab") || "active", q: Utils.params().get("q") || "" };
  let enrollments = [];

  const search = document.getElementById("global-search");
  if (search) {
    search.placeholder = "Search my courses...";
    search.value = state.q;
  }

  const progressBar = (value, label) => `
    <div class="progress" role="progressbar" aria-label="${Utils.escape(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
      <div class="progress__bar" style="width: ${value}%"></div>
    </div>`;

  const courseUrl = (e) =>
    `course.html?id=${encodeURIComponent(e.courseId)}${e.nextModuleNumber ? `&m=${e.nextModuleNumber}` : ""}`;

  const thumb = (course) =>
    course.thumbnailUrl
      ? `<img class="course-card__thumb" src="${Utils.escape(course.thumbnailUrl)}" alt="" loading="lazy">`
      : `<div class="course-card__thumb" style="background: ${Utils.escape(course.color || "var(--color-primary-soft)")}"></div>`;

  function actionButton(e) {
    if (e.learningStatus === "Completed") {
      return `<a class="btn btn--outline" href="${courseUrl(e)}">Review course</a>${
        e.certificate ? `<button class="btn btn--outline" type="button" data-certificate="${Utils.escape(e.id)}"><i data-icon="download" class="icon--sm"></i>Certificate</button>` : ""
      }`;
    }
    if (!e.totalModules) return '<span class="text-muted">No modules published yet</span>';
    return `<a class="btn btn--primary" href="${courseUrl(e)}">${e.completedModules ? "Continue learning" : "Start course"} <i data-icon="arrow-right" class="icon--sm"></i></a>`;
  }

  const cardTemplate = (e) => `
    <article class="card course-card">
      <div class="course-card__body">
        ${thumb(e.course)}
        <p class="course-card__code">${e.learningStatus === "Completed" ? "Completed" : `${e.progress}% complete`}</p>
        <h3 class="course-card__title">${Utils.escape(e.course.title)}</h3>
        <p class="course-card__instructor">${Utils.escape(e.course.instructorName)}</p>
        <p class="course-card__meta">${e.completedModules}/${e.totalModules} modules · ${Domain.formatDuration(e.course.totalMinutes)}${
          e.quizAverage !== null ? ` · quiz avg ${e.quizAverage}` : ""
        }${e.nextModuleNumber && e.learningStatus !== "Completed" ? `<br>Next: module ${e.nextModuleNumber}` : ""}</p>
        ${progressBar(e.progress, `${e.course.title} progress`)}
      </div>
      <div class="course-card__footer">${actionButton(e)}</div>
    </article>`;

  const certificateTemplate = (e) => `
    <li>
      <span class="row-list__order"><i data-icon="award" class="icon--sm"></i></span>
      <div class="row-list__main">
        <p class="row-list__title">${Utils.escape(e.course.title)}</p>
        <p class="row-list__meta">No. ${Utils.escape(e.certificate.number)} · issued ${Utils.formatDate(e.certificate.date, false)}</p>
      </div>
      <div class="row-list__actions">
        <a class="btn btn--link" href="../verify.html?code=${encodeURIComponent(e.certificate.number)}">Verify</a>
        <button class="btn btn--outline" type="button" data-certificate="${Utils.escape(e.id)}"><i data-icon="download" class="icon--sm"></i>Download</button>
      </div>
    </li>`;

  const groups = () => ({
    active: enrollments.filter((e) => e.learningStatus !== "Completed"),
    completed: enrollments.filter((e) => e.learningStatus === "Completed"),
    certificates: enrollments.filter((e) => e.certificate),
  });

  function renderSummary() {
    const g = groups();
    setText("sum-active", g.active.length);
    setText("sum-active-meta", g.active.length ? `Average progress ${Math.round(Utils.average(g.active.map((e) => e.progress)))}%` : "Nothing in progress");
    setText("sum-completed", g.completed.length);
    setText("sum-completed-meta", `${enrollments.length} course${enrollments.length === 1 ? "" : "s"} enrolled`);
    setText("sum-certificates", g.certificates.length);
    Object.entries(g).forEach(([key, list]) => (document.querySelector(`[data-tab-count="${key}"]`).textContent = list.length));
    document.querySelectorAll("[data-learning-tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.learningTab === state.tab)));
  }

  function render() {
    renderSummary();
    const q = state.q.toLowerCase();
    const list = groups()[state.tab].filter((e) => !q || [e.course.title, e.course.instructorName].some((v) => v.toLowerCase().includes(q)));

    if (!enrollments.length) {
      view.innerHTML = '<div class="card"></div>';
      UI.empty(view.firstElementChild, {
        title: "Start your learning journey",
        text: "Every course on Learnova is free. Find one you like in the catalog and enroll in one click.",
        icon: "book",
        action: { label: "Browse courses", href: "../catalog.html" },
      });
      return;
    }
    if (!list.length) {
      const empty = {
        active: { title: q ? "No courses match your search" : "Nothing in progress", text: "Pick a new course from the catalog.", action: { label: "Browse courses", href: "../catalog.html" } },
        completed: { title: q ? "No courses match your search" : "No completed courses yet", text: "Finish every module of a course to see it here." },
        certificates: { title: "No certificates yet", text: "Complete a course that offers a certificate to earn one." },
      }[state.tab];
      view.innerHTML = '<div class="card"></div>';
      UI.empty(view.firstElementChild, { icon: state.tab === "certificates" ? "award" : "book", ...empty });
      return;
    }
    view.innerHTML =
      state.tab === "certificates"
        ? `<section class="card"><ul class="row-list">${list.map(certificateTemplate).join("")}</ul></section>`
        : `<div class="course-grid">${list.map(cardTemplate).join("")}</div>`;
    renderIcons(view);
  }

  async function refresh() {
    UI.loading(view, { label: "Loading your courses…" });
    try {
      enrollments = (await Api.enrollments.mine({ pageSize: 200, sort: "-enrolledAt" })).items;
      view.removeAttribute("aria-busy");
      render();
    } catch (err) {
      UI.error(view, err, refresh, { title: "Could not load your courses" });
    }
  }

  document.querySelectorAll("[data-learning-tab]").forEach((tab) =>
    tab.addEventListener("click", () => {
      state.tab = tab.dataset.learningTab;
      history.replaceState(null, "", `?tab=${state.tab}`);
      render();
    })
  );
  search?.addEventListener("input", (e) => {
    state.q = e.target.value.trim();
    render();
  });
  view.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-certificate]");
    if (btn) Certificate.download(enrollments.find((x) => x.id === btn.dataset.certificate), me);
  });

  await refresh();
});
