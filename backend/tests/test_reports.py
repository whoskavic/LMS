from app.enrollments.models import Certificate, Enrollment
from tests.helpers import auth, make_course, make_module, make_user


def enrolled(db, course, student, progress=0, final=None, grade=None, status="active"):
    e = Enrollment(
        user_id=student.id,
        course_id=course.id,
        progress_pct=progress,
        final_score=final,
        grade_letter=grade,
        status=status,
    )
    db.add(e)
    db.commit()
    return e


def test_grades_save_and_gpa(client, db):
    instructor = make_user(db, role="instructor")
    other = make_user(db, role="instructor")
    student = make_user(db)
    c1 = make_course(db, instructor, title="Course One", code="AAA101")
    c2 = make_course(db, instructor, title="Course Two", code="BBB101")
    e1, e2 = enrolled(db, c1, student), enrolled(db, c2, student)
    res = client.put(
        f"/api/v1/courses/{c1.id}/grades",
        json={"grades": [{"enrollmentId": str(e1.id), "finalScore": 93}]},
        headers=auth(instructor),
    )
    assert res.status_code == 200 and res.json()["items"][0]["grade"] == "A"
    client.put(
        f"/api/v1/courses/{c2.id}/grades",
        json={"grades": [{"enrollmentId": str(e2.id), "finalScore": 78}]},
        headers=auth(instructor),
    )
    stats = client.get("/api/v1/me/stats", headers=auth(student)).json()
    assert abs(stats["gpa"] - (4.0 + 3.3) / 2) < 1e-9  # A (4.0) + B+ (3.3)
    bad = client.put(
        f"/api/v1/courses/{c1.id}/grades",
        json={"grades": [{"enrollmentId": str(e1.id), "finalScore": 101}]},
        headers=auth(instructor),
    )
    assert bad.status_code == 400
    assert (
        client.put(
            f"/api/v1/courses/{c1.id}/grades",
            json={"grades": [{"enrollmentId": str(e1.id), "finalScore": 50}]},
            headers=auth(other),
        ).status_code
        == 403
    )
    rows = client.get(f"/api/v1/courses/{c1.id}/grades", headers=auth(instructor)).json()
    assert rows["items"][0]["finalScore"] == 93
    assert client.get(f"/api/v1/courses/{c1.id}/grades", headers=auth(student)).status_code == 403


def test_batch_enroll_candidates_and_remove(client, db):
    instructor = make_user(db, role="instructor")
    course = make_course(db, instructor, code="CS205", enrollment_open=False, max_students=2)
    s1, s2, s3 = make_user(db), make_user(db), make_user(db)
    candidates = client.get(f"/api/v1/courses/{course.id}/candidates", headers=auth(instructor)).json()
    assert {c["id"] for c in candidates} == {str(s1.id), str(s2.id), str(s3.id)}
    res = client.post(
        f"/api/v1/courses/{course.id}/enrollments/batch",
        json={"studentIds": [str(s1.id), str(s2.id), str(s3.id)]},
        headers=auth(instructor),
    )
    assert res.status_code == 409 and res.json()["error"]["code"] == "COURSE_FULL"
    res = client.post(
        f"/api/v1/courses/{course.id}/enrollments/batch", json={"studentIds": [str(s1.id)]}, headers=auth(instructor)
    )
    assert res.status_code == 201 and res.json()["total"] == 1
    enrollment_id = res.json()["items"][0]["id"]
    assert client.delete(f"/api/v1/enrollments/{enrollment_id}", headers=auth(s1)).status_code == 403
    assert client.delete(f"/api/v1/enrollments/{enrollment_id}", headers=auth(instructor)).status_code == 200


def test_cannot_remove_certified_enrollment_and_verify_certificate(client, db):
    instructor = make_user(db, role="instructor")
    course = make_course(db, instructor, code="CS205")
    student = make_user(db, name="Alex Mercer")
    e = enrolled(db, course, student, progress=100, status="completed")
    db.add(Certificate(enrollment_id=e.id, code="LRN-CS205-ABCDEFGH2345"))
    db.commit()
    res = client.delete(f"/api/v1/enrollments/{e.id}", headers=auth(instructor))
    assert res.status_code == 409 and res.json()["error"]["code"] == "ENROLLMENT_CERTIFIED"
    res = client.get("/api/v1/certificates/lrn-cs205-abcdefgh2345")
    assert res.status_code == 200 and res.json()["studentName"] == "Alex Mercer" and res.json()["valid"] is True
    assert client.get("/api/v1/certificates/LRN-NOPE").status_code == 404


def test_reports_summary_rows_and_csv(client, db):
    admin = make_user(db, role="admin")
    instructor = make_user(db, role="instructor")
    course = make_course(db, instructor, code="CS205")
    make_module(db, course)
    enrolled(db, course, make_user(db, name="Done Student"), progress=100, final=90, grade="A", status="completed")
    enrolled(db, course, make_user(db, name="Slow Student"), progress=10)
    enrolled(db, course, make_user(db, name="Mid Student"), progress=50)
    summary = client.get("/api/v1/reports/summary", headers=auth(admin)).json()
    assert summary["enrollments"] == 3 and summary["completed"] == 1 and summary["atRisk"] == 1
    assert summary["completionRate"] == 33 and summary["avgProgress"] == 53
    rows = client.get("/api/v1/reports/enrollments", params={"status": "At risk"}, headers=auth(admin)).json()
    assert [r["name"] for r in rows["items"]] == ["Slow Student"]
    csv = client.get("/api/v1/reports/enrollments.csv", headers=auth(admin))
    assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv")
    assert csv.text.splitlines()[0].startswith("Student,NIM,Course") and "Done Student" in csv.text
    assert client.get("/api/v1/reports/summary", headers=auth(instructor)).status_code == 403
    assert client.get("/api/v1/reports/enrollments.csv", headers=auth(instructor)).status_code == 403


def test_dashboards_and_activities(client, db):
    admin = make_user(db, role="admin")
    instructor = make_user(db, role="instructor")
    student = make_user(db)
    course = make_course(db, instructor, code="CS205")
    make_course(db, instructor, code="MOB301", title="Mobile", status="pending")
    enrolled(db, course, student, progress=40)
    dash = client.get("/api/v1/dashboard/admin", headers=auth(admin)).json()
    assert dash["pending"] == 1 and dash["pendingCourses"][0]["code"] == "MOB301" and dash["students"] == 1
    mine = client.get("/api/v1/dashboard/instructor", headers=auth(instructor)).json()
    assert mine["courses"] == 2 and mine["byStatus"]["Pending"] == 1 and mine["students"] == 1
    assert client.get("/api/v1/dashboard/instructor", headers=auth(student)).status_code == 403
    me = client.get("/api/v1/dashboard/student", headers=auth(student)).json()
    assert me == {"courses": 1, "completed": 0, "avgProgress": 40, "gpa": None}
    acts = client.get("/api/v1/activities", headers=auth(admin)).json()
    assert any("Enrolled in CS205" in a["action"] for a in acts["items"])
    chart = client.get("/api/v1/meta/enrollment-chart", headers=auth(admin)).json()
    assert len(chart["labels"]) == 6 and sum(chart["enrollments"]) == 1
    assert client.get("/api/v1/meta/system-status", headers=auth(admin)).json()[0]["state"] == "Normal"
    assert client.get("/api/v1/activities", headers=auth(student)).status_code == 403
