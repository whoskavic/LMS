// Katalog course — SATU renderer untuk DUA shell:
//   - shell publik  (guest): catalog.html, instructor.html — header publik dengan Log in / Sign up
//   - shell aplikasi (login): pages/browse.html — sidebar + header aplikasi seperti halaman lain
// Shell dipilih lewat <body data-catalog-shell="public|app">. Tiga tampilan dari query URL:
//   daftar katalog (q, category, sort, page) · landing page (?course=<id|slug>) ·
//   profil instructor (?instructor=<id> di aplikasi, instructor.html?id=<id> di publik).
// Semua tautan dibentuk lewat Domain.catalogLinks(shell) sehingga user tetap di shell yang aktif.
// Bagian ulasan di landing page dirender course-reviews.js (event "landing:rendered").

/* ---------- Kartu course (dipakai daftar katalog & profil instructor) ---------- */
const Catalog = {
  thumb(c, cls = "course-card__thumb") {
    return c.thumbnailUrl
      ? `<img class="${cls}" src="${Utils.escape(c.thumbnailUrl)}" alt="" loading="lazy">`
      : `<div class="${cls}" style="background: ${Utils.escape(c.color || "var(--color-primary-soft)")}"></div>`;
  },

  ratingLine(c) {
    if (!c.reviewCount) return '<p class="course-card__rating"><span class="badge">New</span></p>';
    return `<p class="course-card__rating"><strong>★ ${Number(c.ratingAverage).toFixed(1)}</strong> (${Utils.number(c.reviewCount)} review${c.reviewCount === 1 ? "" : "s"})</p>`;
  },

  card(c, links) {
    const href = links.course(c.slug);
    return `
    <article class="card course-card">
      <div class="course-card__body">
        ${Catalog.thumb(c)}
        <p class="course-card__code">${Utils.escape(Utils.orDash(c.category))}</p>
        <h3 class="course-card__title"><a href="${href}">${Utils.escape(c.title)}</a></h3>
        <p class="course-card__instructor"><a href="${links.instructor(c.instructorId)}">${Utils.escape(c.instructorName)}</a></p>
        ${Catalog.ratingLine(c)}
        <p class="course-card__meta">${Utils.number(c.students)} learner${c.students === 1 ? "" : "s"} · ${Domain.courseLength(c.modules, c.totalMinutes)}</p>
        <span class="badge badge--free">Free</span>
      </div>
      <div class="course-card__footer">
        <a class="btn btn--primary" href="${href}">View course <i data-icon="arrow-right" class="icon--sm"></i></a>
      </div>
    </article>`;
  },
};

