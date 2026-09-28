// Detail Course — workspace course untuk admin (lihat & setujui) dan dosen pemilik (kelola isi)
// File ini mengurus tab, overview, dan aksi di header. Tab lain ada di course-modules.js,
// course-quizzes.js, dan course-grades.js yang memakai objek CourseDetail di bawah.

const CourseDetail = {
  course: null,
  canEdit: false, // true bila dosen pemilik course

  // Perbarui angka di label tab
  updateCounts() {
    const { course } = this;
    const counts = {
      modules: Store.modulesOf(course.id).length,
      quizzes: Store.quizzesOf(course.id).length,
      students: Store.enrollmentsOf(course.id).length,
    };
    Object.entries(counts).forEach(([key, value]) => {
      document.querySelector(`[data-count="${key}"]`).textContent = value;
    });
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const me = Store.currentUser();
  const course = DB.get("courses", Utils.params().get("id"));
  const allowed = course && (me.role === "admin" || course.lecturerId === me.id);

  if (!allowed) {
    Store.setFlash("Course not found or you do not have access to it.", "error");
    location.replace("data-master.html");
    return;
  }

  CourseDetail.course = course;
  CourseDetail.canEdit = me.role === "lecturer";
  const setText = (id, value) => (document.getElementById(id).textContent = value);

  // Tombol khusus dosen pemilik
  if (!CourseDetail.canEdit) document.querySelectorAll("[data-owner-only]").forEach((el) => el.remove());
  if (me.role === "lecturer") setText("crumb-parent", "My Courses");

  /* ---------- Header ---------- */
  function renderHeader() {
    document.title = `${course.code} · ${course.title} | Learnova LMS`;
    setText("crumb-course", course.code);
    setText("course-title", course.title);
    document.getElementById("course-status").innerHTML = Utils.statusBadge(course.status);
    setText("course-meta", `${course.code} · ${Store.lecturerName(course.lecturerId)} · ${course.category} · ${course.semester}`);

    const buttons = [];
    if (me.role === "admin") {
      if (course.status === "Pending") {
        buttons.push('<button class="btn btn--outline" type="button" data-status="Rejected">Reject</button>');
        buttons.push('<button class="btn btn--primary" type="button" data-status="Active"><i data-icon="check" class="icon--sm"></i>Approve</button>');
      }
      if (course.status === "Active") buttons.push('<button class="btn btn--outline" type="button" data-status="Archived"><i data-icon="archive" class="icon--sm"></i>Archive</button>');
      if (course.status === "Archived") buttons.push('<button class="btn btn--outline" type="button" data-status="Active"><i data-icon="refresh" class="icon--sm"></i>Restore</button>');
    } else {
      if (course.status === "Draft" || course.status === "Rejected") {
        buttons.push('<button class="btn btn--primary" type="button" data-status="Pending">Submit for approval</button>');
      }
      buttons.push(`<a class="btn btn--outline" href="form.html?id=${course.id}"><i data-icon="edit" class="icon--sm"></i>Edit course</a>`);
    }
    const actions = document.getElementById("course-actions");
    actions.innerHTML = buttons.join("");
    renderIcons(actions);
  }

  const STATUS_TEXT = {
    Active: { title: "Approve course?", text: "will be published and visible to students.", button: "Approve", log: "Approved" },
    Rejected: { title: "Reject course?", text: "will be returned to the lecturer for revision.", button: "Reject", log: "Rejected", danger: true },
    Archived: { title: "Archive course?", text: "will be hidden from new students.", button: "Archive", log: "Archived", danger: true },
    Pending: { title: "Submit for approval?", text: "will be sent to the administrator for review.", button: "Submit", log: "Submitted for approval" },
  };

  document.getElementById("course-actions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-status]");
    if (!btn) return;
    const next = btn.dataset.status;
    const cfg = next === "Active" && course.status === "Archived"
      ? { title: "Restore course?", text: "will become active again.", button: "Restore", log: "Restored" }
      : STATUS_TEXT[next];

    UI.modal({
      title: cfg.title,
      body: `<p><strong>${Utils.escape(course.title)}</strong> (${Utils.escape(course.code)}) ${cfg.text}</p>`,
      confirmText: cfg.button,
      variant: cfg.danger ? "danger" : "primary",
      onConfirm: () => {
        DB.update("courses", course.id, { status: next });
        Store.logActivity(`${cfg.log}: ${course.code} ${course.title}`);
        UI.toast(`${course.code} is now ${next.toLowerCase()}.`);
        renderHeader();
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
    history.replaceState(null, "", `?id=${course.id}#${name}`);
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
  const stats = Store.courseStats(course.id);
  setText("ov-students", stats.students);
  setText("ov-capacity", `of ${course.maxStudents} seats · enrollment ${course.enrollmentOpen ? "open" : "closed"}`);
  setText("ov-progress", `${stats.avgProgress}%`);
  document.getElementById("ov-progress-bar").style.width = `${stats.avgProgress}%`;
  setText("ov-quiz", stats.avgQuiz ?? "–");
  setText("ov-completed", stats.completed);
  setText("ov-description", course.description);

  const details = [
    ["Course code", course.code],
    ["Lecturer", Store.lecturerName(course.lecturerId)],
    ["Category", course.category],
    ["Semester", course.semester],
    ["Start date", Utils.formatDate(course.startDate, false)],
    ["Duration", `${course.duration} weeks`],
    ["Capacity", `${course.maxStudents} students`],
    ["Certificate", course.certificate ? "Issued on completion" : "Not issued"],
  ];
  document.getElementById("ov-details").innerHTML = details
    .map(([label, value]) => `<div><p class="kv__label">${label}</p><p class="kv__value">${Utils.escape(value)}</p></div>`)
    .join("");

  // Distribusi progress mahasiswa
  const ranges = ["0–24%", "25–49%", "50–74%", "75–99%", "100%"];
  const buckets = [0, 0, 0, 0, 0];
  Store.enrollmentsOf(course.id).forEach((e) => {
    const p = Store.progressOf(e);
    buckets[p === 100 ? 4 : Math.min(3, Math.floor(p / 25))] += 1;
  });
  Charts.create(document.getElementById("progress-chart"), (p) => ({
    type: "bar",
    data: {
      labels: ranges,
      datasets: [{ label: "Students", data: buckets, backgroundColor: [p.warning, p.warning, p.primary, p.primary, p.success], borderRadius: 6, maxBarThickness: 36 }],
    },
    options: Charts.barOptions({
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, border: { display: false } } },
    }),
  }));

  renderHeader();
  CourseDetail.updateCounts();
  // Tab awal dari hash URL (#modules, #quizzes, #students); ikut berubah bila hash diganti
  const tabFromHash = () => {
    const name = location.hash.slice(1);
    showTab(tabs.some((t) => t.dataset.tab === name) ? name : "overview");
  };
  window.addEventListener("hashchange", tabFromHash);
  tabFromHash();
});
