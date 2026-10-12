// Katalog publik (halaman utama publik) — cari, chip kategori, sort, pagination, dan course landing page.
// Bisa dibuka tanpa login. Tombol di landing page mengikuti status pengunjung (dari `viewer` di respons API):
// belum login → login lalu kembali ke sini · learner → Enroll for free · sudah enroll → Continue learning ·
// pemilik course → Manage course. Bagian ulasan dirender oleh course-reviews.js (event "landing:rendered").

document.addEventListener("DOMContentLoaded", () => {
  const PAGE_SIZE = 9;
  const grid = document.getElementById("catalog-grid");
  const summary = document.getElementById("catalog-summary");
  const paginationNav = document.getElementById("catalog-pagination");
  const searchForm = document.getElementById("catalog-search");
  const qInput = document.getElementById("catalog-q");
  const chips = document.getElementById("catalog-chips");
  const sortSelect = document.getElementById("catalog-sort");
  const listView = document.getElementById("catalog-list-view");
  const detailView = document.getElementById("catalog-detail-view");
  const detail = document.getElementById("catalog-detail");

  const params = Utils.params();
  const state = { q: params.get("q") || "", category: params.get("category") || "", sort: params.get("sort") || "popular", page: Number(params.get("page")) || 1 };
  let requestId = 0;

  qInput.value = state.q;
  if ([...sortSelect.options].some((o) => o.value === state.sort)) sortSelect.value = state.sort;

  // Sesi opsional: tombol header menyesuaikan user yang login
  App.session
    .then((me) => {
      if (!me) return;
      const account = document.getElementById("nav-account");
      account.textContent = me.role === "admin" ? "Admin panel" : me.role === "instructor" ? "My dashboard" : "My learning";
      account.href = `pages/${homeFor(me.role)}`;
      document.getElementById("nav-signup").remove();
    })
    .catch(() => {});

  /* ---------- Chip kategori ---------- */
  function renderChips(names) {
    chips.innerHTML = ["", ...names]
      .map((n) => {
        const active = n === state.category;
        return `<button class="chip ${active ? "is-active" : ""}" type="button" data-category="${Utils.escape(n)}" aria-pressed="${active}">${Utils.escape(n || "All")}</button>`;
      })
      .join("");
  }
  Api.meta.categories().then(renderChips).catch(() => {});

  const syncUrl = () => {
    const query = new URLSearchParams();
    if (state.q) query.set("q", state.q);
    if (state.category) query.set("category", state.category);
    if (state.sort !== "popular") query.set("sort", state.sort);
    if (state.page > 1) query.set("page", state.page);
    history.replaceState(null, "", `catalog.html${query.toString() ? `?${query}` : ""}`);
  };

  const thumb = Catalog.thumb;
  const ratingLine = Catalog.ratingLine;
  const cardTemplate = Catalog.card;

  async function renderList() {
    const id = ++requestId;
    syncUrl();
    UI.loading(grid, { label: "Loading courses…" });
    summary.textContent = "";
    paginationNav.innerHTML = "";
    try {
      const res = await Api.catalog.list({ q: state.q, category: state.category, sort: state.sort, page: state.page, pageSize: PAGE_SIZE });
      if (id !== requestId) return;
      state.page = res.page;
      grid.removeAttribute("aria-busy");
      if (!res.items.length) {
        const filtering = state.q || state.category;
        UI.empty(grid, {
          title: filtering ? "No courses match your search" : "No courses published yet",
          text: filtering ? "Try another keyword or category." : "Check back soon — instructors are preparing new courses.",
          icon: "search",
          action: filtering
            ? {
                label: "Clear search",
                onClick: () => {
                  Object.assign(state, { q: "", category: "", page: 1 });
                  qInput.value = "";
                  renderChips([...chips.querySelectorAll("[data-category]")].map((b) => b.dataset.category).filter(Boolean));
                  renderList();
                },
              }
            : undefined,
        });
        return;
      }
      grid.innerHTML = res.items.map(cardTemplate).join("");
      renderIcons(grid);
      const start = (res.page - 1) * res.pageSize;
      summary.textContent = `Showing ${start + 1}–${start + res.items.length} of ${res.total} free courses${state.q ? ` for “${state.q}”` : ""}${state.category ? ` in ${state.category}` : ""}`;
      UI.pagination(paginationNav, state, res.total, PAGE_SIZE, renderList);
    } catch (err) {
      if (id !== requestId) return;
      UI.error(grid, err, renderList, { title: "Could not load the catalog" });
    }
  }

  /* ---------- Course landing page ---------- */
  function actionBox(course) {
    const v = course.viewer;
    const back = encodeURIComponent(`catalog.html?course=${course.slug}`);
    const learnUrl = `pages/course.html?id=${encodeURIComponent(course.id)}${v.nextModuleNumber ? `&m=${v.nextModuleNumber}` : ""}`;
    if (!v.loggedIn) {
      return `<a class="btn btn--primary btn--block" href="index.html?next=${back}">Enroll for free</a>
        <p class="field__hint mt-5">New here? <a href="register.html?next=${back}">Create a free account</a>.</p>`;
    }
    if (v.isOwner) return `<a class="btn btn--primary btn--block" href="pages/course-detail.html?id=${encodeURIComponent(course.id)}">Manage course</a>`;
    if (v.enrolled) {
      return `<a class="btn btn--primary btn--block" href="${learnUrl}">${v.completed ? "Review course" : v.progress ? "Continue learning" : "Start learning"}</a>
        <div class="progress mt-5" role="progressbar" aria-label="Your progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v.progress}"><div class="progress__bar" style="width: ${v.progress}%"></div></div>
        <p class="field__hint">${v.progress}% complete</p>`;
    }
    if (v.canEnroll) return '<button class="btn btn--primary btn--block" type="button" id="enroll-btn">Enroll for free</button>';
    if (v.role === "admin") return `<a class="btn btn--outline btn--block" href="pages/course-detail.html?id=${encodeURIComponent(course.id)}">Open in admin panel</a>`;
    return "";
  }

  function curriculum(course) {
    if (!course.outline.length) return '<p class="text-muted">The instructor has not published any modules yet.</p>';
    const unlocked = course.viewer.enrolled || course.viewer.isOwner;
    return `<div class="curriculum">${course.outline
      .map(
        (m) => `
      <details>
        <summary>
          <i data-icon="${unlocked ? (m.type === "Lecture" ? "play" : "edit") : "lock"}" class="icon--sm"></i>
          <span>${m.order}. ${Utils.escape(m.title)}</span>
          <span class="curriculum__meta">${m.type} · ${Domain.formatDuration(m.minutes)}</span>
        </summary>
        <p class="curriculum__body">${
          unlocked
            ? `${m.type === "Lecture" ? "Video lecture and notes" : "Hands-on practice tasks"}. Open it from your learning page.`
            : "Enroll for free to unlock this module."
        }</p>
      </details>`
      )
      .join("")}</div>`;
  }

  function renderDetail(course) {
    document.title = `${course.title} | Learnova LMS`;
    document.getElementById("detail-crumb").textContent = course.title;
    detail.innerHTML = `
      <div class="landing mt-5">
        <div class="stack">
          <section class="page-header">
            <div>
              <p class="page-header__eyebrow">${Utils.escape(Utils.orDash(course.category))}</p>
              <h1 class="page-header__title">${Utils.escape(course.title)}</h1>
              <p class="page-header__subtitle">${Utils.escape(course.description || "")}</p>
              ${ratingLine(course)}
              <p class="text-muted">Created by <a href="instructor.html?id=${encodeURIComponent(course.instructorId)}"><strong>${Utils.escape(course.instructorName)}</strong></a>${
                course.instructorHeadline ? ` · ${Utils.escape(course.instructorHeadline)}` : ""
              }</p>
            </div>
          </section>
          <article class="card">
            <header class="card__header">
              <h2 class="card__title">Course content</h2>
              <p class="card__subtitle">${Domain.courseLength(course.modules, course.totalMinutes)} · ${course.quizzes} quiz${course.quizzes === 1 ? "" : "zes"}</p>
            </header>
            ${curriculum(course)}
          </article>
          <div id="landing-extra"></div>
        </div>
        <aside class="card landing__aside" aria-label="Enroll">
          ${thumb(course, "landing__thumb")}
          <p class="page-header__title">Free</p>
          <div id="enroll-actions">${actionBox(course)}</div>
          <ul class="landing__facts">
            <li><i data-icon="users" class="icon--sm"></i>${Utils.number(course.students)} learner${course.students === 1 ? "" : "s"} enrolled</li>
            <li><i data-icon="layers" class="icon--sm"></i>${Domain.courseLength(course.modules, course.totalMinutes)}</li>
            <li><i data-icon="quiz" class="icon--sm"></i>${course.quizzes} quiz${course.quizzes === 1 ? "" : "zes"}</li>
            <li><i data-icon="award" class="icon--sm"></i>${course.certificate ? "Certificate of completion" : "No certificate"}</li>
          </ul>
        </aside>
      </div>`;
    renderIcons(detail);
    document.getElementById("enroll-btn")?.addEventListener("click", (e) => enroll(course, e.currentTarget));
    document.dispatchEvent(new CustomEvent("landing:rendered", { detail: course }));
  }

  async function enroll(course, button) {
    try {
      await UI.busy(button, Api.enrollments.enroll(course.id));
      UI.flash(`You are enrolled in ${course.title}. Happy learning!`);
      location.href = `pages/course.html?id=${encodeURIComponent(course.id)}`;
    } catch (err) {
      if (err.code === "ALREADY_ENROLLED") {
        location.href = `pages/course.html?id=${encodeURIComponent(course.id)}`;
        return;
      }
      UI.toast(err.message, "error");
    }
  }

  async function showDetail(slug) {
    listView.hidden = true;
    detailView.hidden = false;
    await App.session.catch(() => null);
    UI.load(detail, () => Api.catalog.get(slug), renderDetail, { label: "Loading course…" });
  }

  /* ---------- Event ---------- */
  let timer;
  qInput.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = qInput.value.trim();
      state.page = 1;
      renderList();
    }, 300);
  });
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    state.q = qInput.value.trim();
    state.page = 1;
    renderList();
  });
  chips.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-category]");
    if (!chip) return;
    state.category = chip.dataset.category;
    state.page = 1;
    chips.querySelectorAll("[data-category]").forEach((b) => {
      const active = b === chip;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    renderList();
  });
  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    state.page = 1;
    renderList();
  });

  const slug = params.get("course");
  if (slug) showDetail(slug);
  else renderList();
});
