// Learnova LMS — script bersama untuk semua halaman
// Isi: ikon SVG, auth guard, sidebar & menu, dropdown notifikasi, modal, toast, helper.

/* =========================================================================
   Ikon (outline, gaya Lucide) — dipakai lewat <i data-icon="nama"></i>
   ========================================================================= */
const ICONS = {
  "graduation-cap": '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  school: '<path d="M14 22v-4a2 2 0 1 0-4 0v4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M18 5v17"/><path d="m4 6 8-4 8 4"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  "square-plus": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  report: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  image: '<path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21"/><path d="m14 19.5 3-3 3 3"/><path d="M17 22v-5.5"/><circle cx="9" cy="9" r="2"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  "eye-off": '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  "check-circle": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  sort: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  "user-plus": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  quiz: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  "x-circle": '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  "chevron-up": '<path d="m18 15-6-6-6 6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  play: '<path d="M6 3v18l14-9z"/>',
  circle: '<circle cx="12" cy="12" r="10"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
};

function renderIcons(root = document) {
  root.querySelectorAll("i[data-icon]").forEach((el) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", ["icon", el.className].filter(Boolean).join(" "));
    svg.innerHTML = ICONS[el.dataset.icon] || "";
    el.replaceWith(svg);
  });
}

/* =========================================================================
   Helper
   ========================================================================= */
