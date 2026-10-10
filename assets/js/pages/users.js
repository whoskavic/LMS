// Manajemen User (admin) — tab per role, cari, filter, sortir, tambah/edit (modal + validasi), nonaktifkan, hapus

App.ready(() => {
  const PAGE_SIZE = 8;
  const me = Store.currentUser();
  const table = document.getElementById("user-table");
  const tbody = document.getElementById("user-rows");
  const searchInput = document.getElementById("user-search");
  const globalSearch = document.getElementById("global-search");
  const departmentSelect = document.getElementById("filter-department");
  const statusSelect = document.getElementById("filter-user-status");

  const ROLE_INFO = {
    student: { id: "NIM", courses: "Enrolled", label: "student", pattern: /^\d{5,10}$/, idHint: "5–10 digits" },
    lecturer: { id: "NIDN", courses: "Teaching", label: "lecturer", pattern: /^\d{10}$/, idHint: "10 digits" },
    admin: { id: "Staff ID", courses: "Courses", label: "administrator", pattern: /^[A-Z]{3}-\d{3}$/, idHint: "Format ADM-001" },
  };

  const state = { role: "student", q: "", department: "", status: "", page: 1, key: "name", dir: "asc" };

  const courseCount = (u) =>
    u.role === "student"
      ? DB.where("enrollments", (e) => e.studentId === u.id).length
      : u.role === "lecturer"
        ? Store.coursesOf(u.id).length
        : null;

  const rows = () => DB.where("users", (u) => u.role === state.role).map((u) => ({ ...u, courses: courseCount(u) }));

  function filtered() {
    const q = state.q.toLowerCase();
    const list = rows().filter(
      (u) =>
        (!q || [u.name, u.email, u.idNumber].some((v) => v.toLowerCase().includes(q))) &&
        (!state.department || u.department === state.department) &&
        (!state.status || u.status === state.status)
    );
    return Utils.sortBy(list, state.key, state.dir);
  }

  function renderTabs() {
    document.querySelectorAll("[data-count]").forEach((el) => {
      el.textContent = DB.where("users", (u) => u.role === el.dataset.count).length;
    });
    document.querySelectorAll("[data-role-tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.roleTab === state.role)));
    document.getElementById("id-header").querySelector(".sort-btn").firstChild.textContent = ROLE_INFO[state.role].id;
    document.getElementById("courses-header").querySelector(".sort-btn").firstChild.textContent = ROLE_INFO[state.role].courses;

    const current = departmentSelect.value;
    departmentSelect.innerHTML =
      '<option value="">Department: All</option>' +
      Utils.unique(rows().map((u) => u.department)).map((d) => `<option value="${Utils.escape(d)}">${Utils.escape(d)}</option>`).join("");
    departmentSelect.value = Utils.unique(rows().map((u) => u.department)).includes(current) ? current : "";
    state.department = departmentSelect.value;
  }

  const actionButton = (action, u, icon, label, disabled = false) =>
    `<button class="icon-btn icon-btn--sm ${action === "delete" ? "icon-btn--danger" : ""}" type="button" data-action="${action}" data-id="${u.id}"
       aria-label="${label}" title="${label}" ${disabled ? "disabled" : ""}><i data-icon="${icon}" class="icon--sm"></i></button>`;

  const rowTemplate = (u) => {
    const self = u.id === me.id;
    const active = u.status === "Active";
    return `
      <tr>
        <td>
          <div class="user-cell">
            <span class="avatar avatar--sm ${u.role === "student" ? "" : "avatar--dark"}" aria-hidden="true">${Utils.initials(u.name)}</span>
            <span>${Utils.escape(u.name)}${self ? ' <span class="badge badge--primary">You</span>' : ""}<span class="user-cell__email">${Utils.escape(u.email)}</span></span>
          </div>
        </td>
        <td>${Utils.escape(u.idNumber)}</td>
        <td>${Utils.escape(u.department)}</td>
        <td>${u.courses ?? "–"}</td>
        <td>${Utils.statusBadge(u.status)}</td>
        <td>
          <div class="table__actions">
            ${actionButton("edit", u, "edit", `Edit ${u.name}`)}
            ${actionButton("toggle", u, active ? "lock" : "check-circle", self ? "You cannot deactivate yourself" : active ? `Deactivate ${u.name}` : `Activate ${u.name}`, self)}
            ${actionButton("delete", u, "trash", self ? "You cannot delete yourself" : `Delete ${u.name}`, self)}
          </div>
        </td>
      </tr>`;
  };

  function render() {
    const list = filtered();
    const start = UI.pagination(document.getElementById("user-pagination"), state, list.length, PAGE_SIZE, render);
    const pageRows = list.slice(start, start + PAGE_SIZE);
    tbody.innerHTML = pageRows.length
      ? pageRows.map(rowTemplate).join("")
      : '<tr><td class="table__empty" colspan="6">No users match your search or filters.</td></tr>';
    document.getElementById("user-summary").textContent = list.length
      ? `Showing ${start + 1}–${start + pageRows.length} of ${list.length} ${ROLE_INFO[state.role].label}s`
      : "Showing 0 users";
    renderIcons(tbody);
  }

  function refresh() {
    renderTabs();
    render();
  }

  /* ---------- Form tambah / edit (modal) ---------- */
  function openForm(user) {
    const role = user?.role || state.role;
    const info = ROLE_INFO[role];
    const departments = Utils.unique(DB.all("users").map((u) => u.department));

    UI.modal({
      title: user ? `Edit ${info.label}` : `Add ${info.label}`,
      size: "lg",
      confirmText: user ? "Save changes" : "Create account",
      body: `
        <form class="form-stack" novalidate>
          <div class="field-row">
            ${UI.field({ name: "name", label: "Full name", value: user?.name || "", placeholder: "e.g. Nadia Putri", attrs: 'maxlength="60"' })}
            ${UI.field({ name: "email", label: "Email", type: "email", value: user?.email || "", placeholder: "name@learnova.ac.id" })}
          </div>
          <div class="field-row">
            ${UI.field({ name: "idNumber", label: info.id, value: user?.idNumber || "", hint: info.idHint })}
            ${UI.field({ name: "department", label: role === "student" ? "Study program" : "Department", value: user?.department || "", attrs: 'list="department-list" maxlength="60"' })}
          </div>
          <datalist id="department-list">${departments.map((d) => `<option value="${Utils.escape(d)}"></option>`).join("")}</datalist>
          <div class="field-row">
            ${UI.field({ name: "status", label: "Status", value: user?.status || "Active", options: ["Active", "Inactive"] })}
            ${user ? "" : UI.field({ name: "password", label: "Initial password", type: "password", hint: "At least 8 characters, with letters and numbers.", attrs: 'autocomplete="new-password"' })}
          </div>
        </form>`,
      onConfirm: (modal) => {
        const form = modal.querySelector("form");
        const v = UI.formValues(form);
        const taken = (key, value) =>
          DB.all("users").some((u) => u.id !== user?.id && String(u[key]).toLowerCase() === value.toLowerCase());

        const rules = {
          name: !v.name ? "Full name is required." : v.name.length < 3 ? "Name must be at least 3 characters." : "",
          email: !v.email
            ? "Email is required."
            : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)
              ? "Enter a valid email address."
              : taken("email", v.email)
                ? "This email is already registered."
                : "",
          idNumber: !v.idNumber
            ? `${info.id} is required.`
            : !info.pattern.test(v.idNumber)
              ? `${info.id} must be ${info.idHint.toLowerCase()}.`
              : taken("idNumber", v.idNumber)
                ? `This ${info.id} is already used.`
                : "",
          department: v.department ? "" : "Department is required.",
          password: user
            ? ""
            : !v.password
              ? "Password is required."
              : !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(v.password)
                ? "Use at least 8 characters with letters and numbers."
                : "",
        };
        if (user && user.id === me.id && v.status !== "Active") rules.status = "You cannot deactivate your own account.";

        Object.entries(rules).forEach(([name, message]) => UI.fieldError(form, name, message));
        const firstInvalid = Object.keys(rules).find((name) => rules[name]);
        if (firstInvalid) {
          form.elements[firstInvalid]?.focus();
          return false;
        }

        const data = { name: v.name, email: v.email, idNumber: v.idNumber, department: v.department, status: v.status };
        if (user) {
          DB.update("users", user.id, data);
          Store.logActivity(`Updated ${info.label} account ${v.name}`);
          UI.toast(`${v.name} updated.`);
        } else {
          DB.insert("users", { ...data, role, password: v.password });
          Store.logActivity(`Created ${info.label} account ${v.name}`);
          UI.toast(`${v.name} added as ${info.label}.`);
        }
        refresh();
      },
    });
  }

  /* ---------- Event ---------- */
  document.querySelectorAll("[data-role-tab]").forEach((tab) =>
    tab.addEventListener("click", () => {
      state.role = tab.dataset.roleTab;
      state.page = 1;
      refresh();
    })
  );

  const onSearch = (value) => {
    state.q = value.trim();
    state.page = 1;
    searchInput.value = value;
    globalSearch.value = value;
    render();
  };
  searchInput.addEventListener("input", (e) => onSearch(e.target.value));
  globalSearch.addEventListener("input", (e) => onSearch(e.target.value));

  departmentSelect.addEventListener("change", () => {
    state.department = departmentSelect.value;
    state.page = 1;
    render();
  });
  statusSelect.addEventListener("change", () => {
    state.status = statusSelect.value;
    state.page = 1;
    render();
  });

  document.getElementById("add-user").addEventListener("click", () => openForm(null));

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const user = DB.get("users", btn.dataset.id);

    if (btn.dataset.action === "edit") return openForm(user);

    if (btn.dataset.action === "toggle") {
      const activate = user.status !== "Active";
      return UI.modal({
        title: activate ? "Activate account?" : "Deactivate account?",
        body: `<p><strong>${Utils.escape(user.name)}</strong> ${activate ? "will be able to sign in again." : "will no longer be able to sign in. Their data is kept."}</p>`,
        confirmText: activate ? "Activate" : "Deactivate",
        variant: activate ? "primary" : "danger",
        onConfirm: () => {
          DB.update("users", user.id, { status: activate ? "Active" : "Inactive" });
          Store.logActivity(`${activate ? "Activated" : "Deactivated"} account ${user.name}`);
          UI.toast(`${user.name} is now ${activate ? "active" : "inactive"}.`);
          refresh();
        },
      });
    }

    // Hapus: dosen yang masih punya course tidak boleh dihapus
    const teaching = user.role === "lecturer" ? Store.coursesOf(user.id).length : 0;
    if (teaching) {
      return UI.modal({
        title: "Cannot delete lecturer",
        body: `<p><strong>${Utils.escape(user.name)}</strong> still teaches ${teaching} course${teaching > 1 ? "s" : ""}.
               Delete or archive those courses first, or deactivate the account instead.</p>`,
      });
    }
    const enrolled = user.role === "student" ? courseCount(user) : 0;
    UI.modal({
      title: "Delete account?",
      body: `<p><strong>${Utils.escape(user.name)}</strong> (${Utils.escape(user.email)}) will be permanently removed${enrolled ? ` together with ${enrolled} course enrollments` : ""}. This action cannot be undone.</p>`,
      confirmText: "Delete",
      variant: "danger",
      onConfirm: () => {
        DB.where("enrollments", (x) => x.studentId === user.id).forEach((x) => DB.remove("enrollments", x.id));
        DB.remove("users", user.id);
        Store.logActivity(`Deleted account ${user.name}`);
        UI.toast(`${user.name} deleted.`);
        refresh();
      },
    });
  });

  document.getElementById("export-users").addEventListener("click", () => {
    const list = filtered();
    if (!list.length) return UI.toast("Nothing to export.", "error");
    Utils.downloadCSV(
      `learnova-${state.role}s.csv`,
      list.map((u) => ({
        Name: u.name,
        Email: u.email,
        [ROLE_INFO[state.role].id]: u.idNumber,
        Department: u.department,
        [ROLE_INFO[state.role].courses]: u.courses ?? "",
        Status: u.status,
      }))
    );
    UI.toast(`${list.length} accounts exported as CSV.`);
  });

  UI.sortable(table, state, () => {
    state.page = 1;
    render();
  });
  refresh();
});
