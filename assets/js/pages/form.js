// Form Course (instructor) — buat / edit course milik sendiri. Validasi cepat di klien, aturan lengkap di server.
// "Save draft" menyimpan tanpa mengajukan; "Submit for approval" menyimpan lalu mengirim transisi submit (Pending).

App.ready(async (me) => {
  const form = document.getElementById("course-form");
  const el = form.elements;
  const editId = Utils.params().get("id");
  const submitButtons = document.querySelectorAll('button[type="submit"][form="course-form"]');

  // --- Muat data (kategori + course yang diedit) ---
  submitButtons.forEach((btn) => (btn.disabled = true));
  let editing = null;
  try {
    const [categories, course] = await Promise.all([Api.meta.categories(), editId ? Api.courses.get(editId) : null]);
    el.category.insertAdjacentHTML(
      "beforeend",
      categories.map((v) => `<option value="${Utils.escape(v)}">${Utils.escape(v)}</option>`).join("")
    );
    if (course && course.instructorId !== me.id) throw new ApiError(403, "FORBIDDEN", "You are not the instructor of this course.");
    editing = course;
  } catch (err) {
    UI.flash(err.status === 404 || err.status === 403 ? "Course not found or you are not its instructor." : err.message, "error");
    location.replace("data-master.html");
    return;
  }
  submitButtons.forEach((btn) => (btn.disabled = false));

  // --- Mode edit: isi form dengan data lama ---
  if (editing) {
    const published = editing.status === "Active" || editing.status === "Archived";
    document.title = "Edit Course | Learnova LMS";
    document.getElementById("form-title").textContent = "Edit Course";
    document.getElementById("crumb-current").textContent = `Edit ${editing.title}`;
    if (!["Draft", "Rejected"].includes(editing.status)) {
      document.querySelectorAll("[data-label-edit]").forEach((btn) => (btn.textContent = btn.dataset.labelEdit));
    }
    // Course yang sudah diajukan / terbit tidak punya tombol "Save draft" (status hanya berubah lewat transisi)
    if (published || editing.status === "Pending") document.querySelectorAll('[data-action="draft"]').forEach((btn) => btn.remove());
    document.getElementById("approval-note").textContent = {
      Active: "This course is published. Changes are visible to learners immediately.",
      Pending: "This course is waiting for administrator approval.",
      Rejected: `This course was rejected${editing.rejectionReason ? `: “${editing.rejectionReason}”` : ""}. Update it and submit again for approval.`,
      Draft: "This course is a draft. Submit it when it is ready for review.",
      Archived: "This course is archived and hidden from new learners.",
    }[editing.status];
    if (["Draft", "Rejected"].includes(editing.status) && !editing.modules) {
      document.getElementById("approval-note").textContent += " Add at least one module before submitting for approval.";
    }
    ["title", "description", "category", "thumbnailUrl"].forEach(
      (name) => (el[name].value = editing[name] ?? "")
    );
    el.certificate.checked = editing.certificate;
  }


  // --- Aturan validasi ---
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
    thumbnailUrl: (v) => (!v || /^https?:\/\/\S+$/.test(v) ? "" : "Enter a valid http(s) URL."),
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
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitter = e.submitter;
    const action = submitter?.dataset.action || "publish";

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
      thumbnailUrl: value("thumbnailUrl"),
      certificate: el.certificate.checked,
    };

    const save = async () => {
      const saved = editing ? await Api.courses.update(editing.id, data) : await Api.courses.create(data);
      editing = saved;
      // Draft / Rejected + "Submit for approval" → transisi submit (status Pending)
      if (action === "publish" && ["Draft", "Rejected"].includes(saved.status)) {
        return Api.courses.transition(saved.id, "submit");
      }
      return saved;
    };

    try {
      const saved = await UI.busy(submitter, save);
      dirty = false;
      const note = { Draft: "saved as draft", Pending: "submitted for admin approval" }[saved.status] || "updated";
      UI.flash(`"${saved.title}" ${note}.`);
      location.href = `course-detail.html?id=${encodeURIComponent(saved.id)}`;
    } catch (err) {
      // Tersimpan sebagai Draft tetapi belum punya modul → lanjutkan ke tab Modules
      if (err.code === "COURSE_HAS_NO_MODULES" && editing) {
        dirty = false;
        UI.flash(`"${editing.title}" was saved as a draft. ${err.message}`, "error");
        location.href = `course-detail.html?id=${encodeURIComponent(editing.id)}#modules`;
        return;
      }
      // Error per field dari server (mis. kode course sudah dipakai, data belum lengkap)
      Object.entries(err.fields || {}).forEach(([name, message]) => form.querySelector(`[data-field="${name}"]`) && setError(name, message));
      UI.toast(err.message, "error");
      // Course baru sudah tersimpan sebagai Draft tetapi gagal diajukan → lanjutkan sebagai edit
      if (editing && !editId) history.replaceState(null, "", `?id=${encodeURIComponent(editing.id)}`);
    }
  });
});
