// Halaman belajar student — daftar modul, konten materi (+ video URL), tandai selesai (server), navigasi, daftar quiz.
// Progress dihitung server (POST /enrollments/{id}/completed-modules); modul harus diselesaikan berurutan.

// URL YouTube biasa / youtu.be → URL embed; URL lain dikembalikan null (ditampilkan sebagai tautan)
function youtubeEmbed(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) return url;
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {}
  return null;
}

App.ready(async (me) => {
  const params = Utils.params();
  const courseId = params.get("id");
  let course;
  let enrollment;
  let modules;
  try {
    if (!courseId) throw new ApiError(404, "NOT_FOUND", "Course not found.");
    [course, enrollment, modules] = await Promise.all([
      Api.courses.get(courseId),
      Api.enrollments.forCourse(courseId),
      Api.modules.list(courseId).then((res) => res.items),
    ]);
  } catch (err) {
    UI.flash(err.status === 404 || err.status === 403 ? "You are not enrolled in this course." : err.message, "error");
    location.replace("student-dashboard.html");
    return;
  }

  modules = modules.map((m, i) => ({ ...m, number: i + 1 }));
  const lessonEl = document.getElementById("lesson");
  const listEl = document.getElementById("module-list");
  const setText = (id, value) => (document.getElementById(id).textContent = value);
  const archived = course.status === "Archived";

  const doneIds = () => new Set(enrollment.completedModuleIds);
  const done = () => modules.filter((m) => doneIds().has(m.id)).length;
  // Modul terbuka pertama = modul pertama yang belum selesai
  const firstOpen = () => (modules.find((m) => !doneIds().has(m.id)) || modules[modules.length - 1] || { number: 1 }).number;
  const stateOf = (m) => (doneIds().has(m.id) ? "done" : m.number === firstOpen() ? "current" : "locked");

  // Modul awal: dari URL (?m=) jika tidak terkunci, selain itu modul yang sedang berjalan
  let selected = Number(params.get("m")) || firstOpen();
  if (selected < 1 || selected > modules.length || (modules[selected - 1] && stateOf(modules[selected - 1]) === "locked")) selected = firstOpen();
  let filter = "";
  let playTimer = null;

  /* ---------- Header & progress ---------- */
  function renderHeader() {
    const progress = enrollment.progress;
    document.title = `${course.code ? `${course.code} · ` : ""}${course.title} | Learnova LMS`;
    setText("crumb-course", course.code || course.title);
    setText("course-title", course.title);
    setText("course-meta", [course.code, course.instructorName, course.semester, archived ? "Archived (read-only)" : ""].filter(Boolean).join(" · "));
    setText("course-progress", `${progress}%`);
    setText("course-modules", `${done()}/${modules.length} modules`);
    document.getElementById("course-progress-bar").style.width = `${progress}%`;
    document.getElementById("course-progress-track").setAttribute("aria-valuenow", progress);
    document.getElementById("download-certificate").hidden = !enrollment.certificate;
  }

  document.getElementById("download-certificate").addEventListener("click", () => Certificate.download(enrollment, me));

  /* ---------- Daftar quiz ---------- */
  function renderQuizzes() {
    const box = document.getElementById("quiz-list");
    UI.load(
      box,
      () => Api.quizzes.list(course.id),
      (res) => {
        box.innerHTML = res.items
          .map((q) => {
            const best = q.mine?.bestScore ?? null;
            const used = q.mine?.attempts ?? 0;
            return `
            <li>
              <i data-icon="quiz" class="icon--sm"></i>
              <div class="row-list__main">
                <p class="row-list__title">${Utils.escape(q.title)}</p>
                <p class="row-list__meta">${q.questionCount} questions · ${used}/${q.maxAttempts} attempts${best !== null ? ` · best ${best}` : ""}</p>
              </div>
              <a class="btn ${used ? "btn--outline" : "btn--primary"}" href="quiz.html?id=${encodeURIComponent(q.id)}">${used ? "Open" : "Start"}</a>
            </li>`;
          })
          .join("");
        renderIcons(box);
      },
      { label: "Loading quizzes…", empty: { title: "No quizzes for this course yet", icon: "quiz" } }
    );
  }

  /* ---------- Daftar modul ---------- */
  const stateIcon = { done: "check-circle", current: "play", locked: "lock" };

  function renderList() {
    const q = filter.toLowerCase();
    const visible = modules.filter((m) => !q || m.title.toLowerCase().includes(q));
    setText("module-summary", `${done()} of ${modules.length} completed`);

    listEl.innerHTML = visible.length
      ? visible
          .map((m) => {
            const state = stateOf(m);
            const [topic] = m.title.split(" — ");
            return `
            <li>
              <button class="module-item is-${state} ${m.number === selected ? "is-selected" : ""}" type="button"
                data-module="${m.number}" ${state === "locked" ? 'aria-disabled="true"' : ""} ${m.number === selected ? 'aria-current="step"' : ""}>
                <i data-icon="${stateIcon[state]}" class="icon--sm"></i>
                <span class="module-item__title">${m.number}. ${Utils.escape(topic)}
                  <span class="module-item__type">${m.type} · ${Utils.orDash(m.minutes)} min</span>
                </span>
              </button>
            </li>`;
          })
          .join("")
      : `<li class="empty">${modules.length ? "No modules match your search." : "No modules published yet."}</li>`;

    renderIcons(listEl);
    const active = listEl.querySelector(".is-selected");
    if (active) listEl.scrollTop = active.offsetTop - listEl.offsetTop - 80;
  }

  /* ---------- Konten modul ---------- */
  const paragraphs = (text) =>
    text
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((p) => `<p>${Utils.escape(p)}</p>`)
      .join("");

  function tasksBody(m, isDone) {
    if (!m.tasks.length) return "";
    return `
      <fieldset class="task-list">
        <legend>Practice tasks</legend>
        ${m.tasks
          .map(
            (task) => `
          <label class="task">
            <input type="checkbox" data-task ${isDone ? "checked disabled" : ""}>
            <span>${Utils.escape(task)}</span>
          </label>`
          )
          .join("")}
      </fieldset>`;
  }

  function renderLesson() {
    clearInterval(playTimer);
    if (!modules.length) {
      UI.empty(lessonEl, { title: "No modules yet", text: "Your instructor has not published any modules yet.", icon: "layers" });
      return;
    }
    const m = modules[selected - 1];
    const isDone = stateOf(m) === "done";
    const nextOpen = selected < modules.length && selected + 1 <= firstOpen();
    const isLecture = m.type === "Lecture";
    const embed = m.videoUrl ? youtubeEmbed(m.videoUrl) : null;
    const simulated = isLecture && !m.videoUrl; // tanpa URL video: simulasi pemutaran seperti prototipe
    const needsTasks = !isLecture && m.tasks.length > 0;
    const hint = archived
      ? "This course is archived. Modules are read-only."
      : simulated
        ? "Watch the video to continue."
        : needsTasks
          ? "Finish all practice tasks to continue."
          : "Read the material, then mark it as complete.";

    lessonEl.innerHTML = `
      <p class="page-header__eyebrow">Module ${m.number} of ${modules.length} · ${m.type}</p>
      <h2 class="lesson__title">${Utils.escape(m.title)}</h2>
      <p class="lesson__meta">
        <i data-icon="clock" class="icon--sm"></i>${Utils.orDash(m.minutes)} min
        ${isDone ? '<span class="badge badge--success">Completed</span>' : '<span class="badge badge--primary">In progress</span>'}
      </p>

      ${
        embed
          ? `<div class="lesson__embed"><iframe src="${Utils.escape(embed)}" title="${Utils.escape(m.title)} video" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
          : m.videoUrl
            ? `<p class="lesson__meta"><i data-icon="play" class="icon--sm"></i><a href="${Utils.escape(m.videoUrl)}" target="_blank" rel="noopener">Open the lesson video</a></p>`
            : ""
      }
      ${
        simulated
          ? `<div class="lesson__video" style="background: ${Utils.escape(course.color || "var(--color-primary-soft)")}">
              ${
                isDone
                  ? '<span class="done-label"><i data-icon="check-circle"></i>Video watched</span>'
                  : '<button class="lesson__play" type="button" data-play aria-label="Play video lecture"><i data-icon="play"></i></button>'
              }
              <span class="lesson__video-caption">Video lecture · ${m.minutes} min (demo)</span>
              <div class="lesson__video-progress"><div style="width: ${isDone ? 100 : 0}%"></div></div>
            </div>`
          : ""
      }

      <div class="lesson__body">${paragraphs(m.content)}${tasksBody(m, isDone)}</div>

      <footer class="lesson__footer">
        <button class="btn btn--outline" type="button" data-go="${selected - 1}" ${selected === 1 ? "disabled" : ""}>
          <i data-icon="chevron-left" class="icon--sm"></i>Previous
        </button>
        <div class="lesson__complete">
          ${
            isDone
              ? '<span class="done-label"><i data-icon="check-circle" class="icon--sm"></i>Module completed</span>'
              : `<button class="btn btn--primary" type="button" data-complete ${simulated || needsTasks || archived ? "disabled" : ""}>
                  <i data-icon="check" class="icon--sm"></i>Mark as complete
                </button>
                <span class="lesson__hint" id="complete-hint">${hint}</span>`
          }
        </div>
        <button class="btn ${isDone && nextOpen ? "btn--primary" : "btn--outline"}" type="button" data-go="${selected + 1}" ${nextOpen ? "" : "disabled"}>
          Next<i data-icon="chevron-right" class="icon--sm"></i>
        </button>
      </footer>`;

    renderIcons(lessonEl);
  }

  function goTo(number) {
    selected = number;
    history.replaceState(null, "", `?id=${encodeURIComponent(course.id)}&m=${number}`);
    renderList();
    renderLesson();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function enableComplete() {
    const btn = lessonEl.querySelector("[data-complete]");
    if (!btn) return;
    btn.disabled = false;
    document.getElementById("complete-hint").textContent = "Ready to mark as complete.";
  }

  /* ---------- Interaksi ---------- */
  listEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-module]");
    if (!btn) return;
    if (btn.classList.contains("is-locked")) {
      UI.toast(`Complete module ${firstOpen()} first to unlock this module.`, "error");
      return;
    }
    goTo(Number(btn.dataset.module));
  });

  lessonEl.addEventListener("click", (e) => {
    // Putar video (simulasi 3 detik)
    const play = e.target.closest("[data-play]");
    if (play) {
      const bar = lessonEl.querySelector(".lesson__video-progress > div");
      let percent = 0;
      play.outerHTML = '<span class="done-label">Playing…</span>';
      playTimer = setInterval(() => {
        percent += 4;
        bar.style.width = `${percent}%`;
        if (percent >= 100) {
          clearInterval(playTimer);
          lessonEl.querySelector(".lesson__video .done-label").innerHTML = '<i data-icon="check-circle"></i>Video watched';
          renderIcons(lessonEl);
          if (!archived) enableComplete();
        }
      }, 120);
      return;
    }

    // Tandai modul selesai (server memvalidasi urutan & menghitung progress)
    const completeBtn = e.target.closest("[data-complete]");
    if (completeBtn) {
      const m = modules[selected - 1];
      UI.busy(completeBtn, Api.enrollments.completeModule(enrollment.id, m.id))
        .then((updated) => {
          enrollment = updated;
          renderHeader();
          if (done() >= modules.length) {
            renderList();
            renderLesson();
            const hasCertificate = Boolean(enrollment.certificate);
            UI.modal({
              title: "Course completed!",
              body: `<p>Congratulations — you finished all ${modules.length} modules of <strong>${Utils.escape(course.title)}</strong>.
                     Your final grade will be published by your instructor.</p>
                     ${hasCertificate ? "<p>Your certificate of completion is ready to download.</p>" : ""}`,
              confirmText: hasCertificate ? "Download certificate" : "Back to dashboard",
              cancelText: hasCertificate ? "Close" : "Stay here",
              onConfirm: () => (hasCertificate ? Certificate.download(enrollment, me) : (location.href = "student-dashboard.html")),
            });
          } else {
            UI.toast(`Module ${m.number} completed. Next module unlocked.`);
            goTo(firstOpen());
          }
        })
        .catch((err) => UI.toast(err.message, "error"));
      return;
    }

    // Previous / Next
    const go = e.target.closest("[data-go]");
    if (go && !go.disabled) goTo(Number(go.dataset.go));
  });

  // Checklist latihan: semua dicentang → tombol selesai aktif
  lessonEl.addEventListener("change", (e) => {
    if (!e.target.matches("[data-task]")) return;
    const tasks = [...lessonEl.querySelectorAll("[data-task]")];
    const btn = lessonEl.querySelector("[data-complete]");
    const left = tasks.filter((t) => !t.checked).length;
    if (left === 0) {
      if (!archived) enableComplete();
    } else if (btn) {
      btn.disabled = true;
      document.getElementById("complete-hint").textContent = `${left} task${left > 1 ? "s" : ""} left.`;
    }
  });

  // Search di topbar → filter daftar modul
  const search = document.getElementById("global-search");
  search.placeholder = "Search modules...";
  search.addEventListener("input", (e) => {
    filter = e.target.value.trim();
    renderList();
  });

  renderHeader();
  renderQuizzes();
  renderList();
  renderLesson();
});
