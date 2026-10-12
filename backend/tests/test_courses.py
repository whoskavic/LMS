from app.courses.models import CourseStatusLog
from app.enrollments.models import Enrollment
from tests.helpers import FULL_COURSE, auth, make_category, make_course, make_module, make_user


def test_instructor_creates_draft_and_submits_admin_approves(client, db):
    make_category(db)
    instructor = make_user(db, role="instructor")
    admin = make_user(db, role="admin")
    res = client.post("/api/v1/courses", json={"title": "Draft only title"}, headers=auth(instructor))
    assert res.status_code == 201, res.text
    draft = res.json()
    assert draft["status"] == "Draft" and draft["price"] == 0 and "code" not in draft and "semester" not in draft

    # Draft belum lengkap tidak bisa diajukan
    res = client.post(f"/api/v1/courses/{draft['id']}/transitions", json={"action": "submit"}, headers=auth(instructor))
    assert res.status_code == 400 and res.json()["error"]["code"] == "INCOMPLETE_COURSE"

    res = client.patch(f"/api/v1/courses/{draft['id']}", json=FULL_COURSE, headers=auth(instructor))
    assert res.status_code == 200, res.text
    assert res.json()["category"] == "Technology" and res.json()["totalMinutes"] == 0

    res = client.post(f"/api/v1/courses/{draft['id']}/transitions", json={"action": "submit"}, headers=auth(instructor))
    assert res.json()["status"] == "Pending" and res.json()["submittedAt"]

    # Instructor tidak boleh approve; reject tanpa alasan ditolak
    res = client.post(
        f"/api/v1/courses/{draft['id']}/transitions", json={"action": "approve"}, headers=auth(instructor)
    )
    assert res.status_code == 403
    res = client.post(f"/api/v1/courses/{draft['id']}/transitions", json={"action": "reject"}, headers=auth(admin))
    assert res.status_code == 400 and "reason" in res.json()["error"]["fields"]

    res = client.post(f"/api/v1/courses/{draft['id']}/transitions", json={"action": "approve"}, headers=auth(admin))
    assert res.json()["status"] == "Active" and res.json()["publishedAt"]

    logs = client.get(f"/api/v1/courses/{draft['id']}/status-logs", headers=auth(admin)).json()
    assert [(log["fromStatus"], log["toStatus"]) for log in logs] == [
        (None, "Draft"),
        ("Draft", "Pending"),
        ("Pending", "Active"),
    ]


def test_reject_stores_note_and_resubmit(client, db):
    make_category(db)
    instructor = make_user(db, role="instructor")
    admin = make_user(db, role="admin")
    course = client.post("/api/v1/courses", json=FULL_COURSE, headers=auth(instructor)).json()
    client.post(f"/api/v1/courses/{course['id']}/transitions", json={"action": "submit"}, headers=auth(instructor))
    res = client.post(
        f"/api/v1/courses/{course['id']}/transitions",
        json={"action": "reject", "reason": "Add syllabus"},
        headers=auth(admin),
    )
    assert res.json()["status"] == "Rejected" and res.json()["rejectionReason"] == "Add syllabus"
    assert db.query(CourseStatusLog).filter_by(to_status="rejected").one().note == "Add syllabus"
    res = client.post(f"/api/v1/courses/{course['id']}/transitions", json={"action": "archive"}, headers=auth(admin))
    assert res.status_code == 409 and res.json()["error"]["code"] == "INVALID_TRANSITION"


def test_course_validation_and_academic_fields_ignored(client, db):
    make_category(db)
    instructor = make_user(db, role="instructor")
    res = client.post(
        "/api/v1/courses", json={**FULL_COURSE, "category": "Nope", "description": "short"}, headers=auth(instructor)
    )
    assert res.status_code == 400 and {"category", "description"} <= set(res.json()["error"]["fields"])
    # field akademik lama diabaikan (ADR-009): tidak divalidasi, tidak disimpan
    res = client.post(
        "/api/v1/courses",
        json={**FULL_COURSE, "code": "bad", "startDate": "2000-01-01", "maxStudents": 1, "semester": "Fall 2026"},
        headers=auth(instructor),
    )
    assert res.status_code == 201
    body = res.json()
    assert not {"code", "startDate", "maxStudents", "semester", "seatsLeft", "enrollmentOpen"} & set(body)


def test_only_owner_can_edit_and_students_cannot_create(client, db):
    owner = make_user(db, role="instructor")
    other = make_user(db, role="instructor")
    student = make_user(db)
    course = make_course(db, owner, status="draft")
    assert (
        client.patch(f"/api/v1/courses/{course.id}", json={"title": "Hijacked title"}, headers=auth(other)).status_code
        == 403
    )
    assert client.post("/api/v1/courses", json={"title": "Student course"}, headers=auth(student)).status_code == 403
    assert client.post("/api/v1/courses", json={"title": "No auth course"}).status_code == 401


