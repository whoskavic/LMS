// Kontrak MockServer (assets/js/api/transport-local.js) — spesifikasi prototipe (arsip).
// Route nilai & batch enroll tidak lagi dipakai UI (ADR-009), jadi dipanggil langsung lewat Api.get/put/post/del.
// Script browser dimuat ke satu vm context (tanpa DOM, tanpa dependency). Jalankan: node --test
// Skenario berurutan: tiap langkah memakai state dari langkah sebelumnya.
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const ctx = vm.createContext({ console, setTimeout, clearTimeout, localStorage, crypto: globalThis.crypto, URL, URLSearchParams });
ctx.globalThis = ctx;
for (const f of ["data.js", "domain.js", "store.js", "api/client.js", "api/transport-http.js", "api/transport-local.js", "api/services.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/js", f), "utf8"), ctx, { filename: f });
}
const run = (code) => vm.runInContext(code, ctx);
const Api = run("Api");
const DB = run("DB");

const expectError = async (promise, status, code) => {
  try {
    await promise;
  } catch (e) {
    assert.equal(e.name, "ApiError", `expected ApiError, got ${e}`);
    assert.equal(e.status, status, `${code}: status ${e.status} ${e.code} ${e.message}`);
    if (code) assert.equal(e.code, code);
    return e;
  }
  assert.fail(`expected ${status} ${code ?? ""}`);
};

