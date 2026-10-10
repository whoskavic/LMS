// Detail Course · tab Students & Grades — progress & skor quiz student, instructor mengisi nilai akhir.
// Grade huruf ditampilkan langsung (Domain.gradeFromScore) dan dihitung ulang server saat disimpan.

App.ready(async () => {
  const course = await CourseDetail.loaded;
  const { canEdit } = CourseDetail;

  const table = document.getElementById("grade-table");
  const tbody = document.getElementById("grade-rows");
  const saveBtn = document.getElementById("save-grades");
  const state = { key: "name", dir: "asc" };
  const drafts = new Map(); // enrollmentId → nilai yang diketik tetapi belum disimpan
  let rows = [];

  if (!canEdit) document.getElementById("grade-hint").textContent = "Final grades are entered by the course instructor.";

  // Nilai kosong → tidak ada nilai; selain itu harus bilangan bulat 0–100
  const parseScore = (value) => {
    if (value === "") return { score: null };
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 100 ? { score: n } : { error: "Enter 0–100" };
  };

  const gradeCell = (score) => (score === null || score === undefined ? "–" : `<strong>${Domain.gradeFromScore(score)}</strong>`);

  function rowTemplate(r) {
    const id = r.enrollmentId;
    const draft = drafts.has(id) ? drafts.get(id) : r.finalScore ?? "";
    const parsed = parseScore(String(draft));
    return `
      <tr>
        <td>${Utils.escape(r.name)}<span class="table__code">${r.nim ? `NIM ${Utils.escape(r.nim)}` : Utils.escape(r.email)}</span></td>
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
                  <label class="visually-hidden" for="score-${Utils.escape(id)}">Final score for ${Utils.escape(r.name)}</label>
                  <input class="field__input grade-input" id="score-${Utils.escape(id)}" type="number" min="0" max="100" inputmode="numeric"
                    data-score="${Utils.escape(id)}" value="${Utils.escape(draft)}" placeholder="–">
                </div>`
              : r.finalScore ?? "–"
          }
        </td>
        <td data-grade-for="${Utils.escape(id)}">${parsed.error ? '<span class="text-danger">Invalid</span>' : gradeCell(parsed.score)}</td>
        ${
          canEdit
            ? `<td><button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-unenroll="${Utils.escape(id)}" aria-label="Remove ${Utils.escape(r.name)} from course"><i data-icon="trash" class="icon--sm"></i></button></td>`
            : ""
        }
      </tr>`;
  }

  function render() {
    const list = Utils.sortBy(rows, state.key, state.dir);
    if (!list.length) {
      UI.empty(tbody, {
        title: "No students enrolled yet",
        text: canEdit ? "Students appear here after they enroll, or add them with “Add students”." : "",
        icon: "users",
      });
    } else {
      tbody.innerHTML = list.map(rowTemplate).join("");
      renderIcons(tbody);
    }
    if (saveBtn) saveBtn.disabled = drafts.size === 0;
  }

  async function load() {
    UI.loading(tbody, { label: "Loading students…" });
    try {
      rows = (await Api.grades.list(course.id, { pageSize: 200 })).items;
      tbody.removeAttribute("aria-busy");
      render();
    } catch (err) {
      UI.error(tbody, err, load, { title: "Could not load students" });
    }
  }

  /* ---------- Tambah student (instructor pemilik) ---------- */
  async function openEnrollForm() {
    if (course.status !== "Active") {
      UI.toast("Students can be added after the course is approved by the administrator.", "error");
      return;
    }
    const seats = course.maxStudents ? course.maxStudents - rows.length : Infinity;
    if (seats <= 0) return UI.toast("This course is full. Increase the capacity in “Edit course” first.", "error");
    let candidates;
    try {
      candidates = await Api.enrollments.candidates(course.id);
    } catch (err) {
      return UI.toast(err.message, "error");
    }
    if (!candidates.length) return UI.toast("All active students are already enrolled.", "error");
    const seatsText = Number.isFinite(seats) ? `${seats} seat${seats === 1 ? "" : "s"} left` : "No seat limit";

    UI.modal({
      title: `Add students to ${course.code || course.title}`,
      size: "lg",
      confirmText: "Enroll selected",
      body: `
        <form class="form-stack" novalidate>
          <div class="field">
            <label class="field__label" for="enroll-search">Search student</label>
            <input class="field__input" id="enroll-search" type="search" placeholder="Name, NIM, or department" autocomplete="off">
            <p class="field__hint" id="enroll-hint">${seatsText} · 0 selected</p>
          </div>
          <ul class="pick-list" id="enroll-list">
            ${candidates
              .map(
                (u) => `
              <li data-search="${Utils.escape(`${u.name} ${u.idNumber || ""} ${u.department || ""} ${u.email}`.toLowerCase())}">
                <label class="task">
                  <input type="checkbox" value="${Utils.escape(u.id)}">
                  <span>${Utils.escape(u.name)}<span class="table__code">${u.idNumber ? `NIM ${Utils.escape(u.idNumber)}` : Utils.escape(u.email)}${u.department ? ` · ${Utils.escape(u.department)}` : ""}</span></span>
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
          hint.textContent = `${seatsText} · ${selected} selected`;
          hint.classList.toggle("text-danger", selected > seats);
        });
      },
      onConfirm: async (modal) => {
        const ids = [...modal.querySelectorAll("#enroll-list input:checked")].map((el) => el.value);
        if (!ids.length) {
          UI.toast("Select at least one student.", "error");
          return false;
        }
        let added;
        try {
          added = (await Api.enrollments.addStudents(course.id, ids)).total;
        } catch (err) {
          UI.toast(err.message, "error");
          throw err;
        }
        UI.toast(`${added} student${added > 1 ? "s" : ""} enrolled in ${course.code || course.title}.`);
        load();
        CourseDetail.updateCounts();
      },
    });
  }

  document.getElementById("add-students")?.addEventListener("click", openEnrollForm);

  // Keluarkan student dari course
  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-unenroll]");
    if (!btn) return;
    const row = rows.find((r) => r.enrollmentId === btn.dataset.unenroll);
    UI.modal({
      title: "Remove student?",
      body: `<p><strong>${Utils.escape(row?.name || "This student")}</strong> will be removed from ${Utils.escape(course.code || course.title)}. Their progress, quiz attempts, and grade in this course will be deleted.</p>`,
      confirmText: "Remove",
      variant: "danger",
      onConfirm: async () => {
        try {
          await Api.enrollments.remove(row.enrollmentId);
        } catch (err) {
          UI.toast(err.message, "error");
          throw err;
        }
        drafts.delete(row.enrollmentId);
        UI.toast("Student removed from course.");
        load();
        CourseDetail.updateCounts();
      },
    });
  });

  // Ketik nilai → grade huruf langsung berubah
  tbody.addEventListener("input", (e) => {
    const input = e.target.closest("[data-score]");
    if (!input) return;
    const id = input.dataset.score;
    const original = rows.find((r) => r.enrollmentId === id)?.finalScore ?? "";
    const value = input.value.trim();
    if (value === String(original)) drafts.delete(id);
    else drafts.set(id, value);

    const parsed = parseScore(value);
    input.closest(".field").classList.toggle("is-invalid", Boolean(parsed.error));
    tbody.querySelector(`[data-grade-for="${CSS.escape(id)}"]`).innerHTML = parsed.error ? '<span class="text-danger">Invalid</span>' : gradeCell(parsed.score);
    saveBtn.disabled = drafts.size === 0;
  });

  saveBtn?.addEventListener("click", async () => {
    const invalid = [...drafts.values()].filter((v) => parseScore(v).error).length;
    if (invalid) {
      UI.toast(`${invalid} score${invalid > 1 ? "s are" : " is"} invalid. Use whole numbers from 0 to 100.`, "error");
      tbody.querySelector(".field.is-invalid input")?.focus();
      return;
    }
    const grades = [...drafts.entries()].map(([enrollmentId, value]) => ({ enrollmentId, finalScore: parseScore(value).score }));
    try {
      rows = (await UI.busy(saveBtn, Api.grades.save(course.id, grades))).items;
    } catch (err) {
      UI.toast(err.message, "error");
      return;
    }
    drafts.clear();
    UI.toast(`${grades.length} grade${grades.length > 1 ? "s" : ""} saved. Students can now see them.`);
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
    const list = Utils.sortBy(rows, state.key, state.dir);
    if (!list.length) return UI.toast("Nothing to export.", "error");
    Utils.downloadCSV(
      `learnova-${(course.code || course.slug || "course").toLowerCase()}-grades.csv`,
      list.map((r) => ({ Student: r.name, NIM: r.nim, Progress: `${r.progress}%`, Quiz: r.quiz ?? "", "Final score": r.finalScore ?? "", Grade: r.grade ?? "" }))
    );
    UI.toast("Grades exported as CSV.");
  });

  UI.sortable(table, state, render);
  load();
});