def test_list_courses_scoped_by_role(client, db):
    admin = make_user(db, role="admin")
    budi = make_user(db, role="instructor")
    adam = make_user(db, role="instructor")
    student = make_user(db)
    make_course(db, budi, title="Web Programming", code="CS205")
    make_course(db, adam, title="Linear Algebra", code="MATH201")
    closed = make_course(db, adam, title="Closed Course", code="ENG104", enrollment_open=False)
    assert client.get("/api/v1/courses", headers=auth(admin)).json()["total"] == 3
    mine = client.get("/api/v1/courses", headers=auth(budi)).json()
    assert [c["title"] for c in mine["items"]] == ["Web Programming"]
    assert client.get("/api/v1/courses", headers=auth(student)).status_code == 403
    open_ = client.get("/api/v1/courses", params={"open": "true"}, headers=auth(student)).json()
    # course Active selalu terbuka (enrollment_open lama diabaikan — ADR-009)
    assert {c["title"] for c in open_["items"]} == {"Web Programming", "Linear Algebra", "Closed Course"}
    db.add(Enrollment(user_id=student.id, course_id=closed.id))
    db.commit()
    res = client.get("/api/v1/courses", params={"q": "algebra"}, headers=auth(admin)).json()
    assert res["total"] == 1 and res["items"][0]["instructorName"] == adam.name


def test_delete_rules(client, db):
    admin = make_user(db, role="admin")
    owner = make_user(db, role="instructor")
    student = make_user(db)
    draft = make_course(db, owner, status="draft", title="Draft course")
    active = make_course(db, owner, status="active", title="Active course")
    db.add(Enrollment(user_id=student.id, course_id=active.id))
    db.commit()
    res = client.delete(f"/api/v1/courses/{active.id}", headers=auth(admin))
    assert res.status_code == 409 and res.json()["error"]["code"] == "COURSE_NOT_DELETABLE"
    assert client.delete(f"/api/v1/courses/{draft.id}", headers=auth(student)).status_code == 403
    assert client.delete(f"/api/v1/courses/{draft.id}", headers=auth(owner)).status_code == 200


def test_course_detail_access(client, db):
    owner = make_user(db, role="instructor")
    other = make_user(db, role="instructor")
    student = make_user(db)
    draft = make_course(db, owner, status="draft", title="Secret draft")
    assert client.get(f"/api/v1/courses/{draft.id}", headers=auth(owner)).status_code == 200
    assert client.get(f"/api/v1/courses/{draft.id}", headers=auth(other)).status_code == 403
    assert client.get(f"/api/v1/courses/{draft.id}", headers=auth(student)).status_code == 404
    assert client.get("/api/v1/courses/not-a-uuid", headers=auth(owner)).status_code == 404


def test_modules_crud_and_reorder(client, db):
    owner = make_user(db, role="instructor")
    other = make_user(db, role="instructor")
    course = make_course(db, owner)
    body = {
        "title": "HTML Semantics",
        "type": "Lecture",
        "minutes": 15,
        "content": "Lesson content " * 3,
        "tasks": [],
        "videoUrl": "https://www.youtube.com/embed/abc",
    }
    first = client.post(f"/api/v1/courses/{course.id}/modules", json=body, headers=auth(owner)).json()
    assert first["order"] == 1 and first["videoUrl"].startswith("https://")
    res = client.post(
        f"/api/v1/courses/{course.id}/modules",
        json={**body, "title": "CSS Practice", "type": "Practice"},
        headers=auth(owner),
    )
    assert res.status_code == 400 and "tasks" in res.json()["error"]["fields"]
    second = client.post(
        f"/api/v1/courses/{course.id}/modules",
        json={**body, "title": "CSS Practice", "type": "Practice", "tasks": ["Do it"]},
        headers=auth(owner),
    ).json()
    assert client.post(f"/api/v1/courses/{course.id}/modules", json=body, headers=auth(other)).status_code == 403

    res = client.put(
        f"/api/v1/courses/{course.id}/modules/order",
        json={"ids": [second["id"], first["id"]]},
        headers=auth(owner),
    )
    assert [m["title"] for m in res.json()["items"]] == ["CSS Practice", "HTML Semantics"]
    res = client.patch(f"/api/v1/modules/{first['id']}", json={"minutes": 20}, headers=auth(owner))
    assert res.json()["minutes"] == 20
    assert client.delete(f"/api/v1/modules/{second['id']}", headers=auth(other)).status_code == 403
    assert client.delete(f"/api/v1/modules/{second['id']}", headers=auth(owner)).status_code == 200
    items = client.get(f"/api/v1/courses/{course.id}/modules", headers=auth(owner)).json()["items"]
    assert [(m["title"], m["order"]) for m in items] == [("HTML Semantics", 1)]


def test_course_stats(client, db):
    owner = make_user(db, role="instructor")
    student = make_user(db)
    course = make_course(db, owner)
    make_module(db, course)
    db.add(Enrollment(user_id=student.id, course_id=course.id, progress_pct=100))
    db.commit()
    stats = client.get(f"/api/v1/courses/{course.id}/stats", headers=auth(owner)).json()
    assert stats["students"] == 1 and stats["completed"] == 1 and stats["modules"] == 1
    assert stats["progressDistribution"][4] == {"range": "100%", "students": 1}
    assert client.get(f"/api/v1/courses/{course.id}/stats", headers=auth(student)).status_code == 403


