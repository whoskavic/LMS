// Data Master Course — admin (semua course) & instructor (course miliknya)
// Fitur: pencarian, filter, sortir kolom, pagination (server), approve/reject/archive/restore (admin),
// edit/hapus, export CSV. Semua data dan aturan status dari backend (Api.courses).

App.ready((me) => {
  const PAGE_SIZE = 7;
  const isAdmin = me.role === "admin";
  const params = Utils.params();

  const table = document.getElementById("course-table");
  const tbody = document.getElementById("course-rows");
  const paginationNav = document.getElementById("pagination");
  const summary = document.getElementById("table-summary");
  const searchInput = document.getElementById("course-search");
  const globalSearch = document.getElementById("global-search");
  const filters = {
    category: document.getElementById("filter-category"),
    status: document.getElementById("filter-status"),
    instructorId: document.getElementById("filter-instructor"), // hanya ada untuk admin
  };

  if (!isAdmin) {
    document.getElementById("page-eyebrow").textContent = "Instructor workspace";
    document.getElementById("page-title").textContent = "My Courses";
    document.getElementById("page-subtitle").textContent = "Courses you teach — manage modules, quizzes, and grades";
  }

  const state = { q: params.get("q") || "", category: "", status: params.get("status") || "", instructorId: "", page: 1, key: "title", dir: "asc" };
  let current = { items: [] };
  let requestId = 0;

  searchInput.value = state.q;
  globalSearch.value = state.q;
  filters.status.value = state.status;

  // --- Opsi filter dari server ---
  const fillOptions = (select, options) =>
    select?.insertAdjacentHTML("beforeend", options.map(([value, label]) => `<option value="${Utils.escape(value)}">${Utils.escape(label)}</option>`).join(""));
  Api.meta.categories().then((names) => fillOptions(filters.category, names.map((n) => [n, n]))).catch(() => {});
  if (isAdmin) Api.meta.instructors().then((list) => fillOptions(filters.instructorId, list.map((u) => [u.id, u.name]))).catch(() => {});

  const query = (extra = {}) => ({
    q: state.q,
    category: state.category,
    status: state.status,
    instructorId: state.instructorId,
    sort: `${state.dir === "desc" ? "-" : ""}${state.key}`,
    page: state.page,
    pageSize: PAGE_SIZE,
    ...extra,
  });

  const iconButton = (action, c, icon, label, extra = "") =>
    `<button class="icon-btn icon-btn--sm ${action === "delete" || action === "reject" ? "icon-btn--danger" : ""}" type="button"
       data-action="${action}" data-id="${Utils.escape(c.id)}" aria-label="${Utils.escape(label)}" title="${Utils.escape(label)}" ${extra}><i data-icon="${icon}" class="icon--sm"></i></button>`;

  // Hapus permanen hanya untuk Draft tanpa student (aturan server); selain itu arsipkan
  const deletable = (c) => c.status === "Draft" && !c.students;

  function actions(c) {
    const name = c.code || c.title;
    const view = `<a class="btn btn--link" href="course-detail.html?id=${encodeURIComponent(c.id)}">View</a>`;
    const del = iconButton("delete", c, "trash", deletable(c) ? `Delete ${name}` : "Only drafts without students can be deleted", deletable(c) ? "" : "disabled");
    if (isAdmin) {
      return [
        view,
        c.status === "Pending" ? iconButton("approve", c, "check-circle", `Approve ${name}`) + iconButton("reject", c, "x-circle", `Reject ${name}`) : "",
        c.status === "Active" ? iconButton("archive", c, "archive", `Archive ${name}`) : "",
        c.status === "Archived" ? iconButton("restore", c, "refresh", `Restore ${name}`) : "",
        del,
      ].join("");
    }
    return [view, `<a class="btn btn--link" href="form.html?id=${encodeURIComponent(c.id)}">Edit</a>`, del].join("");
  }

  const rowTemplate = (c) => `
    <tr>
      <td>${Utils.escape(c.title)}<span class="table__code">${Utils.escape(Utils.orDash(c.code))} · ${Utils.escape(Utils.orDash(c.semester))}</span></td>
      ${isAdmin ? `<td>${Utils.escape(c.instructorName)}</td>` : ""}
      <td>${Utils.escape(Utils.orDash(c.category))}</td>
      <td>${c.students} / ${Utils.orDash(c.maxStudents)}</td>
      <td>
        <div class="table-progress">
          <div class="progress"><div class="progress__bar" style="width: ${c.avgProgress}%"></div></div>
          <span>${c.avgProgress}%</span>
        </div>
      </td>
      <td>${Utils.statusBadge(c.status)}</td>
      <td><div class="table__actions">${actions(c)}</div></td>
    </tr>`;

  async function render() {
    const id = ++requestId;
    UI.loading(tbody, { label: "Loading courses…" });
    summary.textContent = "";
    try {
      const res = await Api.courses.list(query());
      if (id !== requestId) return;
      current = res;
      state.page = res.page;
      UI.pagination(paginationNav, state, res.total, PAGE_SIZE, render);
      tbody.removeAttribute("aria-busy");
      if (!res.items.length) {
        const filtering = state.q || state.category || state.status || state.instructorId;
        UI.empty(tbody, filtering
          ? { title: "No courses match your search or filters", icon: "search" }
          : isAdmin
            ? { title: "No courses yet", text: "Courses created by instructors will appear here.", icon: "book" }
            : { title: "You have not created a course yet", text: "Create your first course and submit it for approval.", icon: "book", action: { label: "Create course", href: "form.html" } });
        summary.textContent = "Showing 0 courses";
        return;
      }
      tbody.innerHTML = res.items.map(rowTemplate).join("");
      const start = (res.page - 1) * res.pageSize;
      summary.textContent = `Showing ${start + 1}–${start + res.items.length} of ${res.total} courses`;
      renderIcons(tbody);
    } catch (err) {
      if (id !== requestId) return;
      paginationNav.innerHTML = "";
      UI.error(tbody, err, render, { title: "Could not load courses" });
    }
  }

  UI.sortable(table, state, () => {
    state.page = 1;
    render();
  });

  // --- Pencarian & filter ---
  let searchTimer;
  const onSearch = (value) => {
    searchInput.value = value;
    globalSearch.value = value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = value.trim();
      state.page = 1;
      render();
    }, 250);
  };
  searchInput.addEventListener("input", (e) => onSearch(e.target.value));
  globalSearch.addEventListener("input", (e) => onSearch(e.target.value));

  Object.entries(filters).forEach(([key, select]) => {
    select?.addEventListener("change", () => {
      state[key] = select.value;
      state.page = 1;
      render();
    });
  });

  // --- Aksi baris ---
  const CONFIRM = {
    approve: { title: "Approve course?", text: "will be published and visible to students.", button: "Approve", variant: "primary" },
    reject: { title: "Reject course?", text: "will be returned to the instructor for revision.", button: "Reject", variant: "danger", reason: true },
    archive: { title: "Archive course?", text: "will be hidden from new students. Existing records are kept.", button: "Archive", variant: "danger" },
    restore: { title: "Restore course?", text: "will become active again.", button: "Restore", variant: "primary" },
  };

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const course = current.items.find((c) => c.id === btn.dataset.id);
    if (!course) return;
    const label = `<strong>${Utils.escape(course.title)}</strong> (${Utils.escape(Utils.orDash(course.code))})`;

    if (btn.dataset.action === "delete") {
      return UI.modal({
        title: "Delete course?",
        body: `<p>${label} will be permanently removed together with its modules and quizzes. This action cannot be undone.</p>`,
        confirmText: "Delete",
        variant: "danger",
        onConfirm: async () => {
          try {
            await Api.courses.remove(course.id);
          } catch (err) {
            UI.toast(err.message, "error");
            throw err;
          }
          UI.toast(`"${course.title}" deleted.`);
          render();
        },
      });
    }

    const action = btn.dataset.action;
    const cfg = CONFIRM[action];
    UI.modal({
      title: cfg.title,
      body: `<p>${label} ${cfg.text}</p>${
        cfg.reason
          ? `<form class="form-stack mt-5" novalidate>${UI.field({ name: "reason", label: "Reason for the instructor", type: "textarea", placeholder: "What needs to change before this course can be approved?", attrs: 'maxlength="500"' })}</form>`
          : ""
      }`,
      confirmText: cfg.button,
      variant: cfg.variant,
      onConfirm: async (modal) => {
        const form = modal.querySelector("form");
        const reason = form ? UI.formValues(form).reason : undefined;
        if (cfg.reason && !reason) {
          UI.fieldError(form, "reason", "Please explain why the course is rejected.");
          form.elements.reason.focus();
          return false;
        }
        try {
          const updated = await Api.courses.transition(course.id, action, reason);
          UI.toast(`${updated.code || updated.title} is now ${updated.status.toLowerCase()}.`);
        } catch (err) {
          if (!form || !UI.applyFieldErrors(form, err)) UI.toast(err.message, "error");
          throw err;
        }
        render();
      },
    });
  });

  // --- Export CSV (semua baris sesuai filter aktif) ---
  document.getElementById("export-csv").addEventListener("click", async (e) => {
    try {
      const res = await UI.busy(e.currentTarget, Api.courses.list(query({ page: 1, pageSize: 200 })));
      if (!res.items.length) return UI.toast("Nothing to export.", "error");
      Utils.downloadCSV(
        "learnova-courses.csv",
        res.items.map((c) => ({
          Code: c.code,
          Course: c.title,
          Instructor: c.instructorName,
          Category: c.category,
          Semester: c.semester,
          Students: c.students,
          "Avg progress": `${c.avgProgress}%`,
          Status: c.status,
        }))
      );
      UI.toast(`${res.items.length} courses exported as CSV.`);
    } catch (err) {
      UI.toast(err.message, "error");
    }
  });

  render();
});
