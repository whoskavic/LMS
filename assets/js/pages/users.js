// Manajemen User (admin) — tab per role, cari, filter, sortir, tambah/edit (modal), nonaktifkan, hapus.
// Semua data dari Api.users (backend); filter, sort, dan pagination dikerjakan server.

App.ready((me) => {
  const PAGE_SIZE = 8;
  const table = document.getElementById("user-table");
  const tbody = document.getElementById("user-rows");
  const searchInput = document.getElementById("user-search");
  const globalSearch = document.getElementById("global-search");
  const departmentSelect = document.getElementById("filter-department");
  const statusSelect = document.getElementById("filter-user-status");
  const summary = document.getElementById("user-summary");
  const paginationNav = document.getElementById("user-pagination");

  const ROLE_INFO = {
    student: { id: "NIM", courses: "Enrolled", label: "student", idHint: "5–10 digits" },
    instructor: { id: "NIDN", courses: "Teaching", label: "instructor", idHint: "10 digits" },
    admin: { id: "Staff ID", courses: "Courses", label: "administrator", idHint: "Format ADM-001" },
  };

  const state = { role: "student", q: "", department: "", status: "", page: 1, key: "name", dir: "asc" };
  let current = { items: [], total: 0 }; // halaman yang sedang tampil
  let requestId = 0;

  const query = (extra = {}) => ({
    role: state.role,
    q: state.q,
    department: state.department,
    status: state.status,
    sort: `${state.dir === "desc" ? "-" : ""}${state.key}`,
    page: state.page,
    pageSize: PAGE_SIZE,
    ...extra,
  });

  /* ---------- Tab, jumlah per role, opsi departemen ---------- */
  async function renderTabs() {
    document.querySelectorAll("[data-role-tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.roleTab === state.role)));
    document.getElementById("id-header").querySelector(".sort-btn").firstChild.textContent = ROLE_INFO[state.role].id;
    document.getElementById("courses-header").querySelector(".sort-btn").firstChild.textContent = ROLE_INFO[state.role].courses;

    document.querySelectorAll("[data-count]").forEach((el) => {
      Api.users
        .list({ role: el.dataset.count, pageSize: 1 })
        .then((res) => (el.textContent = res.total))
        .catch(() => (el.textContent = "–"));
    });

    try {
      const departments = await Api.meta.departments(state.role);
      const selected = departmentSelect.value;
      departmentSelect.innerHTML =
        '<option value="">Department: All</option>' +
        departments.map((d) => `<option value="${Utils.escape(d)}">${Utils.escape(d)}</option>`).join("");
      departmentSelect.value = departments.includes(selected) ? selected : "";
      state.department = departmentSelect.value;
    } catch {
      // filter departemen opsional — tabel tetap bisa dimuat
    }
  }

  const actionButton = (action, u, icon, label, disabled = false) =>
    `<button class="icon-btn icon-btn--sm ${action === "delete" ? "icon-btn--danger" : ""}" type="button" data-action="${action}" data-id="${Utils.escape(u.id)}"
       aria-label="${Utils.escape(label)}" title="${Utils.escape(label)}" ${disabled ? "disabled" : ""}><i data-icon="${icon}" class="icon--sm"></i></button>`;

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
        <td>${Utils.escape(Utils.orDash(u.idNumber))}</td>
        <td>${Utils.escape(Utils.orDash(u.department))}</td>
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

  /* ---------- Tabel (loading / empty / error) ---------- */
  async function render() {
    const id = ++requestId;
    UI.loading(tbody, { label: "Loading users…" });
    summary.textContent = "";
    try {
      const res = await Api.users.list(query());
      if (id !== requestId) return; // respons lama (filter sudah berubah)
      current = res;
      state.page = res.page;
      UI.pagination(paginationNav, state, res.total, PAGE_SIZE, render);
      tbody.removeAttribute("aria-busy");
      if (!res.items.length) {
        const filtering = state.q || state.department || state.status;
        UI.empty(tbody, {
          title: filtering ? "No users match your search or filters" : `No ${ROLE_INFO[state.role].label}s yet`,
          icon: "users",
          action: filtering ? undefined : { label: `Add ${ROLE_INFO[state.role].label}`, onClick: () => openForm(null) },
        });
        summary.textContent = "Showing 0 users";
        return;
      }
      tbody.innerHTML = res.items.map(rowTemplate).join("");
      const start = (res.page - 1) * res.pageSize;
      summary.textContent = `Showing ${start + 1}–${start + res.items.length} of ${res.total} ${ROLE_INFO[state.role].label}s`;
      renderIcons(tbody);
    } catch (err) {
      if (id !== requestId) return;
      paginationNav.innerHTML = "";
      UI.error(tbody, err, render, { title: "Could not load users" });
    }
  }

  function refresh() {
    renderTabs().then(render);
  }

  /* ---------- Form tambah / edit (modal) — aturan lengkap diputuskan server ---------- */
  async function openForm(user) {
    const role = user?.role || state.role;
    const info = ROLE_INFO[role];
    const departments = await Api.meta.departments().catch(() => []);

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
      onConfirm: async (modal) => {
        const form = modal.querySelector("form");
        const v = UI.formValues(form);
        const required = { name: "Full name is required.", email: "Email is required.", idNumber: `${info.id} is required.`, department: "Department is required." };
        if (!user) required.password = "Password is required.";
        const missing = Object.keys(required).filter((name) => !v[name]);
        Object.keys(required).forEach((name) => UI.fieldError(form, name, missing.includes(name) ? required[name] : ""));
        if (missing.length) {
          form.elements[missing[0]].focus();
          return false;
        }

        const data = { name: v.name, email: v.email, idNumber: v.idNumber, department: v.department, status: v.status };
        try {
          if (user) {
            await Api.users.update(user.id, data);
            UI.toast(`${v.name} updated.`);
          } else {
            await Api.users.create({ ...data, role, password: v.password });
            UI.toast(`${v.name} added as ${info.label}.`);
          }
        } catch (err) {
          if (!UI.applyFieldErrors(form, err)) UI.toast(err.message, "error");
          throw err; // modal tetap terbuka
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
    const user = current.items.find((u) => u.id === btn.dataset.id);
    if (!user) return;

    if (btn.dataset.action === "edit") return openForm(user);

    if (btn.dataset.action === "toggle") {
      const activate = user.status !== "Active";
      return UI.modal({
        title: activate ? "Activate account?" : "Deactivate account?",
        body: `<p><strong>${Utils.escape(user.name)}</strong> ${activate ? "will be able to sign in again." : "will no longer be able to sign in. Their data is kept."}</p>`,
        confirmText: activate ? "Activate" : "Deactivate",
        variant: activate ? "primary" : "danger",
        onConfirm: async () => {
          try {
            await Api.users.setStatus(user.id, activate ? "Active" : "Inactive");
          } catch (err) {
            UI.toast(err.message, "error");
            throw err;
          }
          UI.toast(`${user.name} is now ${activate ? "active" : "inactive"}.`);
          render();
        },
      });
    }

    // Hapus: server menolak (409) bila user masih punya course atau enrollment
    UI.modal({
      title: "Delete account?",
      body: `<p><strong>${Utils.escape(user.name)}</strong> (${Utils.escape(user.email)}) will be permanently removed. This action cannot be undone.</p>
             ${user.courses ? `<p class="text-muted">This account has ${user.courses} course${user.courses > 1 ? "s" : ""}. Accounts with courses or enrollments cannot be deleted — deactivate it instead.</p>` : ""}`,
      confirmText: "Delete",
      variant: "danger",
      onConfirm: async () => {
        try {
          await Api.users.remove(user.id);
        } catch (err) {
          UI.toast(err.message, "error");
          throw err;
        }
        UI.toast(`${user.name} deleted.`);
        refresh();
      },
    });
  });

  // Export: ambil semua baris yang cocok dengan filter (bukan hanya halaman aktif)
  document.getElementById("export-users").addEventListener("click", async (e) => {
    try {
      const res = await UI.busy(e.currentTarget, Api.users.list(query({ page: 1, pageSize: 200 })));
      if (!res.items.length) return UI.toast("Nothing to export.", "error");
      Utils.downloadCSV(
        `learnova-${state.role}s.csv`,
        res.items.map((u) => ({
          Name: u.name,
          Email: u.email,
          [ROLE_INFO[state.role].id]: u.idNumber ?? "",
          Department: u.department ?? "",
          [ROLE_INFO[state.role].courses]: u.courses ?? "",
          Status: u.status,
        }))
      );
      UI.toast(`${res.items.length} accounts exported as CSV.`);
    } catch (err) {
      UI.toast(err.message, "error");
    }
  });

  UI.sortable(table, state, () => {
    state.page = 1;
    render();
  });
  refresh();
});
