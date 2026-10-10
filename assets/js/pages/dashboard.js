// Dashboard Admin (operator) — ringkasan, grafik enrollment, persetujuan course, status sistem, aktivitas

App.ready(() => {
  const setText = (id, value) => (document.getElementById(id).textContent = value);
  const { labels, enrollments, completions } = SEED.enrollmentChart;

  function renderStats() {
    const courses = DB.all("courses");
    const users = DB.all("users");
    const students = users.filter((u) => u.role === "student");
    const lecturers = users.filter((u) => u.role === "instructor");
    const pending = courses.filter((c) => c.status === "Pending");

    setText("stat-courses", Utils.number(courses.length));
    setText("trend-courses", `${courses.filter((c) => c.status === "Active").length} active courses`);
    setText("stat-students", Utils.number(students.length));
    setText("trend-students", `${DB.all("enrollments").length} enrollments`);
    setText("stat-lecturers", Utils.number(lecturers.length));
    setText("trend-lecturers", `${Utils.unique(lecturers.map((l) => l.department)).length} departments`);
    setText("stat-pending", pending.length);
  }

  // --- Persetujuan course dari dosen ---
  function renderApprovals() {
    const pending = DB.where("courses", (c) => c.status === "Pending");
    const list = document.getElementById("approval-list");
    list.innerHTML = pending.length
      ? pending
          .map(
            (c) => `
          <li>
            <div class="row-list__main">
              <a class="row-list__title" href="course-detail.html?id=${c.id}">${Utils.escape(c.title)}</a>
              <p class="row-list__meta">${Utils.escape(c.code)} · ${Utils.escape(Store.lecturerName(c.lecturerId))} · ${Utils.escape(c.semester)}</p>
            </div>
            <div class="row-list__actions">
              <button class="btn btn--outline" type="button" data-reject="${c.id}">Reject</button>
              <button class="btn btn--primary" type="button" data-approve="${c.id}">Approve</button>
            </div>
          </li>`
          )
          .join("")
      : '<li class="empty">No courses are waiting for approval.</li>';
  }

  document.getElementById("approval-list").addEventListener("click", (e) => {
    const approve = e.target.closest("[data-approve]");
    const reject = e.target.closest("[data-reject]");
    if (!approve && !reject) return;
    const course = DB.get("courses", (approve || reject).dataset[approve ? "approve" : "reject"]);
    const status = approve ? "Active" : "Rejected";

    UI.modal({
      title: approve ? "Approve course?" : "Reject course?",
      body: `<p><strong>${Utils.escape(course.title)}</strong> (${Utils.escape(course.code)}) by ${Utils.escape(Store.lecturerName(course.lecturerId))}
             ${approve ? "will be published and visible to students." : "will be returned to the lecturer."}</p>`,
      confirmText: approve ? "Approve" : "Reject",
      variant: approve ? "primary" : "danger",
      onConfirm: () => {
        DB.update("courses", course.id, { status });
        Store.logActivity(`${approve ? "Approved" : "Rejected"} course ${course.code} ${course.title}`);
        UI.toast(`${course.code} ${approve ? "approved" : "rejected"}.`);
        renderStats();
        renderApprovals();
        renderActivity();
      },
    });
  });

  // --- Grafik enrollment & completion ---
  Charts.create(document.getElementById("enrollment-chart"), (p) => ({
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Enrollments", data: enrollments, backgroundColor: p.primary, borderRadius: 6, maxBarThickness: 28 },
        { label: "Completions", data: completions, backgroundColor: p.success, borderRadius: 6, maxBarThickness: 28 },
      ],
    },
    options: Charts.barOptions(),
  }));

  // --- Status sistem ---
  document.getElementById("status-list").innerHTML = SEED.systemStatus
    .map(
      (s) => `
      <li class="status-item">
        <p class="status-item__name">${Utils.escape(s.name)}</p>
        <p class="status-item__state">${Utils.escape(s.state)}</p>
      </li>`
    )
    .join("");

  // --- Aktivitas terbaru ---
  function renderActivity() {
    document.getElementById("activity-list").innerHTML = Store.recentActivities(5)
      .map(
        (a) => `
        <li class="list-row">
          <span><strong>${Utils.escape(a.actor)}</strong> · ${Utils.escape(a.action)}</span>
          <span class="list-row__meta">${Utils.formatDate(a.time)}</span>
        </li>`
      )
      .join("");
  }

  // --- Export metrics ke CSV ---
  document.getElementById("export-metrics").addEventListener("click", () => {
    Utils.downloadCSV(
      "learnova-metrics-2026.csv",
      labels.map((month, i) => ({ Month: month, Enrollments: enrollments[i], Completions: completions[i] }))
    );
    UI.toast("Metrics exported as CSV.");
  });

  renderStats();
  renderApprovals();
  renderActivity();
});