const Utils = {
  escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[ch]);
  },

  number(value) {
    return Number(value).toLocaleString("en-US");
  },

  average(values) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  },

  unique(values) {
    return [...new Set(values)].sort();
  },

  // Unduh array of objects sebagai file CSV
  downloadCSV(filename, rows) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(cell).join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  statusBadge(status) {
    const variant = {
      Active: "success", Completed: "success", Draft: "warning", Pending: "primary",
      Rejected: "danger", Archived: "neutral", Inactive: "neutral",
    }[status] || "neutral";
    return `<span class="badge badge--${variant}">${Utils.escape(status)}</span>`;
  },

  initials(name) {
    return name
      .replace(/^(Dr\.|Prof\.)\s*/i, "")
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  },

  // "2026-09-25T14:32" → "25 Sep 2026, 14:32"
  formatDate(iso, withTime = true) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return withTime ? `${day}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : day;
  },

  // Urutkan salinan array berdasarkan key (angka / teks), null selalu di akhir
  sortBy(list, key, dir = "asc") {
    const factor = dir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * factor;
    });
  },

  params() {
    return new URLSearchParams(location.search);
  },
};

/* =========================================================================
   Grafik (Chart.js) — warna mengikuti tema terang/gelap
   ========================================================================= */
const Charts = {
  items: [],

  palette() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    return {
      text: v("--color-text-secondary"),
      grid: v("--color-border"),
      surface: v("--color-surface"),
      primary: v("--color-primary"),
      success: v("--color-success"),
      warning: v("--color-warning"),
      series: [v("--color-primary"), v("--color-success"), v("--color-warning"), "#ec4899", "#0ea5e9", "#8b5cf6"],
    };
  },

  // build(palette) mengembalikan konfigurasi Chart.js; dibangun ulang saat tema berubah
  create(canvas, build) {
    if (!window.Chart) {
      canvas.parentElement.innerHTML = '<p class="chart-fallback">Chart library could not be loaded.</p>';
      return null;
    }
    const item = { canvas, build, chart: null };
    this.render(item);
    this.items.push(item);
    return item;
  },

  render(item) {
    const p = this.palette();
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = p.text;
    Chart.defaults.borderColor = p.grid;
    if (item.chart) item.chart.destroy();
    item.chart = new Chart(item.canvas, item.build(p));
  },

  refresh() {
    this.items.forEach((item) => this.render(item));
  },

  // Opsi umum grafik batang
  barOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, border: { display: false } },
      },
      ...extra,
    };
  },
};

document.addEventListener("themechange", () => Charts.refresh());

/* =========================================================================
   Toast & Modal
   ========================================================================= */
const UI = {
  toast(message, type = "success") {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.setAttribute("role", "status");
      stack.setAttribute("aria-live", "polite");
      document.body.append(stack);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `<i data-icon="${type === "error" ? "alert" : "check-circle"}"></i><span>${Utils.escape(message)}</span>`;
    renderIcons(toast);
    stack.append(toast);
    setTimeout(() => {
      toast.classList.add("is-leaving");
      toast.addEventListener("animationend", () => toast.remove());
    }, 3200);
  },

  /**
   * Tampilkan modal.
   * options: { title, body (HTML), confirmText, cancelText, variant: "primary"|"danger", size: "lg", onConfirm, onOpen }
   * - Tanpa onConfirm → modal informasi dengan satu tombol tutup.
   * - onConfirm(modalEl) mengembalikan false → modal tetap terbuka (mis. validasi form gagal).
   */
  modal({ title, body = "", confirmText = "Confirm", cancelText = "Cancel", variant = "primary", size = "", onConfirm, onOpen }) {
    const previousFocus = document.activeElement;
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal__backdrop" data-modal-close></div>
      <div class="modal__dialog ${size ? `modal__dialog--${size}` : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 class="modal__title" id="modal-title">${Utils.escape(title)}</h2>
        <div class="modal__body">${body}</div>
        <div class="modal__actions">
          <button class="btn btn--outline" type="button" data-modal-close>${onConfirm ? cancelText : "Close"}</button>
          ${onConfirm ? `<button class="btn btn--${variant}" type="button" data-modal-confirm>${Utils.escape(confirmText)}</button>` : ""}
        </div>
      </div>`;

    const close = () => {
      document.removeEventListener("keydown", onKey);
      modal.remove();
      document.body.classList.remove("modal-open");
      if (previousFocus) previousFocus.focus();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };

    modal.querySelectorAll("[data-modal-close]").forEach((el) => el.addEventListener("click", close));
    const confirmBtn = modal.querySelector("[data-modal-confirm]");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        if (onConfirm(modal) !== false) close();
      });
    }

    // Enter di dalam form modal = klik tombol konfirmasi
    modal.querySelector("form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      confirmBtn?.click();
    });

    document.addEventListener("keydown", onKey);
    document.body.append(modal);
    document.body.classList.add("modal-open");
    renderIcons(modal);
    if (onOpen) onOpen(modal);
    const firstField = modal.querySelector("input:not([type=hidden]), select, textarea");
    (firstField || confirmBtn || modal.querySelector("[data-modal-close].btn")).focus();
    return modal;
  },

  /**
   * Header tabel yang bisa diurutkan. <th data-sort="key"> → tombol dengan aria-sort.
   * state: { key, dir } dimutasi saat header diklik, lalu onChange() dipanggil untuk render ulang.
   */
  sortable(table, state, onChange) {
    const headers = table.querySelectorAll("th[data-sort]");
    const sync = () =>
      headers.forEach((th) => {
        const active = th.dataset.sort === state.key;
        th.setAttribute("aria-sort", active ? (state.dir === "asc" ? "ascending" : "descending") : "none");
      });

    headers.forEach((th) => {
      th.innerHTML = `<button class="sort-btn" type="button">${th.innerHTML}<i data-icon="sort" class="icon--sm"></i></button>`;
      th.querySelector("button").addEventListener("click", () => {
        state.dir = state.key === th.dataset.sort && state.dir === "asc" ? "desc" : "asc";
        state.key = th.dataset.sort;
        sync();
        onChange();
      });
    });
    renderIcons(table.querySelector("thead"));
    sync();
  },

  /**
   * Tombol pagination (Previous, nomor halaman, Next). Mengembalikan index awal data halaman aktif.
   * state.page dimutasi saat tombol diklik, lalu onChange() dipanggil.
   */
  pagination(nav, state, totalItems, pageSize, onChange) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
      (n) => n === 1 || n === totalPages || Math.abs(n - state.page) <= 1
    );
    const numbers = pages
      .map((n, i) => {
        const gap = i > 0 && n - pages[i - 1] > 1 ? '<span class="pagination__gap">…</span>' : "";
        const active = n === state.page;
        return `${gap}<button class="btn btn--outline ${active ? "is-active" : ""}" type="button" data-page="${n}" ${active ? 'aria-current="page"' : ""}>${n}</button>`;
      })
      .join("");

    nav.innerHTML = `
      <button class="btn btn--outline" type="button" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>Previous</button>
      ${numbers}
      <button class="btn btn--outline" type="button" data-page="${state.page + 1}" ${state.page === totalPages ? "disabled" : ""}>Next</button>`;

    if (!nav.dataset.bound) {
      nav.dataset.bound = "true";
      nav.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-page]");
        if (!btn || btn.disabled) return;
        state.page = Number(btn.dataset.page);
        onChange();
      });
    }
    return (state.page - 1) * pageSize;
  },

  // Ambil nilai form modal sebagai objek
  formValues(form) {
    return Object.fromEntries(
      [...form.elements]
        .filter((el) => el.name)
        .map((el) => [el.name, el.type === "checkbox" ? el.checked : el.value.trim()])
    );
  },

  // Tampilkan / hapus pesan error pada .field[data-field=name]
  fieldError(form, name, message) {
    const field = form.querySelector(`[data-field="${name}"]`);
    if (!field) return;
    field.classList.toggle("is-invalid", Boolean(message));
    const target = field.querySelector(".field__error span");
    if (target) target.textContent = message || "";
    field.querySelector("input, select, textarea")?.setAttribute("aria-invalid", String(Boolean(message)));
  },

  // Markup field standar (label, input, error)
  field({ name, label, type = "text", value = "", required = true, options, placeholder = "", hint = "", attrs = "" }) {
    const id = `f-${name}`;
    const control = options
      ? `<select class="field__input" id="${id}" name="${name}" ${attrs}>${options
          .map((o) => {
            const [val, text] = Array.isArray(o) ? o : [o, o];
            return `<option value="${Utils.escape(val)}" ${String(val) === String(value) ? "selected" : ""}>${Utils.escape(text)}</option>`;
          })
          .join("")}</select>`
      : type === "textarea"
        ? `<textarea class="field__input" id="${id}" name="${name}" placeholder="${Utils.escape(placeholder)}" ${attrs}>${Utils.escape(value)}</textarea>`
        : `<input class="field__input" id="${id}" name="${name}" type="${type}" value="${Utils.escape(value)}" placeholder="${Utils.escape(placeholder)}" ${attrs}>`;
    return `
      <div class="field" data-field="${name}">
        <label class="field__label" for="${id}">${Utils.escape(label)}${required ? ' <span class="required">*</span>' : ""}</label>
        ${control}
        ${hint ? `<p class="field__hint">${Utils.escape(hint)}</p>` : ""}
        <p class="field__error"><i data-icon="alert" class="icon--sm"></i><span></span></p>
      </div>`;
  },
};