test("MockServer — kontrak API (skenario berurutan)", async (t) => {
  const step = (name) => t.diagnostic(name);

  step("seed: ID string berprefix, datetime ISO Z");
  const users = DB.all("users");
  assert.ok(users.every((u) => typeof u.id === "string"));
  assert.equal(users[0].id, "usr_1");
  assert.ok(DB.all("activities").every((a) => /Z$/.test(a.time)));
  assert.ok(DB.all("enrollments").every((e) => e.attempts.every((a) => /Z$/.test(a.date))));

  step("tanpa login → 401");
  await expectError(Api.auth.me(), 401, "UNAUTHENTICATED");

  step("login salah → 401, akun nonaktif → 403");
  await expectError(Api.auth.login("admin@learnova.ac.id", "nope"), 401, "INVALID_CREDENTIALS");
  await expectError(Api.auth.login("david@learnova.ac.id", "dosen123"), 403, "ACCOUNT_INACTIVE");
  await expectError(Api.auth.login("", ""), 400, "VALIDATION");

  step("login admin, me() tanpa password, session hanya token");
  const { user: admin } = await Api.auth.login("admin@learnova.ac.id", "admin123");
  const me = await Api.auth.me();
  assert.equal(me.role, "admin");
  assert.equal(me.password, undefined);
  assert.deepEqual(Object.keys(JSON.parse(store.get("learnova.session"))), ["token"]);

  step("users list: shape, filter, pagination, sort");
  const page = await Api.users.list({ role: "student", pageSize: 5, page: 2, sort: "-name" });
  assert.equal(page.items.length, 5);
  assert.equal(page.total, 24);
  assert.equal(page.page, 2);
  assert.ok(page.items.every((u) => u.role === "student" && u.password === undefined));
  const q = await Api.users.list({ q: "alex" });
  assert.ok(q.items.length >= 2);

  step("create user: validasi 400, unik 409, sukses UUID");
  const bad = await expectError(Api.users.create({ role: "student", name: "A", email: "x", idNumber: "1", department: "", password: "abc" }), 400, "VALIDATION");
  assert.ok(bad.fields.name && bad.fields.email && bad.fields.idNumber && bad.fields.department && bad.fields.password);
  const dup = await expectError(Api.users.create({ role: "student", name: "Nadia Dua", email: "alex@learnova.ac.id", idNumber: "40992", department: "Informatics", password: "secret123" }), 409, "CONFLICT");
  assert.ok(dup.fields.email && dup.fields.idNumber);
  const created = await Api.users.create({ role: "student", name: "Siti Rahmâ O'Neil", email: "siti.new@learnova.ac.id", idNumber: "49999", department: "Informatics", password: "secret123" });
  assert.match(created.id, /^[0-9a-f-]{36}$/);

  step("admin tidak bisa menonaktifkan/menghapus diri sendiri");
  await expectError(Api.users.setStatus(admin.id, "Inactive"), 400, "VALIDATION");
  await expectError(Api.users.remove(admin.id), 409, "CANNOT_DELETE_SELF");
  await expectError(Api.users.remove("usr_2"), 409, "LECTURER_HAS_COURSES");

  step("transitions: approve Pending, invalid state 409, admin tidak boleh submit");
  const pending = DB.all("courses").find((c) => c.status === "Pending");
  const approved = await Api.courses.transition(pending.id, "approve");
  assert.equal(approved.status, "Active");
  await expectError(Api.courses.transition(pending.id, "approve"), 409, "INVALID_TRANSITION");
  await expectError(Api.courses.transition(pending.id, "submit"), 403, "FORBIDDEN");
  await expectError(Api.courses.transition(pending.id, "fly"), 400, "VALIDATION");
  await Api.courses.transition(pending.id, "archive");
  const restored = await Api.courses.transition(pending.id, "restore");
  assert.equal(restored.status, "Active");

  step("admin tidak bisa membuat course / mengubah modul");
  await expectError(Api.courses.create({ title: "Admin course" }), 403, "FORBIDDEN");
  await expectError(Api.modules.create(pending.id, {}), 403, "FORBIDDEN");

  step("activities: terbaru dulu, ISO Z");
  const acts = await Api.activities.recent(3);
  assert.equal(acts.items.length, 3);
  assert.match(acts.items[0].action, /Restored course/);
  assert.ok(acts.items[0].time.endsWith("Z"));

  step("reports");
  const summary = await Api.reports.summary();
  assert.ok(summary.enrollments > 0 && summary.coursesByCategory.length);
  const rep = await Api.reports.enrollments({ status: "At risk", pageSize: 10 });
  assert.ok(rep.items.every((r) => r.status === "At risk"));

  step("logout → token dihapus → 401");
  await Api.auth.logout();
  assert.equal(store.get("learnova.session"), undefined);
  await expectError(Api.auth.me(), 401);

  step("dosen: list hanya miliknya, create Draft, submit tidak lengkap → 400, lengkapi → Pending");
  await Api.auth.login("budi@learnova.ac.id", "dosen123");
  const mine = await Api.courses.list();
  assert.ok(mine.items.every((c) => c.lecturerId === "usr_2"));
  const draft = await Api.courses.create({ title: "Cloud Computing" });
  assert.equal(draft.status, "Draft");
  assert.equal(draft.seatsLeft, 0);
  const incomplete = await expectError(Api.courses.transition(draft.id, "submit"), 400, "INCOMPLETE_COURSE");
  assert.ok(incomplete.fields.code && incomplete.fields.maxStudents);
  await expectError(Api.courses.update(draft.id, { code: "CS205" }), 409, "CONFLICT");
  const filled = await Api.courses.update(draft.id, {
    description: "Cloud fundamentals and deployment models.", category: "Technology", semester: "Fall 2026",
    duration: "12", startDate: "2026-11-02", code: "cs-410", maxStudents: 30,
  });
  assert.equal(filled.code, "CS-410");
  assert.equal(filled.duration, 12);
  const submitted = await Api.courses.transition(draft.id, "submit");
  assert.equal(submitted.status, "Pending");

  step("dosen: course orang lain → 403; delete Active → 409");
  await expectError(Api.courses.get("crs_1"), 403, "FORBIDDEN");
  await expectError(Api.courses.remove("crs_8"), 409, "COURSE_PUBLISHED");

  step("modul: create invalid 400, reorder harus permutasi lengkap");
  await expectError(Api.modules.create("crs_8", { title: "x", type: "Practice", minutes: 0, content: "short", tasks: [] }), 400, "VALIDATION");
  const mods = await Api.modules.list("crs_8");
  const ids = mods.items.map((m) => m.id);
  await expectError(Api.modules.reorder("crs_8", ids.slice(1)), 400, "VALIDATION");
  const reordered = await Api.modules.reorder("crs_8", [ids[1], ids[0], ...ids.slice(2)]);
  assert.equal(reordered.items[0].id, ids[1]);
  await Api.modules.reorder("crs_8", ids);

  step("quiz: lecturer melihat kunci & stats; validasi maxAttempts vs attempt terpakai");
  const quizzes = await Api.quizzes.list("crs_8");
  const quiz = quizzes.items[0];
  assert.equal(typeof quiz.questions[0].answer, "number");
  assert.ok(quiz.stats);
  const badQuiz = await expectError(Api.quizzes.create("crs_8", { title: "Q", questions: [{ text: "?", options: ["a", "a", "b", "c"], answer: 9 }] }), 400, "VALIDATION");
  assert.ok(badQuiz.fields.title && badQuiz.fields["questions.0"]);

  step("grades: invalid → 400 per enrollment, valid → grade huruf");
  const grades = await Api.get("/courses/crs_8/grades");
  const target = grades.items[0];
  const gErr = await expectError(Api.put("/courses/crs_8/grades", { grades: [{ enrollmentId: target.enrollmentId, finalScore: 101 }] }), 400, "VALIDATION");
  assert.ok(gErr.fields[target.enrollmentId]);
  const saved = await Api.put("/courses/crs_8/grades", { grades: [{ enrollmentId: target.enrollmentId, finalScore: 86 }] });
  assert.equal(saved.items.find((r) => r.enrollmentId === target.enrollmentId).grade, "A");

  step("batch enroll: path /enrollments/batch, kapasitas, kandidat tidak valid");
  const freeStudent = DB.all("users").find((u) => u.role === "student" && u.status === "Active" && !DB.all("enrollments").some((e) => e.studentId === u.id && e.courseId === "crs_8"));
  await expectError(Api.post("/courses/crs_8/enrollments/batch", { studentIds: [] }), 400, "VALIDATION");
  await expectError(Api.post("/courses/crs_8/enrollments/batch", { studentIds: ["usr_2"] }), 400, "VALIDATION");
  const batch = await Api.post("/courses/crs_8/enrollments/batch", { studentIds: [freeStudent.id] });
  assert.equal(batch.total, 1);
  await Api.del(`/enrollments/${batch.items[0].id}`);
  await Api.auth.logout();

  step("mahasiswa: kunci jawaban tidak terkirim; course tidak terlihat → 404; enroll; selesai modul");
  await Api.auth.login("alex@learnova.ac.id", "student123");
  const sq = await Api.quizzes.get(quiz.id);
  assert.ok(sq.questions.every((q) => !("answer" in q)));
  assert.ok(sq.mine && sq.stats === undefined);
  const sqList = await Api.quizzes.list("crs_8");
  assert.ok(sqList.items.every((qz) => qz.questions.every((q) => !("answer" in q))));
  await expectError(Api.courses.get(draft.id), 404, "NOT_FOUND");
  await expectError(Api.courses.list(), 403, "FORBIDDEN");
  const open = await Api.enrollments.open();
  assert.ok(open.items.every((c) => c.status === "Active" && c.enrollmentOpen));
  const mineEnr = await Api.enrollments.mine();
  assert.ok(mineEnr.items.length >= 8);
  const cs205 = mineEnr.items.find((e) => e.course.code === "CS205");
  const modsS = (await Api.modules.list("crs_8")).items;
  await expectError(Api.enrollments.completeModule(cs205.id, modsS[cs205.completedModules + 1].id), 409, "MODULE_LOCKED");
  const after = await Api.enrollments.completeModule(cs205.id, modsS[cs205.completedModules].id);
  assert.equal(after.completedModules, cs205.completedModules + 1);
  if (open.items[0]) {
    const enrolled = await Api.enrollments.enroll(open.items[0].id);
    assert.equal(enrolled.courseId, open.items[0].id);
    await expectError(Api.enrollments.enroll(open.items[0].id), 409, "ALREADY_ENROLLED");
  }

  step("Archived: modul read-only, enrollment baru ditutup");
  const his = mineEnr.items.find((e) => e.course.code === "HIS101");
  assert.equal(his.course.status, "Archived");
  const hisMods = (await Api.modules.list(his.courseId)).items;
  await expectError(Api.enrollments.completeModule(his.id, hisMods[0].id), 409, "COURSE_ARCHIVED");
  await expectError(Api.enrollments.enroll(his.courseId), 409, "COURSE_NOT_ACTIVE");

  step("profil: PATCH /me validasi unicode, stats, ganti password");
  await expectError(Api.profile.update({ name: "A1" }), 400, "VALIDATION");
  const renamed = await Api.profile.update({ name: "Alex Mércer", department: "Informatics" });
  assert.equal(renamed.name, "Alex Mércer");
  const stats = await Api.profile.stats();
  assert.equal(stats.role, "student");
  const pw = await expectError(Api.auth.changePassword("wrong", "newpass123"), 400, "VALIDATION");
  assert.ok(pw.fields.current);
  await Api.auth.changePassword("student123", "newpass123");
  await Api.auth.logout();
  await Api.auth.login("alex@learnova.ac.id", "newpass123");

  step("dosen dinonaktifkan saat login → 401 ACCOUNT_INACTIVE");
  const lecturerToken = (await Api.auth.login("adam@learnova.ac.id", "dosen123")).token;
  DB.update("users", "usr_3", { status: "Inactive" });
  await expectError(Api.auth.me(), 401, "ACCOUNT_INACTIVE");
  assert.equal(Api.session.token(), null);
  DB.update("users", "usr_3", { status: "Active" });

  step("mock=fail: request gagal kecuali /auth/*; mock=slow tetap berhasil");
  await Api.auth.login("admin@learnova.ac.id", "admin123");
  Api.config.mock = "fail";
  await expectError(Api.users.list(), 503, "MOCK_FAILURE");
  await Api.auth.me();
  Api.config.mock = "slow";
  Api.config.slowMs = 30;
  const t0 = Date.now();
  await Api.users.list({ pageSize: 1 });
  assert.ok(Date.now() - t0 >= 25);
  Api.config.mock = "off";

  step("storage penuh → 500 STORAGE_ERROR");
  const original = localStorage.setItem;
  localStorage.setItem = () => { throw new Error("QuotaExceeded"); };
  await expectError(Api.users.update("usr_14", { department: "Physics" }), 500, "STORAGE_ERROR");
  localStorage.setItem = original;

  step("route tidak dikenal → 404, method salah → 405");
  await expectError(Api.get("/nope"), 404, "NOT_FOUND");
  await expectError(Api.request("DELETE", "/auth/me"), 405, "METHOD_NOT_ALLOWED");

  step("dev reset");
  await Api.dev.reset();
  assert.equal(DB.get("users", "usr_13").name, "Alex Mercer");

  assert.ok(run("MockServer.routes.length") >= 40);
});
