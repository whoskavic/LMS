"""Model akun platform publik (ADR-008): learner → instructor, instructor boleh belajar."""

from app.enrollments.models import Enrollment
from tests.helpers import auth, make_course, make_module, make_user


def test_become_instructor_and_idempotent(client, db):
    student = make_user(db)
    res = client.post(
        "/api/v1/me/become-instructor", json={"headline": "Web developer", "bio": "Hi"}, headers=auth(student)
    )
    assert res.status_code == 200 and res.json()["role"] == "instructor"
    again = client.post("/api/v1/me/become-instructor", headers=auth(student))
    assert again.status_code == 200 and again.json()["role"] == "instructor"
    # sekarang boleh membuat course
    res = client.post("/api/v1/courses", json={"title": "My first course"}, headers=auth(student))
    assert res.status_code == 201


def test_become_instructor_rejects_admin_and_anonymous(client, db):
    admin = make_user(db, role="admin")
    res = client.post("/api/v1/me/become-instructor", headers=auth(admin))
    assert res.status_code == 403
    assert client.post("/api/v1/me/become-instructor").status_code == 401


def test_instructor_can_learn_in_other_instructors_course(client, db):
    owner = make_user(db, role="instructor")
    learner = make_user(db, role="instructor")
    course = make_course(db, owner, code="CS205")
    module = make_module(db, course)
    quiz_body = {
        "title": "Quick quiz",
        "questions": [{"text": "Pick A", "options": ["A", "B", "C", "D"], "answer": 0}],
    }
    quiz = client.post(f"/api/v1/courses/{course.id}/quizzes", json=quiz_body, headers=auth(owner)).json()

    # muncul di daftar course terbuka untuk instructor lain, bukan untuk pemiliknya
    assert client.get("/api/v1/courses", params={"open": True}, headers=auth(learner)).json()["total"] == 1
    assert client.get("/api/v1/courses", params={"open": True}, headers=auth(owner)).json()["total"] == 0

    enrollment = client.post(f"/api/v1/courses/{course.id}/enrollments", headers=auth(learner))
    assert enrollment.status_code == 201, enrollment.text
    eid = enrollment.json()["id"]
    res = client.post(
        f"/api/v1/enrollments/{eid}/completed-modules", json={"moduleId": str(module.id)}, headers=auth(learner)
    )
    assert res.json()["progress"] == 100
    assert client.get("/api/v1/me/enrollments", headers=auth(learner)).json()["total"] == 1

    # learner instructor tidak menerima kunci jawaban
    listed = client.get(f"/api/v1/courses/{course.id}/quizzes", headers=auth(learner)).json()["items"][0]
    assert "questions" not in listed and "mine" in listed
    attempt = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(learner)).json()
    assert "correctOptionId" not in str(attempt)
    # pemilik tetap melihat kunci
    owner_view = client.get(f"/api/v1/quizzes/{quiz['id']}", headers=auth(owner)).json()
    assert owner_view["questions"][0]["answer"] == 0

    stats = client.get("/api/v1/me/stats", headers=auth(learner)).json()
    assert stats["role"] == "instructor" and stats["courses"] == 1 and stats["coursesTaught"] == 0
    assert client.get("/api/v1/dashboard/student", headers=auth(learner)).json()["completed"] == 1


def test_instructor_cannot_enroll_in_own_course(client, db):
    owner = make_user(db, role="instructor")
    course = make_course(db, owner)
    res = client.post(f"/api/v1/courses/{course.id}/enrollments", headers=auth(owner))
    assert res.status_code == 409 and res.json()["error"]["code"] == "OWN_COURSE"
    assert db.query(Enrollment).count() == 0
