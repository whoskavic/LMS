// Detail Course · tab Modules — instructor pemilik menambah, mengedit, mengurutkan, dan menghapus modul.
// Semua perubahan lewat Api.modules; urutan disimpan dengan PUT /courses/{id}/modules/order.

App.ready(async () => {
  const course = await CourseDetail.loaded;
  const { canEdit } = CourseDetail;
  const list = document.getElementById("module-rows");
  let modules = [];

  const youtubeOk = (url) => !url || /^https?:\/\/\S+$/.test(url);

  function renderList() {
    if (!modules.length) {
      UI.empty(list, {
        title: "No modules yet",
        text: canEdit ? "Click “Add module” to create the first lesson." : "The instructor has not added any modules.",
        icon: "layers",
        action: canEdit ? { label: "Add module", onClick: () => openForm(null) } : undefined,
      });
      return;
    }
    list.innerHTML = modules
      .map(
        (m, i) => `
        <li>
          <span class="row-list__order">${i + 1}</span>
          <div class="row-list__main">
            <p class="row-list__title">${Utils.escape(m.title)}</p>
            <p class="row-list__meta">${m.type} · ${Utils.orDash(m.minutes)} min${m.tasks.length ? ` · ${m.tasks.length} practice tasks` : ""}${m.videoUrl ? " · video" : ""}</p>
          </div>
          ${
            canEdit
              ? `<div class="row-list__actions">
                  <button class="icon-btn icon-btn--sm" type="button" data-move="-1" data-id="${Utils.escape(m.id)}" aria-label="Move ${Utils.escape(m.title)} up" ${i === 0 ? "disabled" : ""}><i data-icon="chevron-up" class="icon--sm"></i></button>
                  <button class="icon-btn icon-btn--sm" type="button" data-move="1" data-id="${Utils.escape(m.id)}" aria-label="Move ${Utils.escape(m.title)} down" ${i === modules.length - 1 ? "disabled" : ""}><i data-icon="chevron-down" class="icon--sm"></i></button>
                  <button class="icon-btn icon-btn--sm" type="button" data-edit="${Utils.escape(m.id)}" aria-label="Edit ${Utils.escape(m.title)}"><i data-icon="edit" class="icon--sm"></i></button>
                  <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete="${Utils.escape(m.id)}" aria-label="Delete ${Utils.escape(m.title)}"><i data-icon="trash" class="icon--sm"></i></button>
                </div>`
              : ""
          }
        </li>`
      )
      .join("");
    renderIcons(list);
  }

  const load = () =>
    UI.load(list, () => Api.modules.list(course.id), (res) => {
      modules = res.items;
      renderList();
    }, { label: "Loading modules…" });

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
          ${UI.field({ name: "videoUrl", label: "Video URL", type: "url", required: false, value: module?.videoUrl || "", placeholder: "https://www.youtube.com/watch?v=…", hint: "Optional. YouTube links are embedded in the lesson." })}
          ${UI.field({ name: "content", label: "Content", type: "textarea", value: module?.content || "", placeholder: "Write the lesson material. Leave an empty line between paragraphs.", hint: "Minimum 20 characters." })}
          ${UI.field({ name: "tasks", label: "Practice tasks", type: "textarea", required: false, value: (module?.tasks || []).join("\n"), placeholder: "One task per line", hint: "Required for Practice modules. Students tick every task before completing the module." })}
        </form>`,
      onConfirm: async (modal) => {
        const form = modal.querySelector("form");
        const v = UI.formValues(form);
        const minutes = Number(v.minutes);
        const tasks = v.tasks.split("\n").map((t) => t.trim()).filter(Boolean);

        const rules = {
          title: !v.title ? "Module title is required." : v.title.length < 5 ? "Title must be at least 5 characters." : "",
          minutes: !Number.isInteger(minutes) || minutes < 1 || minutes > 180 ? "Enter a whole number between 1 and 180." : "",
          videoUrl: youtubeOk(v.videoUrl) ? "" : "Enter a valid http(s) URL.",
          content: !v.content ? "Content is required." : v.content.length < 20 ? `Content must be at least 20 characters (${v.content.length}/20).` : "",
          tasks: v.type === "Practice" && !tasks.length ? "Add at least one task for a Practice module." : "",
        };
        Object.entries(rules).forEach(([name, message]) => UI.fieldError(form, name, message));
        const firstInvalid = Object.keys(rules).find((name) => rules[name]);
        if (firstInvalid) {
          form.elements[firstInvalid].focus();
          return false;
        }

        const data = { title: v.title, type: v.type, minutes, content: v.content, tasks, videoUrl: v.videoUrl };
        try {
          if (module) await Api.modules.update(module.id, data);
          else await Api.modules.create(course.id, data);
        } catch (err) {
          if (!UI.applyFieldErrors(form, err)) UI.toast(err.message, "error");
          throw err;
        }
        UI.toast(module ? "Module updated." : "Module added.");
        load();
        CourseDetail.updateCounts();
      },
    });
  }

  document.getElementById("add-module")?.addEventListener("click", () => openForm(null));

  list.addEventListener("click", async (e) => {
    const move = e.target.closest("[data-move]");
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-delete]");

    if (move && !move.disabled) {
      const index = modules.findIndex((m) => m.id === move.dataset.id);
      const ids = modules.map((m) => m.id);
      const target = index + Number(move.dataset.move);
      [ids[index], ids[target]] = [ids[target], ids[index]];
      try {
        const res = await UI.busy(move, Api.modules.reorder(course.id, ids));
        modules = res.items;
        renderList();
        list.querySelector(`[data-move="${move.dataset.move}"][data-id="${move.dataset.id}"]`)?.focus();
      } catch (err) {
        UI.toast(err.message, "error");
      }
      return;
    }

    if (edit) return openForm(modules.find((m) => m.id === edit.dataset.edit));

    if (del) {
      const module = modules.find((m) => m.id === del.dataset.delete);
      UI.modal({
        title: "Delete module?",
        body: `<p><strong>${Utils.escape(module.title)}</strong> will be removed from ${Utils.escape(course.title)}. Learners will no longer see it.</p>`,
        confirmText: "Delete",
        variant: "danger",
        onConfirm: async () => {
          try {
            await Api.modules.remove(module.id);
          } catch (err) {
            UI.toast(err.message, "error");
            throw err;
          }
          UI.toast("Module deleted.");
          load();
          CourseDetail.updateCounts();
        },
      });
    }
  });

  load();
});