def test_public_catalog_search_filter_and_pagination(client, db):
    tech = make_category(db, "Technology")
    science = make_category(db, "Science")
    owner = make_user(db, role="instructor")
    make_course(
        db,
        owner,
        title="Web Programming",
        code="CS205",
        category=tech,
        description="Client-side development with JavaScript.",
    )
    make_course(
        db,
        owner,
        title="Cellular Biology",
        code="BIO210",
        category=science,
        description="Structure and function of cells.",
    )
    make_course(db, owner, title="Pending JavaScript", code="MOB301", category=tech, status="pending")
    for i in range(3):
        make_course(db, owner, title=f"Extra Course {i}", code=f"EXT10{i}", category=science)

    res = client.get("/api/v1/catalog/courses", params={"q": "JAVASCRIPT"}).json()
    assert [c["title"] for c in res["items"]] == ["Web Programming"]  # pending tidak tampil
    res = client.get("/api/v1/catalog/courses", params={"category": "Science", "pageSize": 2, "page": 2}).json()
    assert res["total"] == 4 and res["page"] == 2 and len(res["items"]) == 2
    res = client.get("/api/v1/catalog/courses", params={"q": "cells"}).json()
    assert res["items"][0]["title"] == "Cellular Biology"


def test_public_catalog_detail(client, db):
    owner = make_user(db, role="instructor")
    course = make_course(db, owner, title="Web Programming", code="CS205")
    make_module(db, course, title="Intro lesson")
    pending = make_course(db, owner, title="Hidden", code="MOB301", status="pending")
    detail = client.get(f"/api/v1/catalog/courses/{course.slug}").json()
    assert detail["outline"][0]["title"] == "Intro lesson" and "content" not in detail["outline"][0]
    assert client.get(f"/api/v1/catalog/courses/{course.id}").status_code == 200
    assert client.get(f"/api/v1/catalog/courses/{pending.id}").status_code == 404


def test_categories_admin_only(client, db):
    admin = make_user(db, role="admin")
    instructor = make_user(db, role="instructor")
    res = client.post("/api/v1/categories", json={"name": "Design"}, headers=auth(admin))
    assert res.status_code == 201 and res.json()["slug"] == "design"
    assert client.post("/api/v1/categories", json={"name": "design"}, headers=auth(admin)).status_code == 400
    assert client.post("/api/v1/categories", json={"name": "Art"}, headers=auth(instructor)).status_code == 403
    cid = res.json()["id"]
    assert client.patch(f"/api/v1/categories/{cid}", json={"name": "UX Design"}, headers=auth(admin)).status_code == 200
    assert client.get("/api/v1/categories").json()[0]["name"] == "UX Design"
    assert client.get("/api/v1/meta/categories").json() == ["UX Design"]
    assert client.delete(f"/api/v1/categories/{cid}", headers=auth(admin)).status_code == 200


def test_catalog_sorts_by_popularity_by_default(client, db):
    owner = make_user(db, role="instructor")
    quiet = make_course(db, owner, title="Aaa Quiet Course")
    busy = make_course(db, owner, title="Zzz Busy Course")
    for _ in range(2):
        db.add(Enrollment(user_id=make_user(db).id, course_id=busy.id))
    db.add(Enrollment(user_id=make_user(db).id, course_id=quiet.id))
    db.commit()
    titles = [c["title"] for c in client.get("/api/v1/catalog/courses").json()["items"]]
    assert titles == ["Zzz Busy Course", "Aaa Quiet Course"]
    titles = [c["title"] for c in client.get("/api/v1/catalog/courses", params={"sort": "title"}).json()["items"]]
    assert titles == ["Aaa Quiet Course", "Zzz Busy Course"]


def test_catalog_detail_viewer_status(client, db):
    owner = make_user(db, role="instructor")
    learner = make_user(db)
    admin = make_user(db, role="admin")
    course = make_course(db, owner, title="Landing Course")
    make_module(db, course)
    url = f"/api/v1/catalog/courses/{course.slug}"
    assert client.get(url).json()["viewer"] == {
        "loggedIn": False,
        "role": None,
        "isOwner": False,
        "enrolled": False,
        "canEnroll": False,
    }
    assert client.get(url, headers=auth(owner)).json()["viewer"]["isOwner"] is True
    assert client.get(url, headers=auth(admin)).json()["viewer"]["canEnroll"] is False
    assert client.get(url, headers=auth(learner)).json()["viewer"]["canEnroll"] is True
    client.post(f"/api/v1/courses/{course.id}/enrollments", headers=auth(learner))
    viewer = client.get(url, headers=auth(learner)).json()["viewer"]
    assert viewer["enrolled"] is True and viewer["nextModuleNumber"] == 1 and viewer["progress"] == 0
    detail = client.get(url).json()
    assert detail["totalMinutes"] == 10 and detail["outline"][0]["minutes"] == 10
