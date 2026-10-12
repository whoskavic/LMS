// Dashboard Admin — ringkasan, grafik enrollment, persetujuan course, status sistem, aktivitas.
// Semua angka dari backend: /dashboard/admin, /meta/enrollment-chart, /meta/system-status, /activities.

App.ready(() => {
  const setText = (id, value) => (document.getElementById(id).textContent = value);
  const approvalList = document.getElementById("approval-list");
  const activityList = document.getElementById("activity-list");
  let pending = [];
  let chartData = null;

  async function renderStats() {
    try {
      const d = await Api.dashboard.admin();
      setText("stat-courses", Utils.number(d.courses));
      setText("trend-courses", `${d.activeCourses} active courses`);
      setText("stat-students", Utils.number(d.students));
      setText("trend-students", `${d.enrollments} enrollments`);
      setText("stat-lecturers", Utils.number(d.instructors));
      setText("trend-lecturers", `${d.completed} completed enrollments`);
      setText("stat-pending", d.pending);
      return d;
    } catch (err) {
      ["stat-courses", "stat-students", "stat-lecturers", "stat-pending"].forEach((id) => setText(id, "–"));
      UI.toast(err.message, "error");
      return null;
    }
  }

  // --- Persetujuan course dari instructor ---
  function renderApprovals() {
    if (!pending.length) {
      UI.empty(approvalList, { title: "No courses are waiting for approval", icon: "check-circle" });
      return;
    }
    approvalList.innerHTML = pending
      .map(
        (c) => `
      <li>
        <div class="row-list__main">
          <a class="row-list__title" href="course-detail.html?id=${encodeURIComponent(c.id)}">${Utils.escape(c.title)}</a>
          <p class="row-list__meta">${Utils.escape(c.instructorName)} · ${Utils.escape(Utils.orDash(c.category))}</p>
        </div>
        <div class="row-list__actions">
          <button class="btn btn--outline" type="button" data-reject="${Utils.escape(c.id)}">Reject</button>
          <button class="btn btn--primary" type="button" data-approve="${Utils.escape(c.id)}">Approve</button>
        </div>
      </li>`
      )
      .join("");
  }

  async function refreshTop() {
    UI.loading(approvalList, { label: "Loading approvals…" });
    const d = await renderStats();
    if (!d) return UI.error(approvalList, new Error("Could not load pending courses."), refreshTop);
    pending = d.pendingCourses;
    approvalList.removeAttribute("aria-busy");
    renderApprovals();
  }

  approvalList.addEventListener("click", (e) => {
    const approve = e.target.closest("[data-approve]");
    const reject = e.target.closest("[data-reject]");
    if (!approve && !reject) return;
    const course = pending.find((c) => c.id === (approve || reject).dataset[approve ? "approve" : "reject"]);

    UI.modal({
      title: approve ? "Approve course?" : "Reject course?",
      body: `<p><strong>${Utils.escape(course.title)}</strong> by ${Utils.escape(course.instructorName)}
             ${approve ? "will be published and visible to learners." : "will be returned to the instructor."}</p>
             ${reject ? `<form class="form-stack mt-5" novalidate>${UI.field({ name: "reason", label: "Reason for the instructor", type: "textarea", attrs: 'maxlength="500"' })}</form>` : ""}`,
      confirmText: approve ? "Approve" : "Reject",
      variant: approve ? "primary" : "danger",
      onConfirm: async (modal) => {
        const form = modal.querySelector("form");
        const reason = form ? UI.formValues(form).reason : undefined;
        if (reject && !reason) {
          UI.fieldError(form, "reason", "Please explain why the course is rejected.");
          return false;
        }
        try {
          await Api.courses.transition(course.id, approve ? "approve" : "reject", reason);
        } catch (err) {
          if (!form || !UI.applyFieldErrors(form, err)) UI.toast(err.message, "error");
          throw err;
        }
        UI.toast(`${course.title} ${approve ? "approved" : "rejected"}.`);
        refreshTop();
        loadActivity();
      },
    });
  });

  // --- Grafik enrollment & completion (6 bulan terakhir) ---
  const chartCanvas = document.getElementById("enrollment-chart");
  Api.meta
    .enrollmentChart()
    .then((data) => {
      chartData = data;
      setText("chart-range", `${data.labels[0]} – ${data.labels[data.labels.length - 1]}`);
      Charts.create(chartCanvas, (p) => ({
        type: "bar",
        data: {
          labels: data.labels,
          datasets: [
            { label: "Enrollments", data: data.enrollments, backgroundColor: p.primary, borderRadius: 6, maxBarThickness: 28 },
            { label: "Completions", data: data.completions, backgroundColor: p.success, borderRadius: 6, maxBarThickness: 28 },
          ],
        },
        options: Charts.barOptions({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, border: { display: false } } } }),
      }));
    })
    .catch((err) => UI.error(chartCanvas.parentElement, err, () => location.reload(), { title: "Could not load the chart" }));

  // --- Status sistem ---
  const statusList = document.getElementById("status-list");
  UI.load(statusList, () => Api.meta.systemStatus(), (items) => {
    statusList.innerHTML = items
      .map(
        (s) => `
      <li class="status-item">
        <p class="status-item__name">${Utils.escape(s.name)}</p>
        <p class="status-item__state">${Utils.escape(s.state)}</p>
      </li>`
      )
      .join("");
  });

  // --- Aktivitas terbaru ---
  const loadActivity = () =>
    UI.load(
      activityList,
      () => Api.activities.recent(5),
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

  // --- Export metrics ke CSV ---
  document.getElementById("export-metrics").addEventListener("click", () => {
    if (!chartData) return UI.toast("Metrics are still loading.", "error");
    Utils.downloadCSV(
      "learnova-metrics.csv",
      chartData.labels.map((month, i) => ({ Month: month, Enrollments: chartData.enrollments[i], Completions: chartData.completions[i] }))
    );
    UI.toast("Metrics exported as CSV.");
  });

  refreshTop();
  loadActivity();
});
