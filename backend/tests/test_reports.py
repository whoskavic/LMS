from app.enrollments.models import Certificate, Enrollment
from tests.helpers import auth, make_course, make_module, make_user


def enrolled(db, course, student, progress=0, status="active"):
    e = Enrollment(user_id=student.id, course_id=course.id, progress_pct=progress, status=status)
    db.add(e)
    db.commit()
    return e


def test_grades_and_batch_enroll_endpoints_removed(client, db):
    instructor = make_user(db, role="instructor")
    course = make_course(db, instructor)
    e = enrolled(db, course, make_user(db))
    headers = auth(instructor)
    assert client.get(f"/api/v1/courses/{course.id}/grades", headers=headers).status_code == 404
    assert client.put(f"/api/v1/courses/{course.id}/grades", json={"grades": []}, headers=headers).status_code == 404
    assert client.get(f"/api/v1/courses/{course.id}/candidates", headers=headers).status_code == 404
    res = client.post(f"/api/v1/courses/{course.id}/enrollments/batch", json={"studentIds": []}, headers=headers)
    assert res.status_code == 404
    assert client.delete(f"/api/v1/enrollments/{e.id}", headers=headers).status_code in (404, 405)


def test_course_students_read_only(client, db):
    instructor = make_user(db, role="instructor")
    other = make_user(db, role="instructor")
    admin = make_user(db, role="admin")
    course = make_course(db, instructor)
    make_module(db, course)
    done = enrolled(db, course, make_user(db, name="Done Learner"), progress=100, status="completed")
    enrolled(db, course, make_user(db, name="New Learner"), progress=0)
    db.add(Certificate(enrollment_id=done.id, code="LRN-COURSE-ABCDEFGH2345"))
    db.commit()
    res = client.get(f"/api/v1/courses/{course.id}/students", headers=auth(instructor))
    assert res.status_code == 200
    rows = {r["name"]: r for r in res.json()["items"]}
    assert rows["Done Learner"]["completed"] is True and rows["Done Learner"]["certificate"] is True
    assert rows["New Learner"]["progress"] == 0 and rows["New Learner"]["bestQuiz"] is None
    assert "grade" not in rows["New Learner"] and "nim" not in rows["New Learner"]
    assert client.get(f"/api/v1/courses/{course.id}/students", headers=auth(admin)).status_code == 200
    assert client.get(f"/api/v1/courses/{course.id}/students", headers=auth(other)).status_code == 403


def test_learner_stats_without_gpa(client, db):
    instructor = make_user(db, role="instructor")
    student = make_user(db)
    c1 = make_course(db, instructor, title="Course One")
    c2 = make_course(db, instructor, title="Course Two")
    done = enrolled(db, c1, student, progress=100, status="completed")
    enrolled(db, c2, student, progress=50)
    db.add(Certificate(enrollment_id=done.id, code="LRN-COURSE-QWERTYUP2345"))
    db.commit()
    stats = client.get("/api/v1/me/stats", headers=auth(student)).json()
    assert stats == {
        "role": "student",
        "courses": 2,
        "inProgress": 1,
        "completed": 1,
        "certificates": 1,
        "avgProgress": 75,
    }
    assert client.get("/api/v1/dashboard/student", headers=auth(student)).json()["certificates"] == 1


def test_verify_certificate(client, db):
    instructor = make_user(db, role="instructor")
    course = make_course(db, instructor, title="Web Programming")
    e = enrolled(db, course, make_user(db, name="Alex Mercer"), progress=100, status="completed")
    db.add(Certificate(enrollment_id=e.id, code="LRN-CS205-ABCDEFGH2345"))
    db.commit()
    res = client.get("/api/v1/certificates/lrn-cs205-abcdefgh2345")
    body = res.json()
    assert res.status_code == 200 and body["studentName"] == "Alex Mercer" and body["valid"] is True
    assert body["course"]["title"] == "Web Programming" and "grade" not in body
    assert client.get("/api/v1/certificates/LRN-NOPE").status_code == 404


def test_reports_summary_rows_and_csv(client, db):
    admin = make_user(db, role="admin")
    instructor = make_user(db, role="instructor")
    course = make_course(db, instructor, title="Web Programming")
    make_module(db, course)
    enrolled(db, course, make_user(db, name="Done Student"), progress=100, status="completed")
    enrolled(db, course, make_user(db, name="Slow Student"), progress=10)
    enrolled(db, course, make_user(db, name="Mid Student"), progress=50)
    summary = client.get("/api/v1/reports/summary", headers=auth(admin)).json()
    assert summary["enrollments"] == 3 and summary["completed"] == 1 and summary["atRisk"] == 1
    assert summary["completionRate"] == 33 and summary["avgProgress"] == 53
    assert summary["learners"] == 3 and summary["instructors"] == 1
    assert summary["popularCourses"][0] == {
        "courseId": str(course.id),
        "title": "Web Programming",
        "students": 3,
        "completed": 1,
    }
    rows = client.get("/api/v1/reports/enrollments", params={"status": "At risk"}, headers=auth(admin)).json()
    assert [r["name"] for r in rows["items"]] == ["Slow Student"]
    assert "grade" not in rows["items"][0] and "nim" not in rows["items"][0]
    csv = client.get("/api/v1/reports/enrollments.csv", headers=auth(admin))
    assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv")
    assert csv.text.splitlines()[0] == "Learner,Email,Course,Progress,Avg quiz,Status" and "Done Student" in csv.text
    assert client.get("/api/v1/reports/summary", headers=auth(instructor)).status_code == 403
    assert client.get("/api/v1/reports/enrollments.csv", headers=auth(instructor)).status_code == 403


def test_dashboards_and_activities(client, db):
    admin = make_user(db, role="admin")
    instructor = make_user(db, role="instructor")
    student = make_user(db)
    course = make_course(db, instructor, title="Web Programming")
    make_course(db, instructor, title="Mobile", status="pending")
    enrolled(db, course, student, progress=40)
    dash = client.get("/api/v1/dashboard/admin", headers=auth(admin)).json()
    assert dash["pending"] == 1 and dash["pendingCourses"][0]["title"] == "Mobile" and dash["students"] == 1
    assert "departments" not in dash
    mine = client.get("/api/v1/dashboard/instructor", headers=auth(instructor)).json()
    assert mine["courses"] == 2 and mine["byStatus"]["Pending"] == 1 and mine["students"] == 1
    assert client.get("/api/v1/dashboard/instructor", headers=auth(student)).status_code == 403
    me = client.get("/api/v1/dashboard/student", headers=auth(student)).json()
    assert me == {"courses": 1, "inProgress": 1, "completed": 0, "certificates": 0, "avgProgress": 40}
    acts = client.get("/api/v1/activities", headers=auth(admin)).json()
    assert any("Enrolled in Web Programming" in a["action"] for a in acts["items"])
    chart = client.get("/api/v1/meta/enrollment-chart", headers=auth(admin)).json()
    assert len(chart["labels"]) == 6 and sum(chart["enrollments"]) == 1
    assert client.get("/api/v1/meta/system-status", headers=auth(admin)).json()[0]["state"] == "Normal"
    assert client.get("/api/v1/activities", headers=auth(student)).status_code == 403
