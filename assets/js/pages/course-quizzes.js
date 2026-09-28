// Detail Course · tab Quizzes — dosen membuat & mengedit quiz pilihan ganda (editor soal dengan validasi)

document.addEventListener("DOMContentLoaded", () => {
  const { course, canEdit } = CourseDetail;
  if (!course) return;
  const list = document.getElementById("quiz-rows");
  const LETTERS = ["A", "B", "C", "D"];

  function quizStats(quiz) {
    const enrollments = Store.enrollmentsOf(course.id);
    const best = enrollments.map((e) => Store.bestScore(e, quiz.id)).filter((s) => s !== null);
    const attempts = enrollments.reduce((sum, e) => sum + Store.attemptsOf(e, quiz.id).length, 0);
    return { attempts, takers: best.length, avg: best.length ? Math.round(Utils.average(best)) : null };
  }

  function render() {
    const quizzes = Store.quizzesOf(course.id);
    list.innerHTML = quizzes.length
      ? quizzes
          .map((q) => {
            const s = quizStats(q);
            return `
            <li>
              <i data-icon="quiz"></i>
              <div class="row-list__main">
                <p class="row-list__title">${Utils.escape(q.title)}</p>
                <p class="row-list__meta">${q.questions.length} questions · pass ${q.passingScore} · ${q.timeLimit} min · max ${q.maxAttempts} attempts</p>
                <p class="row-list__meta">${s.takers} students · ${s.attempts} attempts${s.avg !== null ? ` · average best score ${s.avg}` : ""}</p>
              </div>
              ${
                canEdit
                  ? `<div class="row-list__actions">
                      <button class="icon-btn icon-btn--sm" type="button" data-edit="${q.id}" aria-label="Edit ${Utils.escape(q.title)}"><i data-icon="edit" class="icon--sm"></i></button>
                      <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete="${q.id}" aria-label="Delete ${Utils.escape(q.title)}"><i data-icon="trash" class="icon--sm"></i></button>
                    </div>`
                  : ""
              }
            </li>`;
          })
          .join("")
      : `<li class="empty">No quizzes yet.${canEdit ? " Click “New quiz” to create one." : ""}</li>`;
    renderIcons(list);
    CourseDetail.updateCounts();
  }

  /* ---------- Editor soal ---------- */
  const questionTemplate = (q, index) => `
    <div class="q-editor" data-question>
      <div class="q-editor__head">
        <span>Question <span data-number>${index + 1}</span></span>
        <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-remove-question aria-label="Remove question"><i data-icon="trash" class="icon--sm"></i></button>
      </div>
      <label class="visually-hidden" for="q-text-${index}">Question text</label>
      <input class="field__input" id="q-text-${index}" data-q-text type="text" placeholder="Write the question" value="${Utils.escape(q?.text || "")}">
      <div class="q-editor__options" role="radiogroup" aria-label="Answer options — select the correct one">
        ${LETTERS.map(
          (letter, i) => `
          <label class="q-editor__option">
            <input type="radio" name="correct-${index}" value="${i}" ${q?.answer === i ? "checked" : ""} aria-label="Mark option ${letter} as correct">
            <input class="field__input" data-q-option type="text" placeholder="Option ${letter}" value="${Utils.escape(q?.options[i] || "")}">
          </label>`
        ).join("")}
      </div>
      <p class="q-editor__error" data-q-error hidden></p>
    </div>`;

  // Nomor & nama radio disusun ulang setelah soal ditambah/dihapus
  function renumber(container) {
    container.querySelectorAll("[data-question]").forEach((item, index) => {
      item.querySelector("[data-number]").textContent = index + 1;
      item.querySelectorAll('input[type="radio"]').forEach((radio) => (radio.name = `correct-${index}`));
      item.querySelector("[data-q-text]").id = `q-text-${index}`;
      item.querySelector("label.visually-hidden").htmlFor = `q-text-${index}`;
    });
  }

  function openEditor(quiz) {
    const hasAttempts = quiz && quizStats(quiz).attempts > 0;
    UI.modal({
      title: quiz ? "Edit quiz" : "New quiz",
      size: "lg",
      confirmText: quiz ? "Save quiz" : "Create quiz",
      body: `
        <form class="form-stack" novalidate>
          ${hasAttempts ? '<p class="alert alert--danger"><i data-icon="alert" class="icon--sm"></i><span>Students have already taken this quiz. Their previous scores are kept.</span></p>' : ""}
          ${UI.field({ name: "title", label: "Quiz title", value: quiz?.title || `${course.code} Quiz ${Store.quizzesOf(course.id).length + 1}`, attrs: 'maxlength="80"' })}
          <div class="field-row">
            ${UI.field({ name: "passingScore", label: "Passing score", type: "number", value: quiz?.passingScore ?? 70, attrs: 'min="1" max="100"' })}
            ${UI.field({ name: "maxAttempts", label: "Maximum attempts", type: "number", value: quiz?.maxAttempts ?? 3, attrs: 'min="1" max="5"' })}
          </div>
          ${UI.field({ name: "timeLimit", label: "Time limit (minutes)", type: "number", value: quiz?.timeLimit ?? 10, attrs: 'min="1" max="120"' })}
          <div>
            <p class="field__label">Questions</p>
            <p class="field__hint">Fill in all four options and select the correct answer with the radio button.</p>
          </div>
          <div data-questions>${(quiz?.questions || [null]).map(questionTemplate).join("")}</div>
          <p class="q-editor__error" data-questions-error hidden></p>
          <div><button class="btn btn--outline" type="button" data-add-question><i data-icon="plus" class="icon--sm"></i>Add question</button></div>
        </form>`,
      onOpen: (modal) => {
        const container = modal.querySelector("[data-questions]");
        modal.querySelector("[data-add-question]").addEventListener("click", () => {
          container.insertAdjacentHTML("beforeend", questionTemplate(null, container.children.length));
          renderIcons(container);
          container.lastElementChild.querySelector("[data-q-text]").focus();
        });
        container.addEventListener("click", (e) => {
          const remove = e.target.closest("[data-remove-question]");
          if (!remove) return;
          remove.closest("[data-question]").remove();
          renumber(container);
        });
      },
      onConfirm: (modal) => {
        const form = modal.querySelector("form");
        const v = UI.formValues(form);
        const num = (value) => Number(value);

        const rules = {
          title: !v.title ? "Quiz title is required." : v.title.length < 5 ? "Title must be at least 5 characters." : "",
          passingScore: !Number.isInteger(num(v.passingScore)) || num(v.passingScore) < 1 || num(v.passingScore) > 100 ? "Enter a number between 1 and 100." : "",
          maxAttempts: !Number.isInteger(num(v.maxAttempts)) || num(v.maxAttempts) < 1 || num(v.maxAttempts) > 5 ? "Enter a number between 1 and 5." : "",
          timeLimit: !Number.isInteger(num(v.timeLimit)) || num(v.timeLimit) < 1 || num(v.timeLimit) > 120 ? "Enter a number between 1 and 120." : "",
        };
        Object.entries(rules).forEach(([name, message]) => UI.fieldError(form, name, message));

        // Validasi setiap soal
        const items = [...modal.querySelectorAll("[data-question]")];
        const questions = items.map((item) => {
          const text = item.querySelector("[data-q-text]").value.trim();
          const options = [...item.querySelectorAll("[data-q-option]")].map((o) => o.value.trim());
          const checked = item.querySelector('input[type="radio"]:checked');
          const error = !text
            ? "Write the question text."
            : options.some((o) => !o)
              ? "Fill in all four options."
              : new Set(options.map((o) => o.toLowerCase())).size < options.length
                ? "Options must be different from each other."
                : !checked
                  ? "Select the correct answer."
                  : "";
          item.classList.toggle("is-invalid", Boolean(error));
          const errorEl = item.querySelector("[data-q-error]");
          errorEl.hidden = !error;
          errorEl.textContent = error;
          return { text, options, answer: checked ? Number(checked.value) : null, error };
        });

        const listError = modal.querySelector("[data-questions-error]");
        listError.hidden = items.length > 0;
        listError.textContent = "Add at least one question.";

        const invalidField = Object.keys(rules).find((name) => rules[name]);
        const invalidQuestion = questions.findIndex((q) => q.error);
        if (invalidField || invalidQuestion !== -1 || !items.length) {
          if (invalidField) form.elements[invalidField].focus();
          else if (invalidQuestion !== -1) items[invalidQuestion].querySelector("[data-q-text]").focus();
          UI.toast("Please fix the highlighted fields.", "error");
          return false;
        }

        const data = {
          title: v.title,
          passingScore: num(v.passingScore),
          maxAttempts: num(v.maxAttempts),
          timeLimit: num(v.timeLimit),
          questions: questions.map(({ text, options, answer }) => ({ text, options, answer })),
        };
        if (quiz) {
          DB.update("quizzes", quiz.id, data);
          UI.toast("Quiz updated.");
        } else {
          DB.insert("quizzes", { ...data, courseId: course.id });
          Store.logActivity(`Created quiz "${v.title}" in ${course.code}`);
          UI.toast("Quiz created.");
        }
        render();
      },
    });
  }

  document.getElementById("add-quiz")?.addEventListener("click", () => openEditor(null));

  list.addEventListener("click", (e) => {
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-delete]");
    if (edit) return openEditor(DB.get("quizzes", edit.dataset.edit));
    if (!del) return;

    const quiz = DB.get("quizzes", del.dataset.delete);
    const { attempts } = quizStats(quiz);
    UI.modal({
      title: "Delete quiz?",
      body: `<p><strong>${Utils.escape(quiz.title)}</strong> will be removed${attempts ? ` together with ${attempts} student attempts` : ""}. This action cannot be undone.</p>`,
      confirmText: "Delete",
      variant: "danger",
      onConfirm: () => {
        Store.enrollmentsOf(course.id).forEach((e) => (e.attempts = e.attempts.filter((a) => a.quizId !== quiz.id)));
        DB.remove("quizzes", quiz.id);
        Store.logActivity(`Deleted quiz "${quiz.title}" from ${course.code}`);
        UI.toast("Quiz deleted.");
        render();
      },
    });
  });

  render();
});
