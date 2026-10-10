// Quiz student — intro, pengerjaan (timer dari server, navigasi soal, keyboard), konfirmasi submit, hasil & review.
// Soal diambil saat attempt dimulai (tanpa kunci jawaban); skor, batas attempt, dan batas waktu divalidasi server.
// Jawaban disimpan sementara ke server sehingga attempt bisa dilanjutkan setelah refresh.

App.ready(async () => {
  const params = Utils.params();
  let quiz;
  let course;
  let history = [];
  try {
    quiz = await Api.quizzes.get(params.get("id"));
    [course, history] = await Promise.all([Api.courses.get(quiz.courseId), Api.attempts.mine(quiz.id).then((r) => r.items)]);
  } catch (err) {
    UI.flash(err.status === 404 || err.status === 403 ? "Quiz not found or you are not enrolled in this course." : err.message, "error");
    location.replace("student-dashboard.html");
    return;
  }

  const root = document.getElementById("quiz-root");
  const LETTERS = ["A", "B", "C", "D"];
  const setText = (id, value) => (document.getElementById(id).textContent = value);
  const courseUrl = `course.html?id=${encodeURIComponent(course.id)}`;

  document.title = `${quiz.title} | Learnova LMS`;
  setText("quiz-title", quiz.title);
  setText("quiz-meta", [course.code, course.title].filter(Boolean).join(" · "));
  const crumb = document.getElementById("crumb-course");
  crumb.textContent = course.code || course.title;
  crumb.href = courseUrl;

  let attempt = null; // attempt yang sedang dikerjakan (dari server)
  let questions = [];
  let answers = []; // index opsi per soal, null = belum dijawab
  let total = quiz.questionCount;
  let current = 0;
  let deadline = 0;
  let timer = null;
  let saveTimer = null;
  let inProgress = false;

  const attemptsUsed = () => history.length;
  const attemptsLeft = () => quiz.maxAttempts - attemptsUsed();
  const bestScore = () => {
    const scores = history.filter((a) => a.status === "submitted" && a.score !== null).map((a) => a.score);
    return scores.length ? Math.max(...scores) : null;
  };
  const running = () => history.find((a) => a.status === "in_progress");
  const formatTime = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  const answerMap = () =>
    Object.fromEntries(questions.map((q, i) => [q.id, answers[i] === null ? null : q.options[answers[i]].id]));

  async function reloadHistory() {
    try {
      history = (await Api.attempts.mine(quiz.id)).items;
    } catch {
      // riwayat lama tetap dipakai
    }
  }

  /* ---------- 1. Intro ---------- */
  function renderIntro() {
    const list = history;
    const best = bestScore();
    const left = attemptsLeft();
    const resumable = running();

    root.innerHTML = `
      <div class="grid grid--2-1 grid--start">
        <section class="card">
          <h2 class="card__title card__header">Before you start</h2>
          <div class="kv-grid">
            <div><p class="kv__label">Questions</p><p class="kv__value">${total} multiple choice</p></div>
            <div><p class="kv__label">Time limit</p><p class="kv__value">${quiz.timeLimit} minutes</p></div>
            <div><p class="kv__label">Passing score</p><p class="kv__value">${quiz.passingScore} / 100</p></div>
            <div><p class="kv__label">Attempts left</p><p class="kv__value">${left} of ${quiz.maxAttempts}</p></div>
          </div>
          <div class="lesson__body mt-5"><ul>
            <li>The timer starts when you click <strong>Start quiz</strong> and the quiz is submitted automatically when time runs out. Each start uses one attempt.</li>
            <li>You can move between questions and change answers before submitting.</li>
            <li>Keyboard: press <strong>1–4</strong> to choose an answer and <strong>←</strong> / <strong>→</strong> to move between questions.</li>
            <li>Your best score counts toward the course.</li>
          </ul></div>
          <div class="lesson__footer">
            <a class="btn btn--outline" href="${courseUrl}"><i data-icon="chevron-left" class="icon--sm"></i>Back to course</a>
            ${
              resumable
                ? '<button class="btn btn--primary" type="button" data-start><i data-icon="play" class="icon--sm"></i>Resume attempt</button>'
                : course.status !== "Active"
                  ? '<span class="badge badge--neutral">Quiz closed (course archived)</span>'
                  : !total
                    ? '<span class="badge badge--neutral">No questions yet</span>'
                    : left > 0
                      ? `<button class="btn btn--primary" type="button" data-start><i data-icon="play" class="icon--sm"></i>${list.length ? "Try again" : "Start quiz"}</button>`
                      : '<span class="badge badge--neutral">No attempts left</span>'
            }
          </div>
        </section>

        <section class="card">
          <h2 class="card__title">Your attempts</h2>
          <p class="card__subtitle card__header">${best !== null ? `Best score: ${best}` : "You have not taken this quiz yet."}</p>
          <ul class="row-list">
            ${
              list.length
                ? list
                    .map(
                      (a) => `
                <li>
                  <span class="row-list__order">${a.attemptNumber}</span>
                  <div class="row-list__main">
                    <p class="row-list__title">${a.status === "submitted" ? `${a.score} / 100` : a.status === "expired" ? "Expired — not graded" : "In progress"}</p>
                    <p class="row-list__meta">${Utils.formatDate(a.submittedAt || a.startedAt)}</p>
                  </div>
                  ${
                    a.status === "submitted"
                      ? `<span class="badge ${a.passed ? "badge--success" : "badge--danger"}">${a.passed ? "Passed" : "Not passed"}</span>
                         <button class="btn btn--link" type="button" data-review="${Utils.escape(a.id)}">Review</button>`
                      : `<span class="badge badge--neutral">${a.status === "expired" ? "Expired" : "Open"}</span>`
                  }
                </li>`
                    )
                    .join("")
                : '<li class="empty">No attempts yet.</li>'
            }
          </ul>
        </section>
      </div>`;
    renderIcons(root);
  }

  /* ---------- 2. Mengerjakan ---------- */
  async function start(button) {
    try {
      attempt = await UI.busy(button, Api.attempts.start(quiz.id));
    } catch (err) {
      UI.toast(err.message, "error");
      await reloadHistory();
      return renderIntro();
    }
    questions = attempt.questions;
    total = questions.length;
    answers = questions.map((q) => {
      const index = q.options.findIndex((o) => o.id === q.selectedOptionId);
      return index === -1 ? null : index;
    });
    current = 0;
    // Batas waktu dari server (dikoreksi selisih jam browser vs server)
    const skew = Date.parse(attempt.serverTime) - Date.now();
    deadline = Date.parse(attempt.expiresAt) - skew;
    inProgress = true;
    await reloadHistory();
    timer = setInterval(tick, 1000);
    renderQuestion();
  }

  // Simpan jawaban sementara ke server (debounce) agar bisa dilanjutkan setelah refresh
  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (inProgress) Api.attempts.save(attempt.id, answerMap()).catch(() => {});
    }, 600);
  }

  function tick() {
    const left = deadline - Date.now();
    const el = document.getElementById("quiz-timer");
    if (el) {
      el.querySelector("span").textContent = formatTime(left);
      el.classList.toggle("is-low", left <= 60 * 1000);
    }
    if (left <= 0) {
      UI.toast("Time is up — your answers were submitted automatically.", "error");
      finish();
    }
  }

  function renderQuestion() {
    const q = questions[current];
    const answered = answers.filter((a) => a !== null).length;

    root.innerHTML = `
      <div class="grid grid--2-1 grid--start">
        <section class="card" aria-labelledby="question-text">
          <div class="quiz-header">
            <p class="page-header__eyebrow">Question ${current + 1} of ${total}</p>
            <span class="text-muted">${answered} answered</span>
          </div>
          <div class="progress"><div class="progress__bar" style="width: ${((current + 1) / total) * 100}%"></div></div>
          <h2 class="question__text" id="question-text">${Utils.escape(q.text)}</h2>
          <fieldset class="options">
            <legend class="visually-hidden">Answer options</legend>
            ${q.options
              .map(
                (option, i) => `
              <label class="option">
                <input type="radio" name="answer" value="${i}" ${answers[current] === i ? "checked" : ""}>
                <span class="option__letter">${LETTERS[i]}</span>
                <span>${Utils.escape(option.text)}</span>
              </label>`
              )
              .join("")}
          </fieldset>
          <div class="lesson__footer">
            <button class="btn btn--outline" type="button" data-nav="-1" ${current === 0 ? "disabled" : ""}><i data-icon="chevron-left" class="icon--sm"></i>Previous</button>
            ${
              current === total - 1
                ? '<button class="btn btn--primary" type="button" data-submit>Review &amp; submit</button>'
                : '<button class="btn btn--primary" type="button" data-nav="1">Next<i data-icon="chevron-right" class="icon--sm"></i></button>'
            }
          </div>
        </section>

        <aside class="card" aria-label="Quiz navigation">
          <div class="quiz-header">
            <h2 class="card__title">Questions</h2>
            <span class="quiz-timer" id="quiz-timer" role="timer" aria-label="Time left"><i data-icon="clock" class="icon--sm"></i><span>${formatTime(deadline - Date.now())}</span></span>
          </div>
          <div class="q-nav">
            ${answers
              .map(
                (a, i) =>
                  `<button class="q-nav__btn ${a !== null ? "is-answered" : ""} ${i === current ? "is-current" : ""}" type="button" data-goto="${i}"
                     aria-label="Question ${i + 1}${a !== null ? ", answered" : ""}" ${i === current ? 'aria-current="step"' : ""}>${i + 1}</button>`
              )
              .join("")}
          </div>
          <div class="legend">
            <span style="--swatch: var(--color-primary)">Answered</span>
            <span style="--swatch: var(--color-surface)">Not answered</span>
          </div>
          <button class="btn btn--primary btn--block mt-5" type="button" data-submit>Submit quiz</button>
        </aside>
      </div>`;
    renderIcons(root);
    tick();
  }

  function submit() {
    const unanswered = answers.filter((a) => a === null).length;
    UI.modal({
      title: "Submit quiz?",
      body: unanswered
        ? `<p class="alert alert--danger"><span>You still have <strong>${unanswered} unanswered question${unanswered > 1 ? "s" : ""}</strong>. Unanswered questions are marked wrong.</span></p>`
        : `<p>You answered all ${total} questions. You cannot change your answers after submitting.</p>`,
      confirmText: "Submit",
      cancelText: "Keep working",
      onConfirm: finish,
    });
  }

  /* ---------- 3. Hasil ---------- */
  async function finish() {
    if (!inProgress) return;
    inProgress = false;
    clearInterval(timer);
    clearTimeout(saveTimer);
    root.setAttribute("aria-busy", "true");
    try {
      const result = await Api.attempts.submit(attempt.id, answerMap());
      await reloadHistory();
      renderResult(result, true);
    } catch (err) {
      UI.toast(err.message, "error");
      await reloadHistory();
      renderIntro();
    } finally {
      root.removeAttribute("aria-busy");
    }
  }

  function reviewTemplate(result) {
    return result.questions
      .map((q, i) => {
        const chosen = q.selectedOptionId;
        return `
        <div class="review-item">
          <p class="page-header__eyebrow">Question ${i + 1} · ${q.isCorrect ? '<span class="text-success">Correct</span>' : '<span class="text-danger">Incorrect</span>'}</p>
          <p class="question__text">${Utils.escape(q.text)}</p>
          <div class="options">
            ${q.options
              .map((option, j) => {
                const cls = option.id === q.correctOptionId ? "is-correct" : option.id === chosen ? "is-wrong" : "";
                const note = option.id === q.correctOptionId ? " — correct answer" : option.id === chosen ? " — your answer" : "";
                return `<div class="option is-review ${cls}"><span class="option__letter">${LETTERS[j]}</span><span>${Utils.escape(option.text)}<span class="visually-hidden">${note}</span></span></div>`;
              })
              .join("")}
          </div>
          ${!chosen ? '<p class="field__hint mt-5">You did not answer this question.</p>' : ""}
        </div>`;
      })
      .join("");
  }

  function renderResult(result, justFinished = false) {
    const passed = result.passed;
    const left = attemptsLeft();
    const best = bestScore();

    root.innerHTML = `
      <section class="card">
        <div class="result">
          <div class="result__score" style="--value: ${result.score}; --ring: var(${passed ? "--color-success" : "--color-danger"})"
               role="img" aria-label="Score ${result.score} out of 100"><span>${result.score}</span></div>
          <div>
            <p class="page-header__eyebrow">Attempt ${result.attemptNumber} of ${quiz.maxAttempts}</p>
            <h2 class="lesson__title">${passed ? "Well done — you passed!" : "Not passed yet"}</h2>
            <p class="text-muted">${result.correct} of ${result.total} correct · passing score ${quiz.passingScore}${best !== null ? ` · best score ${best}` : ""}</p>
            <div class="page-header__actions mt-5">
              <a class="btn btn--outline" href="${courseUrl}"><i data-icon="chevron-left" class="icon--sm"></i>Back to course</a>
              ${justFinished ? "" : '<button class="btn btn--outline" type="button" data-intro>All attempts</button>'}
              ${left > 0 && course.status === "Active" ? '<button class="btn btn--primary" type="button" data-start><i data-icon="refresh" class="icon--sm"></i>Try again</button>' : ""}
            </div>
          </div>
        </div>
      </section>

      <section class="card mt-5" aria-labelledby="review-title">
        <h2 class="card__title card__header" id="review-title">Answer review</h2>
        ${reviewTemplate(result)}
      </section>`;
    renderIcons(root);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- Event ---------- */
  root.addEventListener("click", (e) => {
    const startBtn = e.target.closest("[data-start]");
    if (startBtn) return start(startBtn);
    if (e.target.closest("[data-intro]")) return renderIntro();
    if (e.target.closest("[data-submit]")) return submit();

    const review = e.target.closest("[data-review]");
    if (review) {
      UI.busy(review, Api.attempts.get(review.dataset.review))
        .then((result) => renderResult(result))
        .catch((err) => UI.toast(err.message, "error"));
      return;
    }

    const nav = e.target.closest("[data-nav]");
    if (nav && !nav.disabled) {
      current += Number(nav.dataset.nav);
      return renderQuestion();
    }
    const goto = e.target.closest("[data-goto]");
    if (goto) {
      current = Number(goto.dataset.goto);
      renderQuestion();
    }
  });

  root.addEventListener("change", (e) => {
    if (e.target.name !== "answer") return;
    answers[current] = Number(e.target.value);
    const btn = root.querySelector(`[data-goto="${current}"]`);
    btn.classList.add("is-answered");
    btn.setAttribute("aria-label", `Question ${current + 1}, answered`);
    root.querySelector(".quiz-header .text-muted").textContent = `${answers.filter((a) => a !== null).length} answered`;
    queueSave();
  });

  // Keyboard: 1–4 pilih jawaban, ← → pindah soal
  document.addEventListener("keydown", (e) => {
    if (!inProgress || document.querySelector(".modal") || e.target.matches("input[type=search]")) return;
    if (/^[1-4]$/.test(e.key)) {
      const radio = root.querySelectorAll('input[name="answer"]')[Number(e.key) - 1];
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else if (e.target.matches("input[type=radio]")) {
      return; // panah pada radio dipakai browser untuk memilih opsi
    } else if (e.key === "ArrowRight" && current < total - 1) {
      current += 1;
      renderQuestion();
    } else if (e.key === "ArrowLeft" && current > 0) {
      current -= 1;
      renderQuestion();
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (inProgress) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  renderIntro();
});
