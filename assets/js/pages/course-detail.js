// Detail Course — workspace course untuk admin (lihat & setujui) dan instructor pemilik (kelola isi)
// File ini mengurus tab, overview, dan aksi status di header. Tab lain ada di course-modules.js,
// course-quizzes.js, dan course-students.js yang menunggu CourseDetail.loaded.

const CourseDetail = {
  course: null,
  canEdit: false, // true bila instructor pemilik course
  stats: null,
  // Promise<course> — resolve setelah course dimuat dari server (tab lain menunggu ini)
  loaded: null,
  _resolve: null,

  // Perbarui angka di label tab dari /courses/{id}/stats
  async updateCounts() {
    try {
      const stats = await Api.courses.stats(this.course.id);
      this.stats = stats;
      ["modules", "quizzes", "students"].forEach((key) => {
        document.querySelector(`[data-count="${key}"]`).textContent = stats[key];
      });
    } catch {
      // angka tab bukan data penting — biarkan nilai lama
    }
  },
};
CourseDetail.loaded = new Promise((resolve) => (CourseDetail._resolve = resolve));

App.ready(async (me) => {
  const setText = (id, value) => (document.getElementById(id).textContent = value);
  const courseId = Utils.params().get("id");
  let course;
  try {
    if (!courseId) throw new ApiError(404, "NOT_FOUND", "Course not found.");
    course = await Api.courses.get(courseId);
  } catch (err) {
    UI.flash(err.status === 404 || err.status === 403 ? "Course not found or you do not have access to it." : err.message, "error");
    location.replace("data-master.html");
    return;
  }

  CourseDetail.course = course;
  CourseDetail.canEdit = me.role === "instructor" && course.instructorId === me.id;

  // Tombol khusus instructor pemilik
  if (!CourseDetail.canEdit) document.querySelectorAll("[data-owner-only]").forEach((el) => el.remove());
  if (me.role === "instructor") setText("crumb-parent", "My Courses");

  /* ---------- Header ---------- */
  function renderHeader() {
    const dash = Utils.orDash;
    document.title = `${course.title} | Learnova LMS`;
    setText("crumb-course", course.title);
    setText("course-title", course.title);
    document.getElementById("course-status").innerHTML = Utils.statusBadge(course.status);
    setText("course-meta", `${course.instructorName} · ${dash(course.category)} · ${Domain.courseLength(course.modules, course.totalMinutes)} · Free`);

    const buttons = [];
    if (me.role === "admin") {
      if (course.status === "Pending") {
        buttons.push('<button class="btn btn--outline" type="button" data-transition="reject">Reject</button>');
        buttons.push('<button class="btn btn--primary" type="button" data-transition="approve"><i data-icon="check" class="icon--sm"></i>Approve</button>');
      }
      if (course.status === "Active") buttons.push('<button class="btn btn--outline" type="button" data-transition="archive"><i data-icon="archive" class="icon--sm"></i>Archive</button>');
      if (course.status === "Archived") buttons.push('<button class="btn btn--outline" type="button" data-transition="restore"><i data-icon="refresh" class="icon--sm"></i>Restore</button>');
    } else if (CourseDetail.canEdit) {
      if (course.status === "Draft" || course.status === "Rejected") {
        buttons.push('<button class="btn btn--primary" type="button" data-transition="submit">Submit for approval</button>');
      }
      buttons.push(`<a class="btn btn--outline" href="form.html?id=${encodeURIComponent(course.id)}"><i data-icon="edit" class="icon--sm"></i>Edit course</a>`);
    }
    const actions = document.getElementById("course-actions");
    actions.innerHTML = buttons.join("");
    renderIcons(actions);
  }

  const TRANSITION_TEXT = {
    approve: { title: "Approve course?", text: "will be published and visible to learners.", button: "Approve" },
    reject: { title: "Reject course?", text: "will be returned to the instructor for revision.", button: "Reject", danger: true, reason: true },
    archive: { title: "Archive course?", text: "will be hidden from new learners.", button: "Archive", danger: true },
    restore: { title: "Restore course?", text: "will become active again.", button: "Restore" },
    submit: { title: "Submit for approval?", text: "will be sent to the administrator for review.", button: "Submit" },
  };

  document.getElementById("course-actions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-transition]");
    if (!btn) return;
    const action = btn.dataset.transition;
    const cfg = TRANSITION_TEXT[action];

    UI.modal({
      title: cfg.title,
      body: `<p><strong>${Utils.escape(course.title)}</strong> ${cfg.text}</p>${
        cfg.reason
          ? `<form class="form-stack mt-5" novalidate>${UI.field({ name: "reason", label: "Reason for the instructor", type: "textarea", attrs: 'maxlength="500"' })}</form>`
          : ""
      }`,
      confirmText: cfg.button,
      variant: cfg.danger ? "danger" : "primary",
      onConfirm: async (modal) => {
        const form = modal.querySelector("form");
        const reason = form ? UI.formValues(form).reason : undefined;
        if (cfg.reason && !reason) {
          UI.fieldError(form, "reason", "Please explain why the course is rejected.");
          return false;
        }
        try {
          course = await Api.courses.transition(course.id, action, reason);
          CourseDetail.course = course;
        } catch (err) {
          if (!form || !UI.applyFieldErrors(form, err)) UI.toast(err.message, "error");
          throw err;
        }
        UI.toast(`${course.title} is now ${course.status.toLowerCase()}.`);
        renderHeader();
        renderOverview();
      },
    });
  });

  /* ---------- Tab ---------- */
  const tabs = [...document.querySelectorAll("[data-tab]")];

  function showTab(name, focus = false) {
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(`panel-${tab.dataset.tab}`).hidden = !active;
      if (active && focus) tab.focus();
    });
    history.replaceState(null, "", `?id=${encodeURIComponent(course.id)}#${name}`);
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
    // Navigasi keyboard: panah kiri/kanan berpindah tab
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      showTab(next.dataset.tab, true);
    });
  });

  /* ---------- Overview ---------- */
  let chart = null;
  async function renderOverview() {
    setText("ov-description", course.description || "No description yet.");
    const details = [
      ["Instructor", course.instructorName],
      ["Category", Utils.orDash(course.category)],
      ["Length", Domain.courseLength(course.modules, course.totalMinutes)],
      ["Price", "Free"],
      ["Published", course.publishedAt ? Utils.formatDate(course.publishedAt, false) : "–"],
      ["Certificate", course.certificate ? "Issued on completion" : "Not issued"],
      ...(course.status === "Rejected" && course.rejectionReason ? [["Rejection reason", course.rejectionReason]] : []),
    ];
    document.getElementById("ov-details").innerHTML = details
      .map(([label, value]) => `<div><p class="kv__label">${label}</p><p class="kv__value">${Utils.escape(value)}</p></div>`)
      .join("");

    await CourseDetail.updateCounts();
    const stats = CourseDetail.stats;
    if (!stats) {
      ["ov-students", "ov-progress", "ov-quiz", "ov-completed"].forEach((id) => setText(id, "–"));
      setText("ov-capacity", "Statistics are unavailable right now.");
      return;
    }
    setText("ov-students", stats.students);
    setText(
      "ov-capacity",
      course.status === "Active" ? "Open for enrollment" : "Visible after approval"
    );
    setText("ov-progress", `${stats.avgProgress}%`);
    document.getElementById("ov-progress-bar").style.width = `${stats.avgProgress}%`;
    setText("ov-quiz", stats.avgQuiz ?? "–");
    setText("ov-completed", stats.completed);

    // Distribusi progress student (0 student → pesan kosong, bukan grafik kosong)
    const canvas = document.getElementById("progress-chart");
    if (!stats.students) {
      canvas.hidden = true;
      if (!canvas.parentElement.querySelector(".state")) canvas.insertAdjacentHTML("afterend", "<div></div>");
      UI.empty(canvas.nextElementSibling, { title: "No learners yet", text: "The chart appears once learners enroll.", icon: "users" });
      return;
    }
    const buckets = stats.progressDistribution.map((b) => b.students);
    if (chart) return chart.chart && ((chart.chart.data.datasets[0].data = buckets), chart.chart.update());
    chart = Charts.create(canvas, (p) => ({
      type: "bar",
      data: {
        labels: stats.progressDistribution.map((b) => b.range),
        datasets: [{ label: "Learners", data: buckets, backgroundColor: [p.warning, p.warning, p.primary, p.primary, p.success], borderRadius: 6, maxBarThickness: 36 }],
      },
      options: Charts.barOptions({
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, border: { display: false } } },
      }),
    }));
  }

  renderHeader();
  await renderOverview();
  // Tab awal dari hash URL (#modules, #quizzes, #students); ikut berubah bila hash diganti
  const tabFromHash = () => {
    const name = location.hash.slice(1);
    showTab(tabs.some((t) => t.dataset.tab === name) ? name : "overview");
  };
  window.addEventListener("hashchange", tabFromHash);
  tabFromHash();
  CourseDetail._resolve(course);
});
