// Halaman login — alur dua langkah (email → password), validasi form & autentikasi dengan akun hardcode (data.js)

document.addEventListener("DOMContentLoaded", () => {
  // Sudah login (token masih berlaku) → langsung ke dashboard sesuai role
  App.session
    .then((user) => user && location.replace(nextAfterLogin(user.role)))
    .catch(() => {});

  // Bawa ?next= ke halaman Sign up agar setelah registrasi kembali ke course yang dipilih
  const next = new URLSearchParams(location.search).get("next");
  if (next) document.querySelectorAll("[data-keep-next]").forEach((a) => (a.href = `register.html?next=${encodeURIComponent(next)}`));

  const form = document.getElementById("login-form");
  const alertBox = document.getElementById("login-alert");
  const emailInput = form.elements.email;
  const passwordInput = form.elements.password;

  const rules = {
    email: (v) => {
      if (!v) return "Email is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email address.";
      return "";
    },
    password: (v) => {
      if (!v) return "Password is required.";
      if (v.length < 6) return "Password must be at least 6 characters.";
      return "";
    },
  };

  const validate = (name) => {
    const input = form.elements[name];
    const message = rules[name](input.value.trim());
    const field = form.querySelector(`[data-field="${name}"]`);
    field.classList.toggle("is-invalid", Boolean(message));
    field.querySelector(".field__error span").textContent = message;
    input.setAttribute("aria-invalid", String(Boolean(message)));
    return !message;
  };

  Object.keys(rules).forEach((name) => {
    const input = form.elements[name];
    input.addEventListener("blur", () => input.value && validate(name));
    input.addEventListener("input", () => {
      alertBox.hidden = true;
      if (input.getAttribute("aria-invalid") === "true") validate(name);
    });
  });

  // Dua langkah seperti Udemy: isi email → Continue → isi password → Log in
  const submitBtn = document.getElementById("login-submit");
  let step = "email";

  function showStep(next) {
    step = next;
    form.querySelectorAll("[data-step]").forEach((el) => (el.hidden = el.dataset.step !== step));
    submitBtn.textContent = step === "email" ? "Continue" : "Log in";
    document.getElementById("account-email").textContent = emailInput.value.trim();
    (step === "email" ? emailInput : passwordInput).focus();
  }

  document.getElementById("change-email").addEventListener("click", () => {
    alertBox.hidden = true;
    passwordInput.value = "";
    showStep("email");
  });

  const showAlert = (message) => {
    document.getElementById("login-alert-text").textContent = message;
    alertBox.hidden = false;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;
    alertBox.hidden = true;

    if (step === "email") {
      if (validate("email")) showStep("password");
      else emailInput.focus();
      return;
    }

    const invalid = Object.keys(rules).filter((name) => !validate(name));
    if (invalid.length) {
      if (invalid[0] === "email") return showStep("email");
      form.elements[invalid[0]].focus();
      return;
    }

    try {
      const { user } = await UI.busy(submitBtn, Api.auth.login(emailInput.value.trim(), passwordInput.value));
      UI.flash(`Welcome back, ${user.name}!`);
      location.href = nextAfterLogin(user.role);
    } catch (err) {
      showAlert(err.message);
      if (err.status === 401 || err.status === 403) passwordInput.value = "";
      passwordInput.focus();
    }
  });

  // Tampilkan / sembunyikan password
  const toggle = document.querySelector("[data-toggle-password]");
  toggle.addEventListener("click", () => {
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    toggle.querySelector("svg").innerHTML = ICONS[show ? "eye-off" : "eye"];
  });

  // Kembalikan semua data ke kondisi awal (untuk persiapan demo)
  document.getElementById("reset-demo")?.addEventListener("click", () => {
    UI.modal({
      title: "Reset demo data?",
      body: "<p>All courses, users, progress, quiz attempts, and certificates will return to the original mock data.</p>",
      confirmText: "Reset data",
      variant: "danger",
      onConfirm: async () => {
        try {
          await Api.dev.reset();
          UI.toast("Demo data has been reset.");
        } catch (err) {
          UI.toast(err.message, "error");
          throw err;
        }
      },
    });
  });

  // Isi otomatis dari akun demo
  document.querySelectorAll(".demo-account").forEach((btn) => {
    btn.addEventListener("click", () => {
      emailInput.value = btn.dataset.email;
      passwordInput.value = btn.dataset.password;
      alertBox.hidden = true;
      Object.keys(rules).forEach(validate);
      showStep("password");
      submitBtn.focus();
    });
  });
});
