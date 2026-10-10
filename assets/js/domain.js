// Learnova LMS — logika domain murni (tanpa DOM, tanpa localStorage, tanpa data)
// Dipakai oleh store.js (mock), MockServer, dan halaman. Bisa dites dengan `node --test`.
//
// Konvensi waktu:
// - datetime        : ISO 8601 UTC lengkap dengan "Z", mis. "2026-09-25T07:32:00.000Z"
// - tanggal kalender: "YYYY-MM-DD" (tanpa jam & zona), mis. startDate
// Konversi ke waktu lokal hanya dilakukan oleh formatDate / formatDateTime (layer tampilan).

const Domain = {
  /* ---------- Nilai ---------- */
  GRADE_SCALE: [
    { min: 85, grade: "A", point: 4.0 },
    { min: 80, grade: "A-", point: 3.7 },
    { min: 75, grade: "B+", point: 3.3 },
    { min: 70, grade: "B", point: 3.0 },
    { min: 65, grade: "B-", point: 2.7 },
    { min: 60, grade: "C+", point: 2.3 },
    { min: 55, grade: "C", point: 2.0 },
    { min: 45, grade: "D", point: 1.0 },
    { min: 0, grade: "E", point: 0 },
  ],

  // Nilai akhir 0–100 → huruf. null bila nilai kosong / tidak valid.
  gradeFromScore(score) {
    if (score === null || score === undefined || score === "" || !Number.isFinite(Number(score))) return null;
    const n = Number(score);
    if (n < 0 || n > 100) return null;
    return Domain.GRADE_SCALE.find((g) => n >= g.min).grade;
  },

  // Huruf → bobot (A = 4.0 … E = 0). null bila huruf tidak dikenal.
  gradePoint(grade) {
    return Domain.GRADE_SCALE.find((g) => g.grade === grade)?.point ?? null;
  },

  // IPK = rata-rata bobot dari daftar huruf; huruf kosong/tidak dikenal diabaikan. null bila tidak ada.
  gpa(grades) {
    const points = grades.map((g) => Domain.gradePoint(g)).filter((p) => p !== null);
    return points.length ? Domain.average(points) : null;
  },

  /* ---------- User ---------- */
  ROLE_LABELS: { admin: "Administrator", instructor: "Instructor", student: "Student" },

  roleLabel(role) {
    return Domain.ROLE_LABELS[role] || role;
  },

  // Keterangan singkat di bawah nama user (sidebar, profil)
  userTitle(user) {
    // NIM / departemen bisa kosong untuk akun dari registrasi publik
    if (user.role === "student") return user.idNumber ? `Student · NIM ${user.idNumber}` : "Student";
    if (user.role === "instructor") return user.department ? `Instructor · ${user.department}` : "Instructor";
    return "System administrator";
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
