// Unit test untuk assets/js/domain.js — jalankan dengan: node --test tests/
// Tanpa dependency: hanya node:test dan node:assert bawaan Node (versi 18+).

const test = require("node:test");
const assert = require("node:assert/strict");
const Domain = require("../assets/js/domain.js");

test("gradeFromScore memakai batas bawah setiap huruf", () => {
  const cases = [
    [100, "A"], [85, "A"], [84, "A-"], [80, "A-"], [79, "B+"], [75, "B+"], [70, "B"],
    [65, "B-"], [60, "C+"], [55, "C"], [54, "D"], [45, "D"], [44, "E"], [0, "E"],
  ];
  for (const [score, grade] of cases) assert.equal(Domain.gradeFromScore(score), grade, `score ${score}`);
});

test("gradeFromScore mengembalikan null untuk nilai kosong atau di luar 0–100", () => {
  for (const value of [null, undefined, "", "abc", -1, 101, NaN]) {
    assert.equal(Domain.gradeFromScore(value), null, `value ${value}`);
  }
  assert.equal(Domain.gradeFromScore("90"), "A");
});

test("gradePoint mengikuti skala FITUR.md §6", () => {
  assert.equal(Domain.gradePoint("A"), 4.0);
  assert.equal(Domain.gradePoint("B+"), 3.3);
  assert.equal(Domain.gradePoint("E"), 0);
  assert.equal(Domain.gradePoint("Z"), null);
  assert.equal(Domain.gradePoint(null), null);
});

test("gpa merata-rata bobot dan mengabaikan nilai kosong", () => {
  assert.equal(Domain.gpa(["A", "B"]), 3.5);
  assert.equal(Domain.gpa(["A", null, undefined, "B"]), 3.5);
  assert.equal(Domain.gpa(["E"]), 0);
  assert.equal(Domain.gpa([]), null);
  assert.equal(Domain.gpa([null]), null);
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
  assert.equal(Domain.roleLabel("lecturer"), "Lecturer");
  assert.equal(Domain.roleLabel("unknown"), "unknown");
  assert.equal(Domain.userTitle({ role: "student", idNumber: "40992" }), "Student · NIM 40992");
  assert.equal(Domain.userTitle({ role: "lecturer", department: "Informatics" }), "Lecturer · Informatics");
  assert.equal(Domain.userTitle({ role: "admin" }), "System administrator");
});