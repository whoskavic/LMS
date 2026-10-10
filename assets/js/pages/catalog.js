// Katalog publik — cari course Active (q di judul & deskripsi), filter kategori, pagination server, detail course.
// Bisa dibuka tanpa login. Student yang login bisa langsung enroll dari halaman detail.

document.addEventListener("DOMContentLoaded", () => {
  const PAGE_SIZE = 9;
  const grid = document.getElementById("catalog-grid");
  const summary = document.getElementById("catalog-summary");
  const paginationNav = document.getElementById("catalog-pagination");
  const searchForm = document.getElementById("catalog-search");
  const qInput = document.getElementById("catalog-q");
  const categorySelect = document.getElementById("catalog-category");
  const sortSelect = document.getElementById("catalog-sort");
  const listView = document.getElementById("catalog-list-view");
  const detailView = document.getElementById("catalog-detail-view");
  const detail = document.getElementById("catalog-detail");

  const params = Utils.params();
  const state = { q: params.get("q") || "", category: params.get("category") || "", sort: params.get("sort") || "title", page: Number(params.get("page")) || 1 };
  let user = null;
  let requestId = 0;

  qInput.value = state.q;
  sortSelect.value = state.sort;

  // Sesi opsional: tampilkan tombol dashboard bila sudah login
  App.session
    .then((me) => {
      user = me;
      if (!me) return;
      const account = document.getElementById("nav-account");
      account.textContent = "My dashboard";
      account.href = `pages/${homeFor(me.role)}`;
      document.getElementById("nav-signup").remove();
    })
    .catch(() => {});

  Api.meta
    .categories()
    .then((names) => {
      categorySelect.insertAdjacentHTML("beforeend", names.map((n) => `<option value="${Utils.escape(n)}">${Utils.escape(n)}</option>`).join(""));
      categorySelect.value = state.category;
    })
    .catch(() => {});

  const syncUrl = () => {
    const query = new URLSearchParams();
    if (state.q) query.set("q", state.q);
    if (state.category) query.set("category", state.category);
    if (state.sort !== "title") query.set("sort", state.sort);
    if (state.page > 1) query.set("page", state.page);
    history.replaceState(null, "", `catalog.html${query.toString() ? `?${query}` : ""}`);
  };

  const cardTemplate = (c) => `
    <article class="card course-card">
      <div class="course-card__body">
        <div class="course-card__thumb" style="background: ${Utils.escape(c.color || "var(--color-primary-soft)")}"></div>
        <p class="course-card__code">${Utils.escape(Utils.orDash(c.code))} · ${Utils.escape(Utils.orDash(c.category))}</p>
        <h3 class="course-card__title">${Utils.escape(c.title)}</h3>
        <p class="course-card__instructor">${Utils.escape(c.instructorName)}</p>
        <p class="course-card__meta">${c.modules} modules · ${c.students} students${c.certificate ? " · certificate" : ""}<br><strong>Free</strong></p>
      </div>
      <div class="course-card__footer">
        <a class="btn btn--primary" href="catalog.html?course=${encodeURIComponent(c.slug)}" data-open="${Utils.escape(c.slug)}">View course <i data-icon="arrow-right" class="icon--sm"></i></a>
      </div>
    </article>`;

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
        UI.empty(grid, {
          title: state.q || state.category ? "No courses match your search" : "No courses published yet",
          text: state.q || state.category ? "Try another keyword or category." : "Check back soon — instructors are preparing new courses.",
          icon: "search",
          action: state.q || state.category ? { label: "Clear search", onClick: () => { state.q = ""; state.category = ""; qInput.value = ""; categorySelect.value = ""; state.page = 1; renderList(); } } : undefined,
        });
        return;
      }
      grid.innerHTML = res.items.map(cardTemplate).join("");
      renderIcons(grid);
      const start = (res.page - 1) * res.pageSize;
      summary.textContent = `Showing ${start + 1}–${start + res.items.length} of ${res.total} courses${state.q ? ` for “${state.q}”` : ""}`;
      UI.pagination(paginationNav, state, res.total, PAGE_SIZE, renderList);
    } catch (err) {
      if (id !== requestId) return;
      UI.error(grid, err, renderList, { title: "Could not load the catalog" });
    }
  }

  /* ---------- Detail ---------- */
  function enrollAction(course) {
    if (!user) return `<a class="btn btn--primary" href="index.html">Log in to enroll</a> <a class="btn btn--outline" href="register.html">Create a free account</a>`;
    if (user.role !== "student") return `<p class="text-muted">Only student accounts can enroll in courses.</p>`;
    if (!course.enrollmentOpen) return `<p class="text-muted">Enrollment for this course is currently closed.</p>`;
    return `<button class="btn btn--primary" type="button" id="enroll-btn">Enroll for free</button>`;
  }

  function renderDetail(course) {
    document.title = `${course.title} | Learnova LMS`;
    document.getElementById("detail-crumb").textContent = course.code || course.title;
    detail.innerHTML = `
      <section class="page-header">
        <div>
          <p class="page-header__eyebrow">${Utils.escape(Utils.orDash(course.category))} · ${Utils.escape(Utils.orDash(course.code))}</p>
          <h1 class="page-header__title">${Utils.escape(course.title)}</h1>
          <p class="page-header__subtitle">by ${Utils.escape(course.instructorName)} · ${course.students} students enrolled</p>
        </div>
        <div class="page-header__actions" id="enroll-actions">${enrollAction(course)}</div>
      </section>
      <div class="grid grid--2-1">
        <article class="card">
          <header class="card__header"><h2 class="card__title">About this course</h2></header>
          <p class="text-muted">${Utils.escape(course.description || "No description yet.")}</p>
          <header class="card__header mt-5"><h2 class="card__title">Course outline</h2><p class="card__subtitle">${course.outline.length} modules · ${course.quizzes} quizzes</p></header>
          ${
            course.outline.length
              ? `<ul class="row-list">${course.outline
                  .map((m) => `<li><span class="row-list__order">${m.order}</span><div class="row-list__main"><p class="row-list__title">${Utils.escape(m.title)}</p><p class="row-list__meta">${m.type} · ${Utils.orDash(m.minutes)} min</p></div></li>`)
                  .join("")}</ul>`
              : '<p class="text-muted">The instructor has not published any modules yet.</p>'
          }
        </article>
        <article class="card">
          <header class="card__header"><h2 class="card__title">Course details</h2></header>
          <div class="kv-grid">
            ${[
              ["Price", "Free"],
              ["Semester", Utils.orDash(course.semester)],
              ["Duration", course.duration ? `${course.duration} weeks` : "–"],
              ["Start date", Utils.orDash(Utils.formatDate(course.startDate, false))],
              ["Seats", course.maxStudents ? `${course.seatsLeft} of ${course.maxStudents} left` : "Unlimited"],
              ["Certificate", course.certificate ? "Issued on completion" : "Not issued"],
            ]
              .map(([label, value]) => `<div><p class="kv__label">${label}</p><p class="kv__value">${Utils.escape(value)}</p></div>`)
              .join("")}
          </div>
        </article>
      </div>`;
    renderIcons(detail);
    document.getElementById("enroll-btn")?.addEventListener("click", (e) => enroll(course, e.currentTarget));
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
    UI.load(detail, () => Api.catalog.get(slug), renderDetail, { label: "Loading course…" }).then(() => {
      // error state sudah ditampilkan oleh UI.load
    });
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
  categorySelect.addEventListener("change", () => {
    state.category = categorySelect.value;
    state.page = 1;
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
