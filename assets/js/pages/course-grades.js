// Detail Course · tab Students & Grades — progress & skor quiz mahasiswa, dosen mengisi nilai akhir

App.ready(() => {
  const { course, canEdit } = CourseDetail;
  if (!course) return;

  const table = document.getElementById("grade-table");
  const tbody = document.getElementById("grade-rows");
  const saveBtn = document.getElementById("save-grades");
  const state = { key: "name", dir: "asc" };
  const drafts = new Map(); // enrollmentId → nilai yang diketik tetapi belum disimpan

  if (!canEdit) document.getElementById("grade-hint").textContent = "Final grades are entered by the course lecturer.";

  const rows = () =>
    Store.enrollmentsOf(course.id).map((e) => {
      const student = DB.get("users", e.studentId);
      return {
        id: e.id,
        name: student?.name || "Unknown student",
        nim: student?.idNumber || "",
        progress: Store.progressOf(e),
        quiz: Store.averageQuiz(e),
        finalScore: e.finalScore,
        grade: e.grade,
      };
    });

  // Nilai kosong → tidak ada nilai; selain itu harus bilangan bulat 0–100
  const parseScore = (value) => {
    if (value === "") return { score: null };
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 100 ? { score: n } : { error: "Enter 0–100" };
  };

  const gradeCell = (score) => (score === null || score === undefined ? "–" : `<strong>${Store.gradeFromScore(score)}</strong>`);

  function rowTemplate(r) {
    const draft = drafts.has(r.id) ? drafts.get(r.id) : r.finalScore ?? "";
    const parsed = parseScore(String(draft));
    return `
      <tr>
        <td>${Utils.escape(r.name)}<span class="table__code">NIM ${Utils.escape(r.nim)}</span></td>
        <td>
          <div class="table-progress">
            <div class="progress"><div class="progress__bar" style="width: ${r.progress}%"></div></div>
            <span>${r.progress}%</span>
          </div>
        </td>
        <td>${r.quiz ?? "–"}</td>
        <td>
          ${
            canEdit
              ? `<div class="field ${parsed.error ? "is-invalid" : ""}">
                  <label class="visually-hidden" for="score-${r.id}">Final score for ${Utils.escape(r.name)}</label>
                  <input class="field__input grade-input" id="score-${r.id}" type="number" min="0" max="100" inputmode="numeric"
                    data-score="${r.id}" value="${Utils.escape(draft)}" placeholder="–">
                </div>`
              : r.finalScore ?? "–"
          }
        </td>
        <td data-grade-for="${r.id}">${parsed.error ? '<span class="text-danger">Invalid</span>' : gradeCell(parsed.score)}</td>
        ${
          canEdit
            ? `<td><button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-unenroll="${r.id}" aria-label="Remove ${Utils.escape(r.name)} from course"><i data-icon="trash" class="icon--sm"></i></button></td>`
            : ""
        }
      </tr>`;
  }

  function render() {
    const list = Utils.sortBy(rows(), state.key, state.dir);
    tbody.innerHTML = list.length
      ? list.map(rowTemplate).join("")
      : `<tr><td class="table__empty" colspan="${canEdit ? 6 : 5}">No students are enrolled in this course yet.${canEdit ? " Click “Add students” to enroll them." : ""}</td></tr>`;
    renderIcons(tbody);
    if (saveBtn) saveBtn.disabled = drafts.size === 0;
    CourseDetail.updateCounts();
  }

  /* ---------- Tambah mahasiswa (dosen pemilik) ---------- */
  function openEnrollForm() {
    if (course.status !== "Active") {
      UI.toast("Students can be added after the course is approved by the administrator.", "error");
      return;
    }
    const seats = Store.seatsLeft(course);
    if (!seats) return UI.toast("This course is full. Increase the capacity in “Edit course” first.", "error");

    const candidates = DB.where("users", (u) => u.role === "student" && u.status === "Active" && !Store.enrollment(u.id, course.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!candidates.length) return UI.toast("All active students are already enrolled.", "error");

    UI.modal({
      title: `Add students to ${course.code}`,
      size: "lg",
      confirmText: "Enroll selected",
      body: `
        <form class="form-stack" novalidate>
          <div class="field">
            <label class="field__label" for="enroll-search">Search student</label>
            <input class="field__input" id="enroll-search" type="search" placeholder="Name, NIM, or department" autocomplete="off">
            <p class="field__hint" id="enroll-hint">${seats} seat${seats === 1 ? "" : "s"} left · 0 selected</p>
          </div>
          <ul class="pick-list" id="enroll-list">
            ${candidates
              .map(
                (u) => `
              <li data-search="${Utils.escape(`${u.name} ${u.idNumber} ${u.department}`.toLowerCase())}">
                <label class="task">
                  <input type="checkbox" value="${u.id}">
                  <span>${Utils.escape(u.name)}<span class="table__code">NIM ${Utils.escape(u.idNumber)} · ${Utils.escape(u.department)}</span></span>
                </label>
              </li>`
              )
              .join("")}
          </ul>
        </form>`,
      onOpen: (modal) => {
        const hint = modal.querySelector("#enroll-hint");
        const items = [...modal.querySelectorAll("#enroll-list li")];
        modal.querySelector("#enroll-search").addEventListener("input", (e) => {
          const q = e.target.value.trim().toLowerCase();
          items.forEach((li) => (li.hidden = Boolean(q) && !li.dataset.search.includes(q)));
        });
        modal.querySelector("#enroll-list").addEventListener("change", () => {
          const selected = modal.querySelectorAll("#enroll-list input:checked").length;
          hint.textContent = `${seats} seat${seats === 1 ? "" : "s"} left · ${selected} selected`;
          hint.classList.toggle("text-danger", selected > seats);
        });
      },
      onConfirm: (modal) => {
        const ids = [...modal.querySelectorAll("#enroll-list input:checked")].map((el) => el.value);
        if (!ids.length) {
          UI.toast("Select at least one student.", "error");
          return false;
        }
        if (ids.length > seats) {
          UI.toast(`Only ${seats} seat${seats === 1 ? "" : "s"} left in this course.`, "error");
          return false;
        }
        const added = ids.filter((id) => Store.enrollStudent(id, course.id, { byLecturer: true }).enrollment).length;
        Store.logActivity(`Enrolled ${added} student${added > 1 ? "s" : ""} in ${course.code} ${course.title}`);
        UI.toast(`${added} student${added > 1 ? "s" : ""} enrolled in ${course.code}.`);
        render();
      },
    });
  }

  document.getElementById("add-students")?.addEventListener("click", openEnrollForm);

  // Keluarkan mahasiswa dari course
  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-unenroll]");
    if (!btn) return;
    const enrollment = DB.get("enrollments", btn.dataset.unenroll);
    const student = DB.get("users", enrollment.studentId);
    UI.modal({
      title: "Remove student?",
      body: `<p><strong>${Utils.escape(student?.name || "This student")}</strong> will be removed from ${Utils.escape(course.code)}. Their progress, quiz attempts, and grade in this course will be deleted.</p>`,
      confirmText: "Remove",
      variant: "danger",
      onConfirm: () => {
        DB.remove("enrollments", enrollment.id);
        drafts.delete(enrollment.id);
        Store.logActivity(`Removed ${student?.name || "a student"} from ${course.code}`);
        UI.toast("Student removed from course.");
        render();
      },
    });
  });

  // Ketik nilai → grade huruf langsung berubah
  tbody.addEventListener("input", (e) => {
    const input = e.target.closest("[data-score]");
    if (!input) return;
    const id = input.dataset.score;
    const original = Store.enrollmentsOf(course.id).find((x) => x.id === id).finalScore ?? "";
    const value = input.value.trim();
    if (value === String(original)) drafts.delete(id);
    else drafts.set(id, value);

    const parsed = parseScore(value);
    input.closest(".field").classList.toggle("is-invalid", Boolean(parsed.error));
    tbody.querySelector(`[data-grade-for="${id}"]`).innerHTML = parsed.error ? '<span class="text-danger">Invalid</span>' : gradeCell(parsed.score);
    saveBtn.disabled = drafts.size === 0;
  });

  saveBtn?.addEventListener("click", () => {
    const invalid = [...drafts.values()].filter((v) => parseScore(v).error).length;
    if (invalid) {
      UI.toast(`${invalid} score${invalid > 1 ? "s are" : " is"} invalid. Use whole numbers from 0 to 100.`, "error");
      tbody.querySelector(".field.is-invalid input")?.focus();
      return;
    }
    drafts.forEach((value, id) => {
      const { score } = parseScore(value);
      DB.update("enrollments", id, { finalScore: score, grade: score === null ? null : Store.gradeFromScore(score) });
    });
    const count = drafts.size;
    drafts.clear();
    Store.logActivity(`Updated ${count} final grade${count > 1 ? "s" : ""} in ${course.code}`);
    UI.toast(`${count} grade${count > 1 ? "s" : ""} saved. Students can now see them.`);
    render();
  });

  // Peringatan bila meninggalkan halaman dengan nilai yang belum disimpan
  window.addEventListener("beforeunload", (e) => {
    if (drafts.size) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  document.getElementById("export-grades").addEventListener("click", () => {
    const list = Utils.sortBy(rows(), state.key, state.dir);
    if (!list.length) return UI.toast("Nothing to export.", "error");
    Utils.downloadCSV(
      `learnova-${course.code.toLowerCase()}-grades.csv`,
      list.map((r) => ({ Student: r.name, NIM: r.nim, Progress: `${r.progress}%`, Quiz: r.quiz ?? "", "Final score": r.finalScore ?? "", Grade: r.grade ?? "" }))
    );
    UI.toast("Grades exported as CSV.");
  });

  UI.sortable(table, state, render);
  render();
});
