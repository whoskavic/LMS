// Ulasan di course landing page (catalog.html?course=…): ringkasan rating, distribusi bintang, daftar ulasan
// (publik, "Show more"), dan form ulasan untuk learner yang sudah terdaftar. Penulis bisa edit/hapus ulasannya;
// admin bisa menghapus ulasan apa pun (moderasi). Dirender setelah event "landing:rendered" dari catalog.js.

document.addEventListener("landing:rendered", (event) => {
  const course = event.detail;
  const host = document.getElementById("landing-extra");
  if (!host) return;
  const PAGE_SIZE = 5;
  const viewer = course.viewer || {};
  const state = { page: 1, items: [], total: 0, summary: null, myReview: viewer.myReview || null, editing: false };

  const stars = (n) => `<span class="stars" aria-label="${n} out of 5 stars">${"★".repeat(n)}<span class="stars__off">${"★".repeat(5 - n)}</span></span>`;
  const plural = (n, word) => `${Utils.number(n)} ${word}${n === 1 ? "" : "s"}`;

  host.innerHTML = `
    <article class="card" id="reviews">
      <header class="card__header">
        <h2 class="card__title">Learner reviews</h2>
        <p class="card__subtitle" id="reviews-subtitle"></p>
      </header>
      <div id="review-form-host"></div>
      <div id="reviews-body"></div>
    </article>`;
  const body = host.querySelector("#reviews-body");
  const formHost = host.querySelector("#review-form-host");
  const subtitle = host.querySelector("#reviews-subtitle");

  /* ---------- Ringkasan + daftar ---------- */
  function summaryBlock(s) {
    const max = Math.max(1, ...s.distribution.map((d) => d.count));
    return `
      <div class="review-summary">
        <div class="review-summary__score">
          <p class="review-summary__value">${Number(s.average).toFixed(1)}</p>
          ${stars(Math.round(s.average))}
          <p class="text-muted">Course rating</p>
        </div>
        <ul class="review-summary__bars">${s.distribution
          .map(
            (d) => `
          <li>
            <span>${d.stars} ★</span>
            <span class="progress" role="presentation"><span class="progress__bar" style="width: ${Math.round((d.count / max) * 100)}%"></span></span>
            <span class="text-muted">${d.count}</span>
          </li>`
          )
          .join("")}</ul>
      </div>`;
  }

  function reviewItem(r) {
    const mine = App.user && r.userId === App.user.id;
    const canDelete = mine || App.user?.role === "admin";
    return `
      <li class="review" data-review="${Utils.escape(r.id)}">
        <span class="avatar" aria-hidden="true">${Utils.escape(Utils.initials(r.userName))}</span>
        <div class="review__body">
          <p class="review__head"><strong>${Utils.escape(r.userName)}</strong>${mine ? ' <span class="badge">You</span>' : ""}</p>
          <p>${stars(r.rating)} <span class="text-muted">${Utils.formatDate(r.createdAt, false)}${new Date(r.updatedAt) - new Date(r.createdAt) > 60000 ? " · edited" : ""}</span></p>
          ${r.comment ? `<p class="review__comment">${Utils.escape(r.comment)}</p>` : ""}
        </div>
        ${
          canDelete
            ? `<div class="review__actions">
                ${mine ? `<button class="icon-btn" type="button" data-edit-review aria-label="Edit your review" title="Edit"><i data-icon="edit" class="icon--sm"></i></button>` : ""}
                <button class="icon-btn icon-btn--danger" type="button" data-delete-review="${Utils.escape(r.id)}" aria-label="Delete review" title="Delete"><i data-icon="trash" class="icon--sm"></i></button>
              </div>`
            : ""
        }
      </li>`;
  }

  function renderBody() {
    const s = state.summary;
    subtitle.textContent = s.count ? `${Number(s.average).toFixed(1)} average · ${plural(s.count, "review")}` : "";
    if (!state.items.length) {
      UI.empty(body, {
        title: "No reviews yet",
        text: viewer.enrolled ? "Be the first to share what you think of this course." : "Learners who take this course can leave a review.",
        icon: "award",
      });
      return;
    }
    body.innerHTML = `
      ${summaryBlock(s)}
      <ul class="review-list">${state.items.map(reviewItem).join("")}</ul>
      ${state.items.length < state.total ? '<button class="btn btn--outline btn--block" type="button" id="reviews-more">Show more reviews</button>' : ""}`;
    renderIcons(body);
  }

  async function load(reset = true) {
    if (reset) {
      state.page = 1;
      state.items = [];
      UI.loading(body, { label: "Loading reviews…" });
    }
    try {
      const res = await Api.reviews.list(course.id, { page: state.page, pageSize: PAGE_SIZE });
      state.items = reset ? res.items : [...state.items, ...res.items];
      state.total = res.total;
      state.summary = res.summary;
      renderBody();
    } catch (err) {
      if (reset) UI.error(body, err, () => load(true), { title: "Could not load reviews" });
      else UI.toast(err.message, "error");
    }
  }

  /* ---------- Form ulasan (learner terdaftar) ---------- */
  function ratingInput(value) {
    return `
      <fieldset class="rating-input" data-field="rating">
        <legend class="field__label">Your rating <span class="required">*</span></legend>
        <div class="rating-input__stars">${[5, 4, 3, 2, 1]
          .map(
            (n) => `<input type="radio" id="rating-${n}" name="rating" value="${n}" ${Number(value) === n ? "checked" : ""}>
              <label for="rating-${n}" title="${n} star${n === 1 ? "" : "s"}"><span class="visually-hidden">${n} star${n === 1 ? "" : "s"}</span>★</label>`
          )
          .join("")}</div>
        <p class="field__error"><i data-icon="alert" class="icon--sm"></i><span></span></p>
      </fieldset>`;
  }

  function renderForm() {
    if (!viewer.enrolled) {
      formHost.innerHTML = "";
      return;
    }
    const r = state.myReview;
    if (r && !state.editing) {
      formHost.innerHTML = `<p class="review-note"><i data-icon="check-circle" class="icon--sm"></i>You rated this course ${stars(r.rating)} <button class="btn btn--link" type="button" data-edit-review>Edit your review</button></p>`;
      renderIcons(formHost);
      return;
    }
    formHost.innerHTML = `
      <form class="review-form" id="review-form" novalidate>
        <h3 class="review-form__title">${r ? "Edit your review" : "Rate this course"}</h3>
        ${ratingInput(r?.rating)}
        ${UI.field({ name: "comment", label: "Your review", type: "textarea", required: false, value: r?.comment || "", placeholder: "What did you like? What could be better?", hint: "Optional · up to 1000 characters", attrs: 'maxlength="1000" rows="3"' })}
        <div class="review-form__actions">
          ${r ? '<button class="btn btn--outline" type="button" data-cancel-edit>Cancel</button>' : ""}
          <button class="btn btn--primary" type="submit">${r ? "Save review" : "Submit review"}</button>
        </div>
      </form>`;
    renderIcons(formHost);
  }

  async function submit(form) {
    const v = UI.formValues(form);
    const rating = Number(form.querySelector("input[name=rating]:checked")?.value || 0);
    const comment = v.comment || "";
    UI.fieldError(form, "rating", rating ? "" : "Choose a rating from 1 to 5 stars.");
    UI.fieldError(form, "comment", comment.length > 1000 ? "Review must be at most 1000 characters." : "");
    if (!rating || comment.length > 1000) return;
    try {
      const payload = { rating, comment };
      const saved = await UI.busy(
        form.querySelector("[type=submit]"),
        state.myReview ? Api.reviews.update(state.myReview.id, payload) : Api.reviews.create(course.id, payload)
      );
      UI.toast(state.myReview ? "Your review was updated." : "Thanks for your review!");
      state.myReview = saved;
      state.editing = false;
      renderForm();
      load(true);
    } catch (err) {
      if (err.fields) UI.applyFieldErrors(form, err);
      else UI.toast(err.message, "error");
    }
  }

  function confirmDelete(id) {
    const mine = state.myReview && state.myReview.id === id;
    UI.modal({
      title: "Delete review?",
      body: `<p>${mine ? "Your review will be removed. You can write a new one later." : "This learner's review will be removed permanently."}</p>`,
      confirmText: "Delete",
      variant: "danger",
      onConfirm: async () => {
        try {
          await Api.reviews.remove(id);
        } catch (err) {
          UI.toast(err.message, "error");
          throw err;
        }
        if (mine) {
          state.myReview = null;
          state.editing = false;
          renderForm();
        }
        UI.toast("Review deleted.");
        load(true);
      },
    });
  }

  host.addEventListener("click", (e) => {
    if (e.target.closest("[data-edit-review]")) {
      state.editing = true;
      renderForm();
      formHost.querySelector("input[name=rating]:checked, input[name=rating]")?.focus();
    } else if (e.target.closest("[data-cancel-edit]")) {
      state.editing = false;
      renderForm();
    } else if (e.target.closest("[data-delete-review]")) {
      confirmDelete(e.target.closest("[data-delete-review]").dataset.deleteReview);
    } else if (e.target.closest("#reviews-more")) {
      state.page += 1;
      UI.busy(e.target.closest("#reviews-more"), load(false));
    }
  });
  host.addEventListener("submit", (e) => {
    if (e.target.id !== "review-form") return;
    e.preventDefault();
    submit(e.target);
  });

  renderForm();
  load(true);
});
