from app.enrollments.models import Certificate, Enrollment
from tests.helpers import auth, make_course, make_module, make_user


def setup_course(db, **extra):
    instructor = make_user(db, role="instructor")
    course = make_course(db, instructor, code="CS205", **extra)
    modules = [make_module(db, course, title=f"Lesson {i}", position=i) for i in (1, 2)]
    return instructor, course, modules


def test_student_enrolls_and_lists_courses(client, db):
    _, course, _ = setup_course(db)
    student = make_user(db)
    res = client.post(f"/api/v1/courses/{course.id}/enrollments", headers=auth(student))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["progress"] == 0 and body["totalModules"] == 2 and body["learningStatus"] == "Active"
    res = client.post(f"/api/v1/courses/{course.id}/enrollments", headers=auth(student))
    assert res.status_code == 409 and res.json()["error"]["code"] == "ALREADY_ENROLLED"
    mine = client.get("/api/v1/me/enrollments", headers=auth(student)).json()
    assert mine["total"] == 1 and mine["items"][0]["course"]["code"] == "CS205"
    # course yang sudah diikuti tidak muncul lagi di daftar "open"
    assert client.get("/api/v1/courses", params={"open": True}, headers=auth(student)).json()["total"] == 0


def test_enroll_rules(client, db):
    instructor = make_user(db, role="instructor")
    student = make_user(db)
    pending = make_course(db, instructor, status="pending", title="Pending course")
    closed = make_course(db, instructor, title="Closed course", enrollment_open=False)
    full = make_course(db, instructor, title="Full course", max_students=1)
    db.add(Enrollment(user_id=make_user(db).id, course_id=full.id))
    db.commit()
    codes = [
        client.post(f"/api/v1/courses/{c.id}/enrollments", headers=auth(student)).json()["error"]["code"]
        for c in (pending, closed, full)
    ]
    assert codes == ["COURSE_NOT_ACTIVE", "ENROLLMENT_CLOSED", "COURSE_FULL"]
    res = client.post(f"/api/v1/courses/{closed.id}/enrollments", headers=auth(instructor))
    assert res.status_code == 409 and res.json()["error"]["code"] == "OWN_COURSE"
    assert (
        client.post(f"/api/v1/courses/{closed.id}/enrollments", headers=auth(make_user(db, role="admin"))).status_code
        == 403
    )
    assert client.post(f"/api/v1/courses/{closed.id}/enrollments").status_code == 401


def test_complete_modules_in_order_until_completed_with_certificate(client, db):
    _, course, modules = setup_course(db)
    student = make_user(db)
    enrollment = client.post(f"/api/v1/courses/{course.id}/enrollments", headers=auth(student)).json()
    url = f"/api/v1/enrollments/{enrollment['id']}/completed-modules"
    res = client.post(url, json={"moduleId": str(modules[1].id)}, headers=auth(student))
    assert res.status_code == 409 and res.json()["error"]["code"] == "MODULE_LOCKED"
    res = client.post(url, json={"moduleId": str(modules[0].id)}, headers=auth(student)).json()
    assert res["progress"] == 50 and res["completedModuleIds"] == [str(modules[0].id)]
    # idempoten
    assert client.post(url, json={"moduleId": str(modules[0].id)}, headers=auth(student)).json()["progress"] == 50
    res = client.post(url, json={"moduleId": str(modules[1].id)}, headers=auth(student)).json()
    assert res["progress"] == 100 and res["learningStatus"] == "Completed" and res["completedAt"]
    assert res["certificate"]["number"].startswith("LRN-CS205-")
    assert db.query(Certificate).count() == 1
    row = db.query(Enrollment).one()
    db.refresh(row)
    assert row.status == "completed" and float(row.progress_pct) == 100


def test_complete_module_authorization_and_archived(client, db):
    _, course, modules = setup_course(db)
    student = make_user(db)
    other = make_user(db)
    enrollment = client.post(f"/api/v1/courses/{course.id}/enrollments", headers=auth(student)).json()
    url = f"/api/v1/enrollments/{enrollment['id']}/completed-modules"
    assert client.post(url, json={"moduleId": str(modules[0].id)}, headers=auth(other)).status_code == 404
    res = client.post(url, json={"moduleId": "nope"}, headers=auth(student))
    assert res.status_code == 400
    course.status = "archived"
    db.commit()
    res = client.post(url, json={"moduleId": str(modules[0].id)}, headers=auth(student))
    assert res.status_code == 409 and res.json()["error"]["code"] == "COURSE_ARCHIVED"


def test_course_enrollment_endpoint_and_student_can_read_modules(client, db):
    _, course, _ = setup_course(db, enrollment_open=False)
    student = make_user(db)
    assert client.get(f"/api/v1/courses/{course.id}/enrollment", headers=auth(student)).status_code == 404
    assert client.get(f"/api/v1/courses/{course.id}/modules", headers=auth(student)).status_code == 404
    db.add(Enrollment(user_id=student.id, course_id=course.id))
    db.commit()
    res = client.get(f"/api/v1/courses/{course.id}/enrollment", headers=auth(student)).json()
    assert res["completedModuleIds"] == []
    assert client.get(f"/api/v1/courses/{course.id}/modules", headers=auth(student)).json()["total"] == 2


def test_adding_module_lowers_progress(client, db):
    instructor, course, modules = setup_course(db)
    student = make_user(db)
    enrollment = client.post(f"/api/v1/courses/{course.id}/enrollments", headers=auth(student)).json()
    url = f"/api/v1/enrollments/{enrollment['id']}/completed-modules"
    client.post(url, json={"moduleId": str(modules[0].id)}, headers=auth(student))
    body = {"title": "Lesson three", "type": "Lecture", "minutes": 5, "content": "Some content for lesson three."}
    client.post(f"/api/v1/courses/{course.id}/modules", json=body, headers=auth(instructor))
    mine = client.get("/api/v1/me/enrollments", headers=auth(student)).json()["items"][0]
    assert mine["progress"] == 33 and mine["totalModules"] == 3
