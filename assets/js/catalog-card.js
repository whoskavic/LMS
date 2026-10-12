// Kartu course publik (dipakai catalog.html dan instructor.html): thumbnail, kategori, instructor,
// rating rata-rata + jumlah ulasan, jumlah learner, jumlah modul + durasi, label "Free".
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

  card(c) {
    const href = `catalog.html?course=${encodeURIComponent(c.slug)}`;
    return `
    <article class="card course-card">
      <div class="course-card__body">
        ${Catalog.thumb(c)}
        <p class="course-card__code">${Utils.escape(Utils.orDash(c.category))}</p>
        <h3 class="course-card__title"><a href="${href}">${Utils.escape(c.title)}</a></h3>
        <p class="course-card__instructor"><a href="instructor.html?id=${encodeURIComponent(c.instructorId)}">${Utils.escape(c.instructorName)}</a></p>
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
