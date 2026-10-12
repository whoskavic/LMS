// Unit test untuk assets/js/domain.js — jalankan dengan: node --test tests/
// Tanpa dependency: hanya node:test dan node:assert bawaan Node (versi 18+).

const test = require("node:test");
const assert = require("node:assert/strict");
const Domain = require("../assets/js/domain.js");

test("formatDuration menampilkan jam & menit dari total menit modul", () => {
  assert.equal(Domain.formatDuration(200), "3 hr 20 min");
  assert.equal(Domain.formatDuration(45), "45 min");
  assert.equal(Domain.formatDuration(120), "2 hr");
  assert.equal(Domain.formatDuration(0), "0 min");
  assert.equal(Domain.formatDuration(null), "0 min");
});

test("courseLength menggabungkan jumlah modul & durasi", () => {
  assert.equal(Domain.courseLength(12, 200), "12 modules · 3 hr 20 min");
  assert.equal(Domain.courseLength(1, 15), "1 module · 15 min");
});

test("skala nilai & IPK tidak lagi ada di Domain (ADR-009)", () => {
  assert.equal(Domain.gpa, undefined);
  assert.equal(Domain.gradeFromScore, undefined);
});

test("average mengembalikan 0 untuk daftar kosong", () => {
  assert.equal(Domain.average([]), 0);
  assert.equal(Domain.average([2, 4, 6, 8]), 5);
});

test("progressPercent dibulatkan dan dibatasi 0–100", () => {
  assert.equal(Domain.progressPercent(13, 20), 65);
  assert.equal(Domain.progressPercent(1, 3), 33);
  assert.equal(Domain.progressPercent(25, 20), 100);
  assert.equal(Domain.progressPercent(-2, 20), 0);
  assert.equal(Domain.progressPercent(5, 0), 0);
});

test("certificateNumber memakai kode course dan akhiran ID opaque", () => {
  assert.equal(Domain.certificateNumber("CS205", "12"), "LRN-CS205-00012");
  assert.equal(Domain.certificateNumber("DES-405", "enr_7"), "LRN-DES405-0ENR7");
  assert.equal(
    Domain.certificateNumber("CS101", "3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f"),
    "LRN-CS101-3C4D5E6F"
  );
});

test("todayLocal memakai tanggal lokal, bukan UTC", () => {
  const lateNight = new Date(2026, 9, 10, 23, 30); // 10 Okt 2026 23:30 waktu lokal
  const earlyMorning = new Date(2026, 9, 10, 0, 15); // 10 Okt 2026 00:15 waktu lokal
  assert.equal(Domain.todayLocal(lateNight), "2026-10-10");
  assert.equal(Domain.todayLocal(earlyMorning), "2026-10-10");
});

test("addDays bekerja pada tanggal kalender lintas bulan & tahun", () => {
  assert.equal(Domain.addDays("2026-09-01", 98), "2026-12-08");
  assert.equal(Domain.addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(Domain.addDays("2028-02-28", 1), "2028-02-29");
});

test("formatDate membaca tanggal kalender sebagai tanggal lokal (tidak mundur sehari)", () => {
  assert.match(Domain.formatDate("2026-09-01"), /^1 Sept? 2026$/);
  assert.match(Domain.formatDate("2026-12-31"), /^31 Dec 2026$/);
});

test("formatDateTime mengonversi ISO UTC ke waktu lokal", () => {
  const iso = "2026-09-25T07:32:00.000Z";
  const local = new Date(iso);
  const hh = String(local.getHours()).padStart(2, "0");
  const mm = String(local.getMinutes()).padStart(2, "0");
  assert.ok(Domain.formatDateTime(iso).endsWith(`, ${hh}:${mm}`));
  assert.equal(Domain.formatDateTime(iso).split(", ")[0], Domain.formatDate(local));
});

test("formatDate & formatDateTime mengembalikan nilai asli bila tidak valid", () => {
  assert.equal(Domain.formatDate("bukan tanggal"), "bukan tanggal");
  assert.equal(Domain.formatDateTime(""), "");
  assert.equal(Domain.formatDate(null), "");
});

test("roleLabel & userTitle untuk tampilan user", () => {
  assert.equal(Domain.roleLabel("instructor"), "Instructor");
  assert.equal(Domain.roleLabel("unknown"), "unknown");
  assert.equal(Domain.roleLabel("student"), "Learner");
  assert.equal(Domain.userTitle({ role: "student" }), "Learner");
  assert.equal(Domain.userTitle({ role: "instructor" }), "Instructor · Learner");
  assert.equal(Domain.userTitle({ role: "admin" }), "Platform administrator");
});
test("catalogLinks: tautan tetap di shell aktif (publik vs aplikasi)", () => {
  const pub = Domain.catalogLinks("public");
  const app = Domain.catalogLinks("app");
  assert.equal(pub.list(), "catalog.html");
  assert.equal(app.list({ q: "web dev", category: "", page: 2 }), "browse.html?q=web+dev&page=2");
  assert.equal(pub.course("web-programming"), "catalog.html?course=web-programming");
  assert.equal(app.course("web-programming"), "browse.html?course=web-programming");
  assert.equal(pub.instructor("u-1"), "instructor.html?id=u-1");
  assert.equal(app.instructor("u-1"), "browse.html?instructor=u-1");
  assert.equal(pub.learn("c-1", 3), "pages/course.html?id=c-1&m=3");
  assert.equal(app.learn("c-1"), "course.html?id=c-1");
  assert.equal(pub.manage("c-1"), "pages/course-detail.html?id=c-1");
  assert.equal(app.manage("c-1"), "course-detail.html?id=c-1");
  // guest yang menekan Enroll kembali ke landing page di shell aplikasi setelah login
  assert.equal(pub.login("web-programming"), "index.html?next=pages%2Fbrowse.html%3Fcourse%3Dweb-programming");
  assert.ok(Domain.isSafeNext(decodeURIComponent(pub.login("web-programming").split("next=")[1])));
});

test("isSafeNext hanya menerima halaman internal", () => {
  ["pages/browse.html?course=web", "pages/student-dashboard.html", "catalog.html?q=x", "instructor.html?id=1"].forEach((v) =>
    assert.equal(Domain.isSafeNext(v), true, v)
  );
  ["https://evil.example", "//evil.example", "pages/../index.html", "javascript:alert(1)", "pages/browse.html#x", "", null].forEach((v) =>
    assert.equal(Domain.isSafeNext(v), false, String(v))
  );
});

test("appCatalogUrl memetakan halaman publik ke pages/browse.html", () => {
  assert.equal(Domain.appCatalogUrl("catalog.html", ""), "pages/browse.html");
  assert.equal(Domain.appCatalogUrl("catalog.html", "?course=web-programming"), "pages/browse.html?course=web-programming");
  assert.equal(Domain.appCatalogUrl("catalog.html", "?q=data&sort=rating"), "pages/browse.html?q=data&sort=rating");
  assert.equal(Domain.appCatalogUrl("instructor.html", "?id=abc"), "pages/browse.html?instructor=abc");
  assert.equal(Domain.appCatalogUrl("instructor.html", ""), "pages/browse.html");
});