/* =========================================================================
   Auth guard — <body data-role="admin lecturer"> : hanya role tersebut yang boleh masuk
   ========================================================================= */
const allowedRoles = (document.body.dataset.role || "").split(" ").filter(Boolean);
let session = Store.getSession();

// Sesi tidak berlaku lagi bila user dihapus / dinonaktifkan admin
if (session) {
  const user = DB.get("users", session.id);
  if (!user || user.status !== "Active") {
    Store.logout();
    session = null;
  }
}

if (allowedRoles.length) {
  if (!session) {
    location.replace("../index.html");
  } else if (!allowedRoles.includes(session.role)) {
    location.replace(homeFor(session.role));
  }
}

/* =========================================================================
   Layout: sidebar, menu aktif, info user, notifikasi, logout, search
   ========================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;

  // --- Sidebar (mobile) ---
  const openBtn = document.querySelector("[data-sidebar-open]");
  const setSidebar = (open) => {
    body.classList.toggle("sidebar-open", open);
    if (openBtn) openBtn.setAttribute("aria-expanded", String(open));
  };
  if (openBtn) openBtn.addEventListener("click", () => setSidebar(true));
  document.querySelectorAll("[data-sidebar-close]").forEach((el) => el.addEventListener("click", () => setSidebar(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setSidebar(false);
  });

  // --- Menu sesuai role & menu aktif ---
  if (session) {
    document.querySelectorAll(".nav [data-nav-role]").forEach((item) => {
      if (!item.dataset.navRole.split(" ").includes(session.role)) item.remove();
    });
    // Elemen konten khusus role tertentu (tombol, kolom tabel, filter)
    document.querySelectorAll("[data-show-role]").forEach((el) => {
      if (!el.dataset.showRole.split(" ").includes(session.role)) el.remove();
    });
  }

  // Halaman di luar menu (mis. detail course) menandai menu induknya lewat data-nav-active
  const current = body.dataset.navActive || location.pathname.split("/").pop() || "index.html";
  const links = document.querySelectorAll(".nav__link");
  const match = [...links].find((link) => link.getAttribute("href") === current);
  if (match) {
    links.forEach((link) => {
      link.classList.remove("is-active");
      link.removeAttribute("aria-current");
    });
    match.classList.add("is-active");
    match.setAttribute("aria-current", "page");
  }

  // --- Info user yang login ---
  if (session) {
    document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = session.name));
    document.querySelectorAll("[data-user-title]").forEach((el) => (el.textContent = session.title));
    document.querySelectorAll("[data-avatar]").forEach((el) => (el.textContent = Utils.initials(session.name)));

    const globalSearch = document.getElementById("global-search");
    const placeholders = { lecturer: "Search your courses...", student: "Search your courses..." };
    if (globalSearch && placeholders[session.role]) globalSearch.placeholder = placeholders[session.role];
  }

  // --- Tombol tema terang / gelap ---
  const syncThemeButtons = () =>
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      const dark = Theme.isDark();
      btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      btn.title = btn.getAttribute("aria-label");
      btn.innerHTML = `<i data-icon="${dark ? "sun" : "moon"}"></i>`;
      renderIcons(btn);
    });
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => btn.addEventListener("click", () => Theme.toggle()));
  document.addEventListener("themechange", syncThemeButtons);
  syncThemeButtons();

  // --- Tabel responsif: beri label kolom pada setiap sel (dipakai CSS di mobile) ---
  const labelTables = () => {
    document.querySelectorAll(".table--stack").forEach((table) => {
      const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
      table.querySelectorAll("tbody tr").forEach((row) => {
        [...row.children].forEach((cell, i) => {
          if (headers[i] && !cell.hasAttribute("colspan")) cell.dataset.label = headers[i];
        });
      });
    });
  };
  new MutationObserver(labelTables).observe(document.body, { childList: true, subtree: true });

  // --- Dropdown notifikasi ---
  const notifList = document.querySelector("[data-notifications]");
  if (notifList && session) {
    notifList.innerHTML = (SEED.notifications[session.role] || [])
      .map((n) => `<li class="notif"><p class="notif__text">${Utils.escape(n.text)}</p><p class="notif__time">${Utils.escape(n.time)}</p></li>`)
      .join("");
  }

  document.querySelectorAll("[data-dropdown-toggle]").forEach((toggle) => {
    const menu = toggle.nextElementSibling;
    const setOpen = (open) => {
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    };
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(menu.hidden);
      toggle.querySelector(".dot")?.remove();
    });
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  });

  // --- Logout dengan konfirmasi ---
  document.querySelectorAll("[data-logout]").forEach((btn) => {
    btn.addEventListener("click", () => {
      UI.modal({
        title: "Sign out?",
        body: "<p>You will need to sign in again to access the panel.</p>",
        confirmText: "Sign out",
        variant: "danger",
        onConfirm: () => {
          Store.logout();
          location.href = "../index.html";
        },
      });
    });
  });

  // --- Search global: Enter → cari di halaman Courses (kecuali halaman yang memfilter sendiri) ---
  const searchForm = document.querySelector(".topbar .search");
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (body.dataset.search === "local") return;
      const q = searchForm.querySelector("input").value.trim();
      const target = session?.role === "student" ? "student-dashboard.html" : "data-master.html";
      location.href = `${target}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    });
  }

  renderIcons();

  // --- Pesan dari halaman sebelumnya (mis. setelah simpan form) ---
  const flash = Store.takeFlash();
  if (flash) UI.toast(flash.message, flash.type);
});
