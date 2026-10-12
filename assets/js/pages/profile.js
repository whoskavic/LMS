// Profil (semua role) — edit data diri, ganti password, pilihan tema, reset data demo
//
// REFERENCE IMPLEMENTATION halaman yang sudah memakai Api (Sprint 1). Pola yang diikuti halaman lain:
// 1. Semua kode di dalam App.ready((me) => …) — `me` adalah user dari Api.auth.me().
// 2. Data dimuat dengan UI.load(container, loader, render) → otomatis loading / error + "Try again".
// 3. Form: validasi ringan di klien (wajib isi), aturan lengkap diputuskan server (MockServer).
//    Error server per field (ApiError.fields) ditampilkan dengan UI.applyFieldErrors, error lain → toast.
// 4. Tombol submit dibungkus UI.busy agar tidak bisa diklik dua kali selama request berjalan.
// 5. Tidak ada akses DB / Store / SEED / localStorage langsung dari halaman.

App.ready((me) => {
  const infoForm = document.getElementById("info-form");
  const passwordForm = document.getElementById("password-form");
  const details = document.getElementById("profile-details");

  /* ---------- Ringkasan profil ---------- */
  // Nama, keterangan, dan avatar ikut diperbarui di sidebar & topbar
  function renderIdentity(user) {
    document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = user.name));
    document.querySelectorAll("[data-user-title]").forEach((el) => (el.textContent = Domain.userTitle(user)));
    document.querySelectorAll("[data-avatar]").forEach((el) => (el.textContent = Utils.initials(user.name)));
    document.getElementById("profile-email").textContent = user.email;
    document.getElementById("profile-role").textContent = Domain.roleLabel(user.role);
  }

  function renderDetails(stats) {
    const learner = [
      ["Courses enrolled", stats.courses],
      ["Completed", stats.completed],
      ["Certificates", stats.certificates],
    ];
    const rows =
      stats.role === "student"
        ? learner
        : stats.role === "instructor"
          ? [["Courses taught", stats.coursesTaught], ...learner]
          : [["Users managed", stats.usersManaged]];
    details.innerHTML = `<dl class="detail-list">${rows
      .map(([label, value]) => `<dt>${Utils.escape(label)}</dt><dd>${Utils.escape(value)}</dd>`)
      .join("")}</dl>`;
  }

  const loadDetails = () => UI.load(details, () => Api.profile.stats(), renderDetails);

  /* ---------- Data diri ---------- */
  infoForm.elements.name.value = me.name;
  infoForm.elements.email.value = me.email;

  infoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = UI.formValues(infoForm);
    const rules = {
      name: v.name ? "" : "Full name is required.",
    };
    Object.entries(rules).forEach(([name, message]) => UI.fieldError(infoForm, name, message));
    const invalid = Object.keys(rules).find((name) => rules[name]);
    if (invalid) return infoForm.elements[invalid].focus();

    try {
      const user = await UI.busy(infoForm.querySelector('[type="submit"]'), Api.profile.update({ name: v.name }));
      Object.assign(me, user);
      renderIdentity(me);
      loadDetails();
      UI.toast("Profile updated.");
    } catch (err) {
      if (!UI.applyFieldErrors(infoForm, err)) UI.toast(err.message, "error");
    }
  });

  /* ---------- Ganti password ---------- */
  passwordForm.elements.username.value = me.email;

  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { current, next, confirm } = passwordForm.elements;
    const rules = {
      current: current.value ? "" : "Enter your current password.",
      next: next.value ? "" : "Enter a new password.",
      confirm: !confirm.value ? "Confirm your new password." : confirm.value !== next.value ? "Passwords do not match." : "",
    };
    Object.entries(rules).forEach(([name, message]) => UI.fieldError(passwordForm, name, message));
    const invalid = Object.keys(rules).find((name) => rules[name]);
    if (invalid) return passwordForm.elements[invalid].focus();

    try {
      await UI.busy(passwordForm.querySelector('[type="submit"]'), Api.auth.changePassword(current.value, next.value));
      passwordForm.reset();
      passwordForm.elements.username.value = me.email;
      UI.toast("Password updated. Use it the next time you sign in.");
    } catch (err) {
      if (!UI.applyFieldErrors(passwordForm, err)) UI.toast(err.message, "error");
    }
  });

  // Hapus pesan error saat pengguna mulai mengetik lagi
  [infoForm, passwordForm].forEach((form) =>
    form.addEventListener("input", (e) => {
      const field = e.target.closest(".field");
      if (field?.classList.contains("is-invalid")) UI.fieldError(form, field.dataset.field, "");
    })
  );

  /* ---------- Tema (preferensi per perangkat, bukan data server) ---------- */
  const themeOptions = document.getElementById("theme-options");
  themeOptions.querySelector(`input[value="${Theme.get()}"]`).checked = true;
  themeOptions.addEventListener("change", (e) => {
    Theme.set(e.target.value);
    UI.toast(`Theme set to ${e.target.value}.`);
  });

  /* ---------- Reset data demo ---------- */
  document.getElementById("reset-demo")?.addEventListener("click", () => {
    UI.modal({
      title: "Reset demo data?",
      body: "<p>All courses, users, progress, quiz attempts, and certificates will return to the original mock data. You will be signed out.</p>",
      confirmText: "Reset data",
      variant: "danger",
      onConfirm: async () => {
        try {
          await Api.dev.reset();
        } catch (err) {
          UI.toast(err.message, "error");
          throw err; // modal tetap terbuka
        }
        Api.session.clear();
        UI.flash("Demo data has been reset.");
        location.href = App.loginUrl;
      },
    });
  });

  renderIdentity(me);
  loadDetails();
});
