// Form Course (dosen) — buat / edit course milik sendiri, validasi input dengan JavaScript
// Course baru dikirim ke admin untuk disetujui (status Pending).

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("course-form");
  const el = form.elements;
  const me = Store.currentUser();
  const editId = Utils.params().get("id");
  const found = editId ? DB.get("courses", editId) : null;
  const editing = found && found.lecturerId === me.id ? found : null;

  if (editId && !editing) {
    Store.setFlash("Course not found or you are not its lecturer.", "error");
    location.replace("data-master.html");
    return;
  }

  // --- Opsi select ---
  const courses = DB.all("courses");
  el.category.insertAdjacentHTML(
    "beforeend",
    Utils.unique([...SEED.categories, ...courses.map((c) => c.category)])
      .map((v) => `<option value="${Utils.escape(v)}">${Utils.escape(v)}</option>`)
      .join("")
  );

  // Warna thumbnail course baru
  const COLORS = ["#c7d2fe", "#bbf7d0", "#fbcfe8", "#fef3c7", "#bae6fd", "#ddd6fe", "#fed7aa", "#cffafe"];

  // --- Mode edit: isi form dengan data lama ---
  if (editing) {
    const published = editing.status === "Active" || editing.status === "Archived";
    document.title = "Edit Course | Learnova LMS";
    document.getElementById("form-title").textContent = "Edit Course";
    document.getElementById("crumb-current").textContent = `Edit ${editing.code}`;
    if (published || editing.status === "Pending") {
      document.querySelectorAll("[data-label-edit]").forEach((btn) => (btn.textContent = btn.dataset.labelEdit));
    }
    // Course yang sudah terbit tidak bisa dikembalikan ke draft
    if (published) document.querySelectorAll('[data-action="draft"]').forEach((btn) => btn.remove());
    document.getElementById("approval-note").textContent = {
      Active: "This course is published. Changes are visible to students immediately.",
      Pending: "This course is waiting for administrator approval.",
      Rejected: "This course was rejected. Update it and submit again for approval.",
      Draft: "This course is a draft. Submit it when it is ready for review.",
      Archived: "This course is archived and hidden from new students.",
    }[editing.status];
    ["title", "description", "category", "semester", "duration", "startDate", "code", "maxStudents"].forEach(
      (name) => (el[name].value = editing[name] ?? "")
    );
    el.enrollmentOpen.checked = editing.enrollmentOpen;
    el.certificate.checked = editing.certificate;
  }

  // --- Aturan validasi ---
  const today = new Date().toISOString().slice(0, 10);
  const normalizeCode = (v) => v.replace("-", "");

  const rules = {
    title: (v) => {
      if (!v) return "Course title is required.";
      if (v.length < 5) return "Title must be at least 5 characters.";
      return "";
    },
    description: (v) => {
      if (!v) return "Description is required.";
      if (v.length < 20) return `Description must be at least 20 characters (${v.length}/20).`;
      return "";
    },
    category: (v) => (v ? "" : "Please choose a category."),
    semester: (v) => (v ? "" : "Please choose a semester."),
    duration: (v) => {
      const n = Number(v);
      if (!v) return "Duration is required.";
      if (!Number.isInteger(n) || n < 1 || n > 52) return "Duration must be a whole number between 1 and 52 weeks.";
      return "";
    },
    startDate: (v) => {
      if (!v) return "Start date is required.";
      if (!editing && v < today) return "Start date cannot be in the past.";
      return "";
    },
    code: (v) => {
      if (!v) return "Course code is required.";
      if (!/^[A-Z]{2,5}-?\d{3}$/.test(v)) return "Use a format like DES-405 or CS101.";
      const taken = courses.some((c) => c.id !== editing?.id && normalizeCode(c.code) === normalizeCode(v));
      if (taken) return "This course code is already used by another course.";
      return "";
    },
    maxStudents: (v) => {
      const n = Number(v);
      if (!v) return "Maximum students is required.";
      if (!Number.isInteger(n) || n < 1 || n > 500) return "Enter a whole number between 1 and 500.";
      const enrolled = editing ? Store.enrollmentsOf(editing.id).length : 0;
      if (n < enrolled) return `Cannot be lower than current enrollment (${enrolled}).`;
      return "";
    },
  };

  function setError(name, message) {
    const field = form.querySelector(`[data-field="${name}"]`);
    field.classList.toggle("is-invalid", Boolean(message));
    field.querySelector(".field__error span").textContent = message;
    el[name].setAttribute("aria-invalid", String(Boolean(message)));
  }

  function validate(name) {
    const message = rules[name](el[name].value.trim());
    setError(name, message);
    return !message;
  }

  Object.keys(rules).forEach((name) => {
    el[name].addEventListener("blur", () => el[name].value && validate(name));
    el[name].addEventListener(el[name].tagName === "SELECT" ? "change" : "input", () => {
      if (el[name].getAttribute("aria-invalid") === "true") validate(name);
    });
  });

  // Kode course otomatis huruf besar
  el.code.addEventListener("input", () => {
    el.code.value = el.code.value.toUpperCase().replace(/\s/g, "");
  });

  // Penghitung karakter deskripsi
  const counter = document.getElementById("description-count");
  const updateCounter = () => (counter.textContent = el.description.value.length);
  el.description.addEventListener("input", updateCounter);
  updateCounter();

  // --- Status perubahan (dirty state) ---
  let dirty = false;
  const saveState = document.getElementById("save-state");
  if (!editing) saveState.querySelector("span").textContent = "New course · not saved yet";
  form.addEventListener("input", () => {
    if (dirty) return;
    dirty = true;
    saveState.classList.add("is-dirty");
    saveState.querySelector("span").textContent = "Unsaved changes";
  });

  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // --- Upload thumbnail (preview saja, tidak disimpan) ---
  const dropzone = document.getElementById("dropzone");
  const dropContent = document.getElementById("dropzone-content");

  function handleFile(file) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("thumbnail", "Only PNG or JPG images are allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("thumbnail", "Image must be 2 MB or smaller.");
      return;
    }
    setError("thumbnail", "");
    const reader = new FileReader();
    reader.onload = () => {
      dropContent.innerHTML = `
        <img class="dropzone__preview" src="${reader.result}" alt="Thumbnail preview">
        <span class="dropzone__hint">${Utils.escape(file.name)} · click to change</span>`;
    };
    reader.readAsDataURL(file);
  }

  el.thumbnail.addEventListener("change", () => handleFile(el.thumbnail.files[0]));
  ["dragenter", "dragover"].forEach((type) =>
    dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    })
  );
  ["dragleave", "drop"].forEach((type) =>
    dropzone.addEventListener(type, () => dropzone.classList.remove("is-dragover"))
  );
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  });

  // --- Batal ---
  const leave = () => {
    dirty = false;
    location.href = editing ? `course-detail.html?id=${editing.id}` : "data-master.html";
  };
  document.querySelectorAll('[data-action="cancel"]').forEach((btn) =>
    btn.addEventListener("click", () => {
      if (!dirty) return leave();
      UI.modal({
        title: "Discard changes?",
        body: "<p>You have unsaved changes. They will be lost if you leave this page.</p>",
        confirmText: "Discard",
        variant: "danger",
        onConfirm: leave,
      });
    })
  );

  // --- Simpan (draft / publish) ---
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const action = e.submitter?.dataset.action || "publish";

    // Draft cukup judul; publish wajib semua field valid
    const fields = action === "draft" ? ["title"] : Object.keys(rules);
    Object.keys(rules).forEach((name) => !fields.includes(name) && setError(name, ""));
    const invalid = fields.filter((name) => !validate(name));

    if (invalid.length) {
      el[invalid[0]].focus();
      UI.toast(`Please fix ${invalid.length} highlighted field${invalid.length > 1 ? "s" : ""}.`, "error");
      return;
    }

    const value = (name) => el[name].value.trim();
    const data = {
      title: value("title"),
      description: value("description"),
      category: value("category"),
      semester: value("semester"),
      duration: Number(value("duration")) || null,
      startDate: value("startDate"),
      code: value("code") || "—",
      maxStudents: Number(value("maxStudents")) || null,
      enrollmentOpen: el.enrollmentOpen.checked,
      certificate: el.certificate.checked,
    };

    // Status: draft → Draft; kirim → Pending (menunggu admin); course yang sudah Active/Pending tetap
    const current = editing?.status;
    if (action === "draft") data.status = "Draft";
    else data.status = current === "Active" || current === "Archived" ? current : "Pending";

    let saved;
    if (editing) {
      saved = DB.update("courses", editing.id, data);
    } else {
      saved = DB.insert("courses", { ...data, lecturerId: me.id, color: COLORS[courses.length % COLORS.length] });
    }
    Store.logActivity(`${editing ? "Updated" : "Created"} course ${saved.code} ${saved.title} (${saved.status})`);

    dirty = false;
    const note = { Draft: "saved as draft", Pending: "submitted for admin approval" }[saved.status] || "updated";
    Store.setFlash(`"${saved.title}" ${note}.`);
    location.href = `course-detail.html?id=${saved.id}`;
  });
});
