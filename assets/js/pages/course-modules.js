// Detail Course · tab Modules — dosen menambah, mengedit, mengurutkan, dan menghapus modul materi

document.addEventListener("DOMContentLoaded", () => {
  const { course, canEdit } = CourseDetail;
  if (!course) return;
  const list = document.getElementById("module-rows");

  // Rapikan nomor urut setelah tambah/hapus/pindah
  const normalize = () => Store.modulesOf(course.id).forEach((m, i) => (m.order = i + 1));

  function render() {
    const modules = Store.modulesOf(course.id);
    list.innerHTML = modules.length
      ? modules
          .map(
            (m, i) => `
          <li>
            <span class="row-list__order">${i + 1}</span>
            <div class="row-list__main">
              <p class="row-list__title">${Utils.escape(m.title)}</p>
              <p class="row-list__meta">${m.type} · ${m.minutes} min${m.tasks.length ? ` · ${m.tasks.length} practice tasks` : ""}</p>
            </div>
            ${
              canEdit
                ? `<div class="row-list__actions">
                    <button class="icon-btn icon-btn--sm" type="button" data-move="-1" data-id="${m.id}" aria-label="Move ${Utils.escape(m.title)} up" ${i === 0 ? "disabled" : ""}><i data-icon="chevron-up" class="icon--sm"></i></button>
                    <button class="icon-btn icon-btn--sm" type="button" data-move="1" data-id="${m.id}" aria-label="Move ${Utils.escape(m.title)} down" ${i === modules.length - 1 ? "disabled" : ""}><i data-icon="chevron-down" class="icon--sm"></i></button>
                    <button class="icon-btn icon-btn--sm" type="button" data-edit="${m.id}" aria-label="Edit ${Utils.escape(m.title)}"><i data-icon="edit" class="icon--sm"></i></button>
                    <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete="${m.id}" aria-label="Delete ${Utils.escape(m.title)}"><i data-icon="trash" class="icon--sm"></i></button>
                  </div>`
                : ""
            }
          </li>`
          )
          .join("")
      : `<li class="empty">No modules yet.${canEdit ? " Click “Add module” to create the first one." : ""}</li>`;
    renderIcons(list);
    CourseDetail.updateCounts();
  }

  function openForm(module) {
    UI.modal({
      title: module ? "Edit module" : "Add module",
      size: "lg",
      confirmText: module ? "Save module" : "Add module",
      body: `
        <form class="form-stack" novalidate>
          ${UI.field({ name: "title", label: "Module title", value: module?.title || "", placeholder: "e.g. DOM Manipulation — Lecture", attrs: 'maxlength="80"' })}
          <div class="field-row">
            ${UI.field({ name: "type", label: "Type", value: module?.type || "Lecture", options: ["Lecture", "Practice"] })}
            ${UI.field({ name: "minutes", label: "Duration (minutes)", type: "number", value: module?.minutes || 15, attrs: 'min="1" max="180"' })}
          </div>
          ${UI.field({ name: "content", label: "Content", type: "textarea", value: module?.content || "", placeholder: "Write the lesson material. Leave an empty line between paragraphs.", hint: "Minimum 20 characters." })}
          ${UI.field({ name: "tasks", label: "Practice tasks", type: "textarea", required: false, value: (module?.tasks || []).join("\n"), placeholder: "One task per line", hint: "Required for Practice modules. Students tick every task before completing the module." })}
        </form>`,
      onConfirm: (modal) => {
        const form = modal.querySelector("form");
        const v = UI.formValues(form);
        const minutes = Number(v.minutes);
        const tasks = v.tasks.split("\n").map((t) => t.trim()).filter(Boolean);

        const rules = {
          title: !v.title ? "Module title is required." : v.title.length < 5 ? "Title must be at least 5 characters." : "",
          minutes: !Number.isInteger(minutes) || minutes < 1 || minutes > 180 ? "Enter a whole number between 1 and 180." : "",
          content: !v.content ? "Content is required." : v.content.length < 20 ? `Content must be at least 20 characters (${v.content.length}/20).` : "",
          tasks: v.type === "Practice" && !tasks.length ? "Add at least one task for a Practice module." : "",
        };
        Object.entries(rules).forEach(([name, message]) => UI.fieldError(form, name, message));
        const firstInvalid = Object.keys(rules).find((name) => rules[name]);
        if (firstInvalid) {
          form.elements[firstInvalid].focus();
          return false;
        }

        const data = { title: v.title, type: v.type, minutes, content: v.content, tasks };
        if (module) {
          DB.update("modules", module.id, data);
          UI.toast("Module updated.");
        } else {
          DB.insert("modules", { ...data, courseId: course.id, order: Store.modulesOf(course.id).length + 1 });
          Store.logActivity(`Added module "${v.title}" to ${course.code}`);
          UI.toast("Module added.");
        }
        render();
      },
    });
  }

  document.getElementById("add-module")?.addEventListener("click", () => openForm(null));

  list.addEventListener("click", (e) => {
    const move = e.target.closest("[data-move]");
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-delete]");

    if (move && !move.disabled) {
      const modules = Store.modulesOf(course.id);
      const index = modules.findIndex((m) => m.id === move.dataset.id);
      const target = modules[index + Number(move.dataset.move)];
      [modules[index].order, target.order] = [target.order, modules[index].order];
      normalize();
      DB.save();
      render();
      list.querySelector(`[data-move="${move.dataset.move}"][data-id="${move.dataset.id}"]`)?.focus();
      return;
    }

    if (edit) return openForm(DB.get("modules", edit.dataset.edit));

    if (del) {
      const module = DB.get("modules", del.dataset.delete);
      UI.modal({
        title: "Delete module?",
        body: `<p><strong>${Utils.escape(module.title)}</strong> will be removed from ${Utils.escape(course.code)}. Students will no longer see it.</p>`,
        confirmText: "Delete",
        variant: "danger",
        onConfirm: () => {
          DB.remove("modules", module.id);
          normalize();
          DB.save();
          Store.logActivity(`Deleted module "${module.title}" from ${course.code}`);
          UI.toast("Module deleted.");
          render();
        },
      });
    }
  });

  render();
});
