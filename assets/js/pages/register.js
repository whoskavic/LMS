// Halaman registrasi publik — semua akun baru adalah learner (student). Aturan lengkap divalidasi server.

document.addEventListener("DOMContentLoaded", () => {
  // Sudah login → langsung ke dashboard
  App.session.then((user) => user && location.replace(nextAfterLogin(user.role))).catch(() => {});

  const form = document.getElementById("register-form");
  const alertBox = document.getElementById("register-alert");
  const submitBtn = document.getElementById("register-submit");

  const rules = {
    name: (v) => (!v ? "Full name is required." : v.length < 3 ? "Name must be at least 3 characters." : ""),
    email: (v) => (!v ? "Email is required." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "Enter a valid email address." : ""),
    password: (v) => (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(v) ? "Use at least 8 characters with letters and numbers." : ""),
  };

  form.addEventListener("input", (e) => {
    alertBox.hidden = true;
    const field = e.target.closest(".field");
    if (field?.classList.contains("is-invalid")) UI.fieldError(form, field.dataset.field, "");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.hidden = true;
    const v = UI.formValues(form);
    const errors = Object.fromEntries(Object.entries(rules).map(([name, rule]) => [name, rule(v[name] || "")]));
    Object.entries(errors).forEach(([name, message]) => UI.fieldError(form, name, message));
    const invalid = Object.keys(errors).find((name) => errors[name]);
    if (invalid) return form.elements[invalid].focus();

    try {
      const { user } = await UI.busy(submitBtn, Api.auth.register({ name: v.name, email: v.email, password: v.password }));
      UI.flash(`Welcome to Learnova, ${user.name}!`);
      location.href = nextAfterLogin(user.role);
    } catch (err) {
      if (!UI.applyFieldErrors(form, err)) {
        document.getElementById("register-alert-text").textContent = err.message;
        alertBox.hidden = false;
      }
    }
  });
});
