// Detail Course · tab Students & Grades — progress & skor quiz mahasiswa, dosen mengisi nilai akhir

document.addEventListener("DOMContentLoaded", () => {
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
      </tr>`;
  }

  function render() {
    const list = Utils.sortBy(rows(), state.key, state.dir);
    tbody.innerHTML = list.length
      ? list.map(rowTemplate).join("")
      : '<tr><td class="table__empty" colspan="5">No students are enrolled in this course yet.</td></tr>';
    if (saveBtn) saveBtn.disabled = drafts.size === 0;
  }

  // Ketik nilai → grade huruf langsung berubah
  tbody.addEventListener("input", (e) => {
    const input = e.target.closest("[data-score]");
    if (!input) return;
    const id = Number(input.dataset.score);
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
