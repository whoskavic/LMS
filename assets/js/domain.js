// Learnova LMS — logika domain murni (tanpa DOM, tanpa localStorage, tanpa data)
// Skala nilai & IPK dihapus (ADR-009); salinannya untuk mock lama ada di store.js (LegacyGrades).
// Dipakai oleh store.js (mock), MockServer, dan halaman. Bisa dites dengan `node --test`.
//
// Konvensi waktu:
// - datetime        : ISO 8601 UTC lengkap dengan "Z", mis. "2026-09-25T07:32:00.000Z"
// - tanggal kalender: "YYYY-MM-DD" (tanpa jam & zona), mis. startDate
// Konversi ke waktu lokal hanya dilakukan oleh formatDate / formatDateTime (layer tampilan).

const Domain = {
  /* ---------- User ---------- */
  ROLE_LABELS: { admin: "Administrator", instructor: "Instructor", student: "Learner" },

  roleLabel(role) {
    return Domain.ROLE_LABELS[role] || role;
  },

  // Keterangan singkat di bawah nama user (sidebar, profil)
  userTitle(user) {
    if (user.role === "student") return "Learner";
    if (user.role === "instructor") return "Instructor · Learner";
    return "Platform administrator";
  },

  /* ---------- Angka ---------- */
  average(values) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  },

  // Persentase progress (bulat 0–100) dari modul selesai / total modul
  progressPercent(done, total) {
    if (!total) return 0;
    return Math.round((Math.min(Math.max(done, 0), total) / total) * 100);
  },

  // Total durasi course dari jumlah menit modul: 200 → "3 hr 20 min", 45 → "45 min", 0 → "0 min"
  formatDuration(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return `${m} min`;
    return m ? `${h} hr ${m} min` : `${h} hr`;
  },

  // "12 modules · 3 hr 20 min"
  courseLength(modules, minutes) {
    return `${modules} module${modules === 1 ? "" : "s"} · ${Domain.formatDuration(minutes)}`;
  },

  /* ---------- Sertifikat ---------- */
  // Nomor sertifikat dari kode course + ID enrollment (ID opaque: diambil 8 karakter alfanumerik terakhir)
  certificateNumber(courseCode, enrollmentId) {
    const code = String(courseCode || "COURSE").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const suffix = String(enrollmentId).replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase().padStart(5, "0");
    return `LRN-${code}-${suffix}`;
  },

  /* ---------- Tanggal & waktu ---------- */
  isCalendarDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  },

  // Waktu sekarang dalam format datetime standar (ISO UTC)
  nowIso() {
    return new Date().toISOString();
  },

  // Tanggal kalender lokal hari ini ("YYYY-MM-DD")
  todayLocal(now = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  },

  // Tambah n hari ke tanggal kalender, hasil tetap "YYYY-MM-DD" (aman dari zona waktu)
  addDays(date, days) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  },

  // Ubah nilai menjadi objek Date untuk ditampilkan. Tanggal kalender dibaca sebagai tanggal lokal.
  toDate(value) {
    if (value instanceof Date) return value;
    if (Domain.isCalendarDate(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date(value);
  },

  // "2026-09-25T07:32:00.000Z" → "25 Sep 2026" (tanggal lokal). Nilai tidak valid dikembalikan apa adanya.
  formatDate(value) {
    if (value === null || value === undefined || value === "") return "";
    const date = Domain.toDate(value);
    if (Number.isNaN(date.getTime())) return value ?? "";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  },

  // "2026-09-25T07:32:00.000Z" → "25 Sep 2026, 14:32" (waktu lokal, mis. WIB)
  formatDateTime(value) {
    if (value === null || value === undefined || value === "") return "";
    const date = Domain.toDate(value);
    if (Number.isNaN(date.getTime())) return value ?? "";
    const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${Domain.formatDate(date)}, ${time}`;
  },
};

if (typeof module !== "undefined") module.exports = Domain;
