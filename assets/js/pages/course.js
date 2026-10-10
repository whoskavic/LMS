// Halaman belajar mahasiswa — daftar modul, konten materi (dari dosen), tandai selesai, navigasi, daftar quiz

document.addEventListener("DOMContentLoaded", () => {
  const me = Store.currentUser();
  const params = Utils.params();
  const course = DB.get("courses", params.get("id"));
  const enrollment = course ? Store.enrollment(me.id, course.id) : null;

  if (!course || !enrollment) {
    Store.setFlash("You are not enrolled in this course.", "error");
    location.replace("student-dashboard.html");
    return;
  }

  const modules = Store.modulesOf(course.id).map((m, i) => ({ ...m, number: i + 1 }));
  const lessonEl = document.getElementById("lesson");
  const listEl = document.getElementById("module-list");
  const setText = (id, value) => (document.getElementById(id).textContent = value);

  const done = () => Math.min(enrollment.completedModules, modules.length);
  const firstOpen = () => Math.min(done() + 1, modules.length);
  const stateOf = (m) => (m.number <= done() ? "done" : m.number === done() + 1 ? "current" : "locked");

  // Modul awal: dari URL (?m=) jika tidak terkunci, selain itu modul yang sedang berjalan
  let selected = Number(params.get("m")) || firstOpen();
  if (selected < 1 || selected > firstOpen()) selected = firstOpen();
  let filter = "";
  let playTimer = null;

  /* ---------- Header & progress ---------- */
  function renderHeader() {
    const progress = Store.progressOf(enrollment);
    document.title = `${course.code} · ${course.title} | Learnova LMS`;
    setText("crumb-course", course.code);
    setText("course-title", course.title);
    setText("course-meta", `${course.code} · ${Store.lecturerName(course.lecturerId)} · ${course.semester}`);
    setText("course-progress", `${progress}%`);
    setText("course-modules", `${done()}/${modules.length} modules`);
    document.getElementById("course-progress-bar").style.width = `${progress}%`;
    document.getElementById("course-progress-track").setAttribute("aria-valuenow", progress);
    document.getElementById("download-certificate").hidden = !Store.certificateFor(enrollment);
  }

  document.getElementById("download-certificate").addEventListener("click", () => Certificate.download(enrollment));

  /* ---------- Daftar quiz ---------- */
  function renderQuizzes() {
    const quizzes = Store.quizzesOf(course.id);
    document.getElementById("quiz-list").innerHTML = quizzes.length
      ? quizzes
          .map((q) => {
            const best = Store.bestScore(enrollment, q.id);
            const used = Store.attemptsOf(enrollment, q.id).length;
            return `
            <li>
              <i data-icon="quiz" class="icon--sm"></i>
              <div class="row-list__main">
                <p class="row-list__title">${Utils.escape(q.title)}</p>
                <p class="row-list__meta">${q.questions.length} questions · ${used}/${q.maxAttempts} attempts${best !== null ? ` · best ${best}` : ""}</p>
              </div>
              <a class="btn ${used ? "btn--outline" : "btn--primary"}" href="quiz.html?id=${q.id}">${used ? "Open" : "Start"}</a>
            </li>`;
          })
          .join("")
      : '<li class="empty">No quizzes for this course yet.</li>';
    renderIcons(document.getElementById("quiz-list"));
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
                  <span class="module-item__type">${m.type} · ${m.minutes} min</span>
                </span>
              </button>
            </li>`;
          })
          .join("")
      : '<li class="empty">No modules found.</li>';

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
      lessonEl.innerHTML = '<p class="empty">Your lecturer has not published any modules yet.</p>';
      return;
    }
    const m = modules[selected - 1];
    const isDone = stateOf(m) === "done";
    const nextOpen = selected < modules.length && selected + 1 <= firstOpen();
    const isLecture = m.type === "Lecture";
    const needsTasks = !isLecture && m.tasks.length > 0;
    const hint = isLecture ? "Watch the video to continue." : needsTasks ? "Finish all practice tasks to continue." : "Read the material, then mark it as complete.";

    lessonEl.innerHTML = `
      <p class="page-header__eyebrow">Module ${m.number} of ${modules.length} · ${m.type}</p>
      <h2 class="lesson__title">${Utils.escape(m.title)}</h2>
      <p class="lesson__meta">
        <i data-icon="clock" class="icon--sm"></i>${m.minutes} min
        ${isDone ? '<span class="badge badge--success">Completed</span>' : '<span class="badge badge--primary">In progress</span>'}
      </p>

      ${
        isLecture
          ? `<div class="lesson__video" style="background: ${course.color}">
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
              : `<button class="btn btn--primary" type="button" data-complete ${isLecture || needsTasks ? "disabled" : ""}>
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
    history.replaceState(null, "", `?id=${course.id}&m=${number}`);
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
      UI.toast(`Complete module ${done() + 1} first to unlock this module.`, "error");
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
          enableComplete();
        }
      }, 120);
      return;
    }

    // Tandai modul selesai
    if (e.target.closest("[data-complete]")) {
      const m = modules[selected - 1];
      if (!Store.completeModule(enrollment.id, m.number)) return;
      enrollment.completedModules = m.number;
      renderHeader();

      if (done() >= modules.length) {
        Store.logActivity(`Completed all modules of ${course.code} ${course.title}`);
        renderList();
        renderLesson();
        const hasCertificate = Boolean(Store.certificateFor(enrollment));
        UI.modal({
          title: "Course completed!",
          body: `<p>Congratulations — you finished all ${modules.length} modules of <strong>${Utils.escape(course.title)}</strong>.
                 Your final grade will be published by your lecturer.</p>
                 ${hasCertificate ? "<p>Your certificate of completion is ready to download.</p>" : ""}`,
          confirmText: hasCertificate ? "Download certificate" : "Back to dashboard",
          cancelText: hasCertificate ? "Close" : "Stay here",
          onConfirm: () => (hasCertificate ? Certificate.download(enrollment) : (location.href = "student-dashboard.html")),
        });
      } else {
        UI.toast(`Module ${m.number} completed. Next module unlocked.`);
        goTo(m.number + 1);
      }
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
      enableComplete();
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
