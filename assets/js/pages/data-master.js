// Data Master Course — dipakai admin (semua course) & dosen (course miliknya)
// Fitur: pencarian, filter, sortir kolom, pagination, approve/reject/archive (admin), edit/hapus, export CSV

App.ready(() => {
  const PAGE_SIZE = 7;
  const me = Store.currentUser();
  const isAdmin = me.role === "admin";
  const params = Utils.params();

  const table = document.getElementById("course-table");
  const tbody = document.getElementById("course-rows");
  const pagination = document.getElementById("pagination");
  const searchInput = document.getElementById("course-search");
  const globalSearch = document.getElementById("global-search");
  const filters = {
    category: document.getElementById("filter-category"),
    status: document.getElementById("filter-status"),
    lecturer: document.getElementById("filter-lecturer"), // hanya ada untuk admin
  };

  if (!isAdmin) {
    document.getElementById("page-eyebrow").textContent = "Lecturer workspace";
    document.getElementById("page-title").textContent = "My Courses";
    document.getElementById("page-subtitle").textContent = "Courses you teach — manage modules, quizzes, and grades";
  }

  const state = {
    q: params.get("q") || "",
    category: "",
    status: params.get("status") || "",
    lecturer: "",
    page: 1,
    key: "title",
    dir: "asc",
  };

  // Course yang boleh dilihat + kolom turunan untuk sortir
  const rows = () =>
    (isAdmin ? DB.all("courses") : Store.coursesOf(me.id)).map((c) => {
      const stats = Store.courseStats(c.id);
      return { ...c, lecturer: Store.lecturerName(c.lecturerId), students: stats.students, avgProgress: stats.avgProgress };
    });

  // --- Isi pilihan filter ---
  const fillOptions = (select, values) =>
    select?.insertAdjacentHTML("beforeend", values.map((v) => `<option value="${Utils.escape(v)}">${Utils.escape(v)}</option>`).join(""));
  fillOptions(filters.category, Utils.unique([...SEED.categories, ...rows().map((c) => c.category)]));
  fillOptions(filters.lecturer, Utils.unique(rows().map((c) => c.lecturer)));

  searchInput.value = state.q;
  globalSearch.value = state.q;
  filters.status.value = state.status;

  function filtered() {
    const q = state.q.toLowerCase();
    const list = rows().filter(
      (c) =>
        (!q || [c.title, c.code, c.lecturer].some((v) => v.toLowerCase().includes(q))) &&
        (!state.category || c.category === state.category) &&
        (!state.status || c.status === state.status) &&
        (!state.lecturer || c.lecturer === state.lecturer)
    );
    return Utils.sortBy(list, state.key, state.dir);
  }

  const iconButton = (action, id, icon, label, extra = "") =>
    `<button class="icon-btn icon-btn--sm ${action === "delete" || action === "reject" ? "icon-btn--danger" : ""}" type="button"
       data-action="${action}" data-id="${id}" aria-label="${label}" title="${label}" ${extra}><i data-icon="${icon}" class="icon--sm"></i></button>`;

  function actions(c) {
    const view = `<a class="btn btn--link" href="course-detail.html?id=${c.id}">View</a>`;
    if (isAdmin) {
      return [
        view,
        c.status === "Pending" ? iconButton("approve", c.id, "check-circle", `Approve ${c.code}`) + iconButton("reject", c.id, "x-circle", `Reject ${c.code}`) : "",
        c.status === "Active" ? iconButton("archive", c.id, "archive", `Archive ${c.code}`) : "",
        c.status === "Archived" ? iconButton("restore", c.id, "refresh", `Restore ${c.code}`) : "",
        iconButton("delete", c.id, "trash", `Delete ${c.code}`),
      ].join("");
    }
    const locked = c.status === "Active" || c.status === "Archived";
    return [
      view,
      `<a class="btn btn--link" href="form.html?id=${c.id}">Edit</a>`,
      iconButton("delete", c.id, "trash", locked ? "Published courses can only be removed by the administrator" : `Delete ${c.code}`, locked ? "disabled" : ""),
    ].join("");
  }

  const rowTemplate = (c) => `
    <tr>
      <td>${Utils.escape(c.title)}<span class="table__code">${Utils.escape(c.code)} · ${Utils.escape(c.semester)}</span></td>
      ${isAdmin ? `<td>${Utils.escape(c.lecturer)}</td>` : ""}
      <td>${Utils.escape(c.category)}</td>
      <td>${c.students} / ${c.maxStudents}</td>
      <td>
        <div class="table-progress">
          <div class="progress"><div class="progress__bar" style="width: ${c.avgProgress}%"></div></div>
          <span>${c.avgProgress}%</span>
        </div>
      </td>
      <td>${Utils.statusBadge(c.status)}</td>
      <td><div class="table__actions">${actions(c)}</div></td>
    </tr>`;

  function render() {
    const list = filtered();
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = list.slice(start, start + PAGE_SIZE);
    const columns = table.querySelectorAll("thead th").length;

    tbody.innerHTML = pageRows.length
      ? pageRows.map(rowTemplate).join("")
      : `<tr><td class="table__empty" colspan="${columns}">No courses match your search or filters.</td></tr>`;

    document.getElementById("table-summary").textContent = list.length
      ? `Showing ${start + 1}–${start + pageRows.length} of ${list.length} courses`
      : "Showing 0 courses";

    const pageButtons = Array.from({ length: totalPages }, (_, i) => i + 1)
      .map(
        (n) =>
          `<button class="btn btn--outline ${n === state.page ? "is-active" : ""}" type="button" data-page="${n}" ${n === state.page ? 'aria-current="page"' : ""}>${n}</button>`
      )
      .join("");
    pagination.innerHTML = `
      <button class="btn btn--outline" type="button" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>Previous</button>
      ${pageButtons}
      <button class="btn btn--outline" type="button" data-page="${state.page + 1}" ${state.page === totalPages ? "disabled" : ""}>Next</button>`;

    renderIcons(tbody);
  }

  UI.sortable(table, state, () => {
    state.page = 1;
    render();
  });

  // --- Pencarian & filter ---
  const onSearch = (value) => {
    state.q = value.trim();
    state.page = 1;
    searchInput.value = value;
    globalSearch.value = value;
    render();
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

  pagination.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-page]");
    if (!btn || btn.disabled) return;
    state.page = Number(btn.dataset.page);
    render();
  });

  // --- Aksi baris ---
  const CONFIRM = {
    approve: { title: "Approve course?", text: "will be published and visible to students.", button: "Approve", variant: "primary", status: "Active", log: "Approved" },
    reject: { title: "Reject course?", text: "will be returned to the lecturer for revision.", button: "Reject", variant: "danger", status: "Rejected", log: "Rejected" },
    archive: { title: "Archive course?", text: "will be hidden from new students. Existing records are kept.", button: "Archive", variant: "danger", status: "Archived", log: "Archived" },
    restore: { title: "Restore course?", text: "will become active again.", button: "Restore", variant: "primary", status: "Active", log: "Restored" },
  };

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const course = DB.get("courses", btn.dataset.id);
    const label = `<strong>${Utils.escape(course.title)}</strong> (${Utils.escape(course.code)})`;

    if (btn.dataset.action === "delete") {
      const enrolled = Store.enrollmentsOf(course.id).length;
      UI.modal({
        title: "Delete course?",
        body: `<p>${label} will be permanently removed together with its modules, quizzes${enrolled ? `, and ${enrolled} student enrollments` : ""}. This action cannot be undone.</p>`,
        confirmText: "Delete",
        variant: "danger",
        onConfirm: () => {
          ["modules", "quizzes", "enrollments"].forEach((col) =>
            DB.where(col, (x) => x.courseId === course.id).forEach((x) => DB.remove(col, x.id))
          );
          DB.remove("courses", course.id);
          Store.logActivity(`Deleted course ${course.code} ${course.title}`);
          render();
          UI.toast(`"${course.title}" deleted.`);
        },
      });
      return;
    }

    const cfg = CONFIRM[btn.dataset.action];
    UI.modal({
      title: cfg.title,
      body: `<p>${label} ${cfg.text}</p>`,
      confirmText: cfg.button,
      variant: cfg.variant,
      onConfirm: () => {
        DB.update("courses", course.id, { status: cfg.status });
        Store.logActivity(`${cfg.log} course ${course.code} ${course.title}`);
        render();
        UI.toast(`${course.code} is now ${cfg.status.toLowerCase()}.`);
      },
    });
  });

  // --- Export CSV (sesuai filter aktif) ---
  document.getElementById("export-csv").addEventListener("click", () => {
    const list = filtered();
    if (!list.length) return UI.toast("Nothing to export.", "error");
    Utils.downloadCSV(
      "learnova-courses.csv",
      list.map((c) => ({
        Code: c.code,
        Course: c.title,
        Lecturer: c.lecturer,
        Category: c.category,
        Semester: c.semester,
        Students: c.students,
        "Avg progress": `${c.avgProgress}%`,
        Status: c.status,
      }))
    );
    UI.toast(`${list.length} courses exported as CSV.`);
  });

  render();
});
