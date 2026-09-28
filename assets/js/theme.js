// Learnova LMS — tema terang/gelap
// Dimuat di <head> agar tema terpasang sebelum halaman digambar (tidak berkedip).
// Pilihan: "light" | "dark" | "system" (mengikuti pengaturan perangkat).

const Theme = {
  key: "learnova.theme",
  media: window.matchMedia("(prefers-color-scheme: dark)"),

  get() {
    try {
      return localStorage.getItem(this.key) || "system";
    } catch {
      return "system";
    }
  },

  isDark(pref = this.get()) {
    return pref === "dark" || (pref === "system" && this.media.matches);
  },

  apply(pref = this.get()) {
    document.documentElement.dataset.theme = this.isDark(pref) ? "dark" : "light";
    document.dispatchEvent(new CustomEvent("themechange"));
  },

  set(pref) {
    try {
      localStorage.setItem(this.key, pref);
    } catch {}
    this.apply(pref);
  },

  toggle() {
    this.set(this.isDark() ? "light" : "dark");
  },
};

Theme.apply();
Theme.media.addEventListener("change", () => Theme.get() === "system" && Theme.apply());
