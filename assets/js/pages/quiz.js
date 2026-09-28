// Quiz mahasiswa — intro, pengerjaan (timer, navigasi soal, keyboard), konfirmasi submit, hasil & review jawaban

document.addEventListener("DOMContentLoaded", () => {
  const me = Store.currentUser();
  const quiz = DB.get("quizzes", Utils.params().get("id"));
  const course = quiz ? DB.get("courses", quiz.courseId) : null;
  const enrollment = course ? Store.enrollment(me.id, course.id) : null;

  if (!quiz || !enrollment) {
    Store.setFlash("Quiz not found or you are not enrolled in this course.", "error");
    location.replace("student-dashboard.html");
    return;
  }

  const root = document.getElementById("quiz-root");
  const LETTERS = ["A", "B", "C", "D"];
  const total = quiz.questions.length;
  const setText = (id, value) => (document.getElementById(id).textContent = value);

  document.title = `${quiz.title} | Learnova LMS`;
  setText("quiz-title", quiz.title);
  setText("quiz-meta", `${course.code} · ${course.title}`);
  const crumb = document.getElementById("crumb-course");
  crumb.textContent = course.code;
  crumb.href = `course.html?id=${course.id}`;

  let answers = [];
  let current = 0;
  let deadline = 0;
  let timer = null;
  let inProgress = false;

  const attempts = () => Store.attemptsOf(enrollment, quiz.id);
  const attemptsLeft = () => quiz.maxAttempts - attempts().length;
  const formatTime = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  /* ---------- 1. Intro ---------- */
  function renderIntro() {
    const list = attempts();
    const best = Store.bestScore(enrollment, quiz.id);
    const left = attemptsLeft();

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
            <li>The timer starts when you click <strong>Start quiz</strong> and the quiz is submitted automatically when time runs out.</li>
            <li>You can move between questions and change answers before submitting.</li>
            <li>Keyboard: press <strong>1–4</strong> to choose an answer and <strong>←</strong> / <strong>→</strong> to move between questions.</li>
            <li>Your best score counts toward the course.</li>
          </ul></div>
          <div class="lesson__footer">
            <a class="btn btn--outline" href="course.html?id=${course.id}"><i data-icon="chevron-left" class="icon--sm"></i>Back to course</a>
            ${
              left > 0
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
                      (a, i) => `
                <li>
                  <span class="row-list__order">${i + 1}</span>
                  <div class="row-list__main">
                    <p class="row-list__title">${a.score} / 100</p>
                    <p class="row-list__meta">${Utils.formatDate(a.date)}</p>
                  </div>
                  <span class="badge ${a.score >= quiz.passingScore ? "badge--success" : "badge--danger"}">${a.score >= quiz.passingScore ? "Passed" : "Not passed"}</span>
                  <button class="btn btn--link" type="button" data-review="${i}">Review</button>
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
  function start() {
    answers = Array(total).fill(null);
    current = 0;
    deadline = Date.now() + quiz.timeLimit * 60 * 1000;
    inProgress = true;
    timer = setInterval(tick, 1000);
    renderQuestion();
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
    const q = quiz.questions[current];
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
                <span>${Utils.escape(option)}</span>
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
  function finish() {
    if (!inProgress) return;
    inProgress = false;
    clearInterval(timer);
    const result = Store.submitAttempt(enrollment.id, quiz.id, answers.map((a) => (a === null ? -1 : a)));
    Store.logActivity(`Completed ${quiz.title} with a score of ${result.score}`);
    renderResult(attempts().length - 1, true);
  }

  function reviewTemplate(attempt) {
    return quiz.questions
      .map((q, i) => {
        const chosen = attempt.answers[i];
        const correct = chosen === q.answer;
        return `
        <div class="review-item">
          <p class="page-header__eyebrow">Question ${i + 1} · ${correct ? '<span class="text-success">Correct</span>' : '<span class="text-danger">Incorrect</span>'}</p>
          <p class="question__text">${Utils.escape(q.text)}</p>
          <div class="options">
            ${q.options
              .map((option, j) => {
                const cls = j === q.answer ? "is-correct" : j === chosen ? "is-wrong" : "";
                const note = j === q.answer ? " — correct answer" : j === chosen ? " — your answer" : "";
                return `<div class="option is-review ${cls}"><span class="option__letter">${LETTERS[j]}</span><span>${Utils.escape(option)}<span class="visually-hidden">${note}</span></span></div>`;
              })
              .join("")}
          </div>
          ${chosen === -1 || chosen === undefined ? '<p class="field__hint mt-5">You did not answer this question.</p>' : ""}
        </div>`;
      })
      .join("");
  }

  function renderResult(index, justFinished = false) {
    const attempt = attempts()[index];
    const passed = attempt.score >= quiz.passingScore;
    const correct = quiz.questions.filter((q, i) => attempt.answers[i] === q.answer).length;
    const left = attemptsLeft();

    root.innerHTML = `
      <section class="card">
        <div class="result">
          <div class="result__score" style="--value: ${attempt.score}; --ring: var(${passed ? "--color-success" : "--color-danger"})"
               role="img" aria-label="Score ${attempt.score} out of 100"><span>${attempt.score}</span></div>
          <div>
            <p class="page-header__eyebrow">Attempt ${index + 1} of ${quiz.maxAttempts}</p>
            <h2 class="lesson__title">${passed ? "Well done — you passed!" : "Not passed yet"}</h2>
            <p class="text-muted">${correct} of ${total} correct · passing score ${quiz.passingScore} · best score ${Store.bestScore(enrollment, quiz.id)}</p>
            <div class="page-header__actions mt-5">
              <a class="btn btn--outline" href="course.html?id=${course.id}"><i data-icon="chevron-left" class="icon--sm"></i>Back to course</a>
              ${justFinished ? "" : '<button class="btn btn--outline" type="button" data-intro>All attempts</button>'}
              ${left > 0 ? '<button class="btn btn--primary" type="button" data-start><i data-icon="refresh" class="icon--sm"></i>Try again</button>' : ""}
            </div>
          </div>
        </div>
      </section>

      <section class="card mt-5" aria-labelledby="review-title">
        <h2 class="card__title card__header" id="review-title">Answer review</h2>
        ${reviewTemplate(attempt)}
      </section>`;
    renderIcons(root);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- Event ---------- */
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-start]")) return start();
    if (e.target.closest("[data-intro]")) return renderIntro();
    if (e.target.closest("[data-submit]")) return submit();

    const review = e.target.closest("[data-review]");
    if (review) return renderResult(Number(review.dataset.review));

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
