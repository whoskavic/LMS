// Profil publik instructor (instructor.html?id=…): nama, headline, bio, statistik, dan course Active miliknya.
// Bisa dibuka tanpa login.

document.addEventListener("DOMContentLoaded", () => {
  const view = document.getElementById("instructor-view");
  const id = Utils.params().get("id");

  // Header menyesuaikan user yang login (sama seperti katalog)
  App.session
    .then((me) => {
      if (!me) return;
      const account = document.getElementById("nav-account");
      account.textContent = me.role === "admin" ? "Admin panel" : me.role === "instructor" ? "My dashboard" : "My learning";
      account.href = `pages/${homeFor(me.role)}`;
      document.getElementById("nav-signup").remove();
    })
    .catch(() => {});

  const stat = (label, value) => `
    <article class="card stat-card">
      <p class="stat-card__label">${label}</p>
      <p class="stat-card__value">${value}</p>
    </article>`;

  function render(p) {
    document.title = `${p.name} | Learnova LMS`;
    document.getElementById("instructor-crumb").textContent = p.name;
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
      <div class="grid grid--3 mt-5" id="instructor-courses"></div>`;
    const grid = view.querySelector("#instructor-courses");
    if (p.courses.length) {
      grid.innerHTML = p.courses.map(Catalog.card).join("");
    } else {
      UI.empty(grid, { title: "No published courses yet", text: "Courses appear here once they are approved.", icon: "book" });
    }
    renderIcons(view);
  }

  if (!id) {
    UI.empty(view, {
      title: "Instructor not found",
      text: "Open an instructor profile from a course page.",
      icon: "user",
      action: { label: "Browse courses", onClick: () => (location.href = "catalog.html") },
    });
    return;
  }
  UI.load(view, () => Api.instructors.get(id), render, { label: "Loading instructor…", errorTitle: "Could not load this instructor" });
});
