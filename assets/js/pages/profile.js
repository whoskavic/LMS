// Profil (semua role) — edit data diri, ganti password (validasi), pilihan tema, reset data demo

App.ready(() => {
  let me = Store.currentUser();
  const infoForm = document.getElementById("info-form");
  const passwordForm = document.getElementById("password-form");
  const ID_LABEL = { student: "NIM", lecturer: "NIDN", admin: "Staff ID" };

  function renderSummary() {
    document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = me.name));
    document.querySelectorAll("[data-user-title]").forEach((el) => (el.textContent = Domain.userTitle(me)));
    document.querySelectorAll("[data-avatar]").forEach((el) => (el.textContent = Utils.initials(me.name)));
    document.getElementById("profile-email").textContent = me.email;
    document.getElementById("profile-role").textContent = Domain.roleLabel(me.role);

    const extra =
      me.role === "student"
        ? [["Courses", DB.where("enrollments", (e) => e.studentId === me.id).length], ["GPA", Store.gpa(me.id)?.toFixed(2) ?? "–"]]
        : me.role === "lecturer"
          ? [["Courses taught", Store.coursesOf(me.id).length]]
          : [["Users managed", DB.all("users").length]];
    document.getElementById("profile-details").innerHTML = [[ID_LABEL[me.role], me.idNumber], ["Department", me.department], ...extra]
      .map(([label, value]) => `<dt>${label}</dt><dd>${Utils.escape(value)}</dd>`)
      .join("");
  }

  /* ---------- Data diri ---------- */
  infoForm.elements.name.value = me.name;
  infoForm.elements.email.value = me.email;
  infoForm.elements.department.value = me.department;

  infoForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = UI.formValues(infoForm);
    const rules = {
      name: !v.name ? "Full name is required." : v.name.length < 3 ? "Name must be at least 3 characters." : !/^[A-Za-z.' -]+$/.test(v.name) ? "Use letters, spaces, dots, or apostrophes only." : "",
      department: !v.department ? "Department is required." : v.department.length < 2 ? "Department is too short." : "",
    };
    Object.entries(rules).forEach(([name, message]) => UI.fieldError(infoForm, name, message));
    const invalid = Object.keys(rules).find((name) => rules[name]);
    if (invalid) return infoForm.elements[invalid].focus();

    me = DB.update("users", me.id, { name: v.name, department: v.department });
    renderSummary();
    UI.toast("Profile updated.");
  });

  /* ---------- Ganti password ---------- */
  passwordForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = { current: passwordForm.elements.current.value, next: passwordForm.elements.next.value, confirm: passwordForm.elements.confirm.value };
    const rules = {
      current: !v.current ? "Enter your current password." : v.current !== me.password ? "Current password is incorrect." : "",
      next: !v.next
        ? "Enter a new password."
        : !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(v.next)
          ? "Use at least 8 characters with letters and numbers."
          : v.next === v.current
            ? "The new password must be different from the current one."
            : "",
      confirm: !v.confirm ? "Confirm your new password." : v.confirm !== v.next ? "Passwords do not match." : "",
    };
    Object.entries(rules).forEach(([name, message]) => UI.fieldError(passwordForm, name, message));
    const invalid = Object.keys(rules).find((name) => rules[name]);
    if (invalid) return passwordForm.elements[invalid].focus();

    me = DB.update("users", me.id, { password: v.next });
    Store.logActivity("Changed account password");
    passwordForm.reset();
    UI.toast("Password updated. Use it the next time you sign in.");
  });

  // Hapus pesan error saat pengguna mulai mengetik lagi
  [infoForm, passwordForm].forEach((form) =>
    form.addEventListener("input", (e) => {
      const field = e.target.closest(".field");
      if (field?.classList.contains("is-invalid")) UI.fieldError(form, field.dataset.field, "");
    })
  );

  /* ---------- Tema ---------- */
  const themeOptions = document.getElementById("theme-options");
  themeOptions.querySelector(`input[value="${Theme.get()}"]`).checked = true;
  themeOptions.addEventListener("change", (e) => {
    Theme.set(e.target.value);
    UI.toast(`Theme set to ${e.target.value}.`);
  });

  /* ---------- Reset data demo ---------- */
  document.getElementById("reset-demo").addEventListener("click", () => {
    UI.modal({
      title: "Reset demo data?",
      body: "<p>All courses, users, progress, quiz attempts, and grades will return to the original mock data. You will be signed out.</p>",
      confirmText: "Reset data",
      variant: "danger",
      onConfirm: () => {
        Store.resetDemo();
        Api.session.clear();
        Store.setFlash("Demo data has been reset.");
        location.href = "../index.html";
      },
    });
  });

  renderSummary();
});