const CatalogView = {
  PAGE_SIZE: 9,

  start(root, shell) {
    const links = Domain.catalogLinks(shell);
    const params = Utils.params();
    const ctx = { root, shell, links, params };
    const page = location.pathname.split("/").pop();
    const instructorId = shell === "app" ? params.get("instructor") : page === "instructor.html" ? params.get("id") : null;
    if (page === "instructor.html" || instructorId) return CatalogView.instructor(ctx, instructorId);
    if (params.get("course")) return CatalogView.landing(ctx, params.get("course"));
    return CatalogView.list(ctx);
  },

  breadcrumb(links, current) {
    return `
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="${links.list()}" data-back-to-catalog>Courses</a>
        <span aria-hidden="true">/</span>
        <span data-crumb aria-current="page">${Utils.escape(current)}</span>
      </nav>`;
  },

  /* ---------- Daftar katalog ---------- */
  list({ root, shell, links, params }) {
    const state = {
      q: params.get("q") || "",
      category: params.get("category") || "",
      sort: params.get("sort") || "popular",
      page: Number(params.get("page")) || 1,
    };
    root.innerHTML = `
      <section class="catalog-hero ${shell === "app" ? "catalog-hero--app" : ""}">
        <p class="page-header__eyebrow">Free courses for everyone</p>
        <h1 class="catalog-hero__title">${shell === "app" ? "Browse courses" : "Learn something new today"}</h1>
        <p class="page-header__subtitle">Every course on Learnova is free. Search a topic, enroll in one click, and learn at your own pace.</p>
        <form class="search catalog-hero__search" id="catalog-search" role="search">
          <i data-icon="search" class="icon--sm"></i>
          <label class="visually-hidden" for="catalog-q">Search courses</label>
          <input class="search__input" id="catalog-q" name="q" type="search" placeholder="What do you want to learn?" autocomplete="off">
        </form>
      </section>
      <div class="catalog-toolbar">
        <div class="chips" id="catalog-chips" role="group" aria-label="Filter by category">
          <button class="chip is-active" type="button" data-category="" aria-pressed="true">All</button>
        </div>
        <label class="visually-hidden" for="catalog-sort">Sort</label>
        <select class="field__input field__input--auto" id="catalog-sort" name="sort">
          <option value="popular">Most popular</option>
          <option value="rating">Highest rated</option>
          <option value="newest">Newest</option>
          <option value="title">Title A–Z</option>
        </select>
      </div>
      <p class="text-muted mt-5" id="catalog-summary" aria-live="polite"></p>
      <div class="grid catalog-grid mt-5" id="catalog-grid"></div>
      <div class="table-footer">
        <p></p>
        <nav class="pagination" id="catalog-pagination" aria-label="Pagination"></nav>
      </div>`;
    renderIcons(root);

    const grid = root.querySelector("#catalog-grid");
    const summary = root.querySelector("#catalog-summary");
    const paginationNav = root.querySelector("#catalog-pagination");
    const qInput = root.querySelector("#catalog-q");
    const chips = root.querySelector("#catalog-chips");
    const sortSelect = root.querySelector("#catalog-sort");
    // Shell aplikasi: kolom search di header ikut mencari katalog (nilainya disinkronkan)
    const headerSearch = shell === "app" ? document.getElementById("global-search") : null;
    let requestId = 0;

    qInput.value = state.q;
    if (headerSearch) headerSearch.value = state.q;
    if ([...sortSelect.options].some((o) => o.value === state.sort)) sortSelect.value = state.sort;

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
      const query = { q: state.q, category: state.category, sort: state.sort === "popular" ? "" : state.sort, page: state.page > 1 ? state.page : "" };
      history.replaceState(null, "", links.list(query));
    };

    async function render() {
      const id = ++requestId;
      syncUrl();
      UI.loading(grid, { label: "Loading courses…" });
      summary.textContent = "";
      paginationNav.innerHTML = "";
      try {
        const res = await Api.catalog.list({ q: state.q, category: state.category, sort: state.sort, page: state.page, pageSize: CatalogView.PAGE_SIZE });
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
                    setQuery("");
                    renderChips([...chips.querySelectorAll("[data-category]")].map((b) => b.dataset.category).filter(Boolean));
                    render();
                  },
                }
              : undefined,
          });
          return;
        }
        grid.innerHTML = res.items.map((c) => Catalog.card(c, links)).join("");
        renderIcons(grid);
        const start = (res.page - 1) * res.pageSize;
        summary.textContent = `Showing ${start + 1}–${start + res.items.length} of ${res.total} free courses${state.q ? ` for “${state.q}”` : ""}${state.category ? ` in ${state.category}` : ""}`;
        UI.pagination(paginationNav, state, res.total, CatalogView.PAGE_SIZE, render);
      } catch (err) {
        if (id !== requestId) return;
        UI.error(grid, err, render, { title: "Could not load the catalog" });
      }
    }

    // Kolom search katalog & header saling sinkron
    function setQuery(value, source) {
      if (source !== qInput) qInput.value = value;
      if (headerSearch && source !== headerSearch) headerSearch.value = value;
    }
    let timer;
    const search = (input) => {
      setQuery(input.value, input);
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.q = input.value.trim();
        state.page = 1;
        render();
      }, 300);
    };
    qInput.addEventListener("input", () => search(qInput));
    headerSearch?.addEventListener("input", () => search(headerSearch));
    [root.querySelector("#catalog-search"), headerSearch?.form].filter(Boolean).forEach((form) =>
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = form.querySelector("input");
        clearTimeout(timer);
        setQuery(input.value, input);
        state.q = input.value.trim();
        state.page = 1;
        render();
      })
    );
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
      render();
    });
    sortSelect.addEventListener("change", () => {
      state.sort = sortSelect.value;
      state.page = 1;
      render();
    });

    render();
  },

  /* ---------- Course landing page ---------- */
  landing({ root, shell, links }, slug) {
    root.innerHTML = `${CatalogView.breadcrumb(links, "Course")}<div id="catalog-detail"></div>`;
    const detail = root.querySelector("#catalog-detail");

    // Shell aplikasi: header search kembali ke daftar katalog dengan kata kunci tersebut
    if (shell === "app") CatalogView.searchToList(links);

    function actionBox(course) {
      const v = course.viewer;
      const learnUrl = links.learn(course.id, v.nextModuleNumber);
      if (!v.loggedIn) {
        return `<a class="btn btn--primary btn--block" href="${links.login(course.slug)}">Enroll for free</a>
          <p class="field__hint mt-5">New here? <a href="${links.register(course.slug)}">Create a free account</a>.</p>`;
      }
      if (v.isOwner) return `<a class="btn btn--primary btn--block" href="${links.manage(course.id)}">Manage course</a>`;
      if (v.enrolled) {
        return `<a class="btn btn--primary btn--block" href="${learnUrl}">${v.completed ? "Review course" : v.progress ? "Continue learning" : "Start learning"}</a>
          <div class="progress mt-5" role="progressbar" aria-label="Your progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v.progress}"><div class="progress__bar" style="width: ${v.progress}%"></div></div>
          <p class="field__hint">${v.progress}% complete</p>`;
      }
      if (v.canEnroll) return '<button class="btn btn--primary btn--block" type="button" id="enroll-btn">Enroll for free</button>';
      if (v.role === "admin") return `<a class="btn btn--outline btn--block" href="${links.manage(course.id)}">Open in admin panel</a>`;
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

    function render(course) {
      document.title = `${course.title} | Learnova LMS`;
      root.querySelector("[data-crumb]").textContent = course.title;
      detail.innerHTML = `
        <div class="landing mt-5">
          <div class="stack">
            <section class="page-header">
              <div>
                <p class="page-header__eyebrow">${Utils.escape(Utils.orDash(course.category))}</p>
                <h1 class="page-header__title">${Utils.escape(course.title)}</h1>
                <p class="page-header__subtitle">${Utils.escape(course.description || "")}</p>
                ${Catalog.ratingLine(course)}
                <p class="text-muted">Created by <a href="${links.instructor(course.instructorId)}"><strong>${Utils.escape(course.instructorName)}</strong></a>${
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
            ${Catalog.thumb(course, "landing__thumb")}
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
      detail.querySelector("#enroll-btn")?.addEventListener("click", (e) => enroll(course, e.currentTarget));
      document.dispatchEvent(new CustomEvent("landing:rendered", { detail: course }));
    }

    async function enroll(course, button) {
      try {
        await UI.busy(button, Api.enrollments.enroll(course.id));
        UI.flash(`You are enrolled in ${course.title}. Happy learning!`);
        location.href = links.learn(course.id);
      } catch (err) {
        if (err.code === "ALREADY_ENROLLED") {
          location.href = links.learn(course.id);
          return;
        }
        UI.toast(err.message, "error");
      }
    }

    UI.load(detail, () => Api.catalog.get(slug), render, { label: "Loading course…", errorTitle: "Could not load this course" });
  },

  /* ---------- Profil publik instructor ---------- */
  instructor({ root, shell, links }, id) {
    root.innerHTML = `${CatalogView.breadcrumb(links, "Instructor")}<div id="instructor-view" class="mt-5" aria-live="polite"></div>`;
    const view = root.querySelector("#instructor-view");
    if (shell === "app") CatalogView.searchToList(links);

    const stat = (label, value) => `
      <article class="card stat-card">
        <p class="stat-card__label">${label}</p>
        <p class="stat-card__value">${value}</p>
      </article>`;

    function render(p) {
      document.title = `${p.name} | Learnova LMS`;
      root.querySelector("[data-crumb]").textContent = p.name;
      const s = p.stats;
      view.innerHTML = `
        <section class="card instructor-hero">
          <span class="avatar avatar--dark" aria-hidden="true">${Utils.escape(Utils.initials(p.name))}</span>
          <div>
            <p class="page-header__eyebrow">Instructor</p>
            <h1 class="page-header__title">${Utils.escape(p.name)}</h1>
            ${p.headline ? `<p class="page-header__subtitle">${Utils.escape(p.headline)}</p>` : ""}
          </div>
        </section>

        <section class="grid grid--4 mt-5" aria-label="Instructor statistics">
          ${stat("Courses", Utils.number(s.courses))}
          ${stat("Learners", Utils.number(s.learners))}
          ${stat("Reviews", Utils.number(s.reviews))}
          ${stat("Rating", s.rating == null ? "–" : `★ ${Number(s.rating).toFixed(1)}`)}
        </section>

        <article class="card mt-5">
          <header class="card__header"><h2 class="card__title">About me</h2></header>
          <p class="instructor-bio">${p.bio ? Utils.escape(p.bio) : '<span class="text-muted">This instructor has not written a bio yet.</span>'}</p>
        </article>

        <h2 class="card__title mt-5">Courses by ${Utils.escape(p.name)}</h2>
        <div class="grid catalog-grid mt-5" id="instructor-courses"></div>`;
      const grid = view.querySelector("#instructor-courses");
      if (p.courses.length) grid.innerHTML = p.courses.map((c) => Catalog.card(c, links)).join("");
      else UI.empty(grid, { title: "No published courses yet", text: "Courses appear here once they are approved.", icon: "book" });
      renderIcons(view);
    }

    if (!id) {
      UI.empty(view, {
        title: "Instructor not found",
        text: "Open an instructor profile from a course page.",
        icon: "user",
        action: { label: "Browse courses", onClick: () => (location.href = links.list()) },
      });
      return;
    }
    UI.load(view, () => Api.instructors.get(id), render, { label: "Loading instructor…", errorTitle: "Could not load this instructor" });
  },

  // Di landing page / profil (shell aplikasi), Enter di search header membuka daftar katalog dengan kata kunci itu
  searchToList(links) {
    const input = document.getElementById("global-search");
    input?.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      location.href = links.list({ q: input.value.trim() });
    });
  },
};

/* ---------- Boot ---------- */
(() => {
  const shell = document.body.dataset.catalogShell;
  if (!shell) return;
  const root = document.getElementById("catalog-root");
  if (shell === "app") {
    App.ready(() => CatalogView.start(root, "app"));
    return;
  }
  // Shell publik: user yang sudah login (sesi terverifikasi) pindah ke shell aplikasi; guest tetap di sini
  App.session
    .then((user) => {
      if (user) {
        location.replace(Domain.appCatalogUrl(location.pathname.split("/").pop() || "catalog.html", location.search));
        return;
      }
      const start = () => CatalogView.start(root, "public");
      document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start, { once: true }) : start();
    })
    .catch(() => {
      // Sesi tidak bisa diverifikasi (mis. server error): tetap tampilkan katalog publik
      CatalogView.start(root, "public");
    });
})();
