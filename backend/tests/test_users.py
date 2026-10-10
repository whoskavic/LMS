from app.courses.models import Course
from app.enrollments.models import Enrollment
from tests.helpers import auth, make_user

NEW_STUDENT = {
    "role": "student",
    "name": "Siti Rahma",
    "email": "siti@test.dev",
    "idNumber": "40139",
    "department": "Mathematics",
    "status": "Active",
    "password": "secret123",
}


def test_admin_crud_users(client, db):
    admin = make_user(db, role="admin")
    headers = auth(admin)
    res = client.post("/api/v1/users", json=NEW_STUDENT, headers=headers)
    assert res.status_code == 201, res.text
    created = res.json()
    assert created["courses"] == 0 and created["idNumber"] == "40139"

    res = client.get("/api/v1/users", params={"role": "student", "q": "siti"}, headers=headers).json()
    assert res["total"] == 1 and res["items"][0]["email"] == "siti@test.dev"

    res = client.patch(f"/api/v1/users/{created['id']}", json={"status": "Inactive"}, headers=headers)
    assert res.status_code == 200 and res.json()["status"] == "Inactive"
    res = client.post("/api/v1/auth/login", json={"email": "siti@test.dev", "password": "secret123"})
    assert res.status_code == 403

    assert client.delete(f"/api/v1/users/{created['id']}", headers=headers).status_code == 200
    assert client.get(f"/api/v1/users/{created['id']}", headers=headers).status_code == 404


def test_create_user_validation_and_uniqueness(client, db):
    admin = make_user(db, role="admin")
    headers = auth(admin)
    res = client.post("/api/v1/users", json={**NEW_STUDENT, "idNumber": "12"}, headers=headers)
    assert res.status_code == 400 and "idNumber" in res.json()["error"]["fields"]
    client.post("/api/v1/users", json=NEW_STUDENT, headers=headers)
    res = client.post("/api/v1/users", json=NEW_STUDENT, headers=headers)
    assert res.status_code == 409
    assert set(res.json()["error"]["fields"]) == {"email", "idNumber"}


def test_non_admin_cannot_manage_users(client, db):
    student = make_user(db)
    assert client.get("/api/v1/users", headers=auth(student)).status_code == 403
    assert client.post("/api/v1/users", json=NEW_STUDENT, headers=auth(student)).status_code == 403
    assert client.get("/api/v1/users").status_code == 401


def test_admin_cannot_deactivate_or_delete_self(client, db):
    admin = make_user(db, role="admin")
    res = client.patch(f"/api/v1/users/{admin.id}", json={"status": "Inactive"}, headers=auth(admin))
    assert res.status_code == 400 and "status" in res.json()["error"]["fields"]
    res = client.delete(f"/api/v1/users/{admin.id}", headers=auth(admin))
    assert res.status_code == 409 and res.json()["error"]["code"] == "CANNOT_DELETE_SELF"


def test_delete_user_with_courses_or_enrollments_conflicts(client, db):
    admin = make_user(db, role="admin")
    instructor = make_user(db, role="instructor")
    student = make_user(db)
    course = Course(instructor_id=instructor.id, title="Web Programming", slug="web-programming", status="active")
    db.add(course)
    db.flush()
    db.add(Enrollment(user_id=student.id, course_id=course.id))
    db.commit()
    res = client.delete(f"/api/v1/users/{instructor.id}", headers=auth(admin))
    assert res.status_code == 409 and res.json()["error"]["code"] == "USER_HAS_COURSES"
    res = client.delete(f"/api/v1/users/{student.id}", headers=auth(admin))
    assert res.status_code == 409 and res.json()["error"]["code"] == "USER_HAS_ENROLLMENTS"
    rows = client.get("/api/v1/users", params={"role": "instructor"}, headers=auth(admin)).json()["items"]
    assert rows[0]["courses"] == 1


def test_departments_meta(client, db):
    admin = make_user(db, role="admin", department="Ops")
    make_user(db, department="Design")
    assert client.get("/api/v1/meta/departments", params={"role": "student"}, headers=auth(admin)).json() == ["Design"]
    student = make_user(db)
    assert client.get("/api/v1/meta/departments", headers=auth(student)).status_code == 403


def test_seed_creates_demo_accounts(client, db):
    from app.seed import seed

    seed(db)
    res = client.post("/api/v1/auth/login", json={"email": "admin@learnova.ac.id", "password": "admin123"})
    assert res.status_code == 200 and res.json()["user"]["role"] == "admin"
    catalog = client.get("/api/v1/catalog/courses", params={"pageSize": 50}).json()
    assert catalog["total"] == 9  # course Active dari mock data
    admin = client.get(
        "/api/v1/courses", params={"status": "Pending"}, headers={"Authorization": f"Bearer {res.json()['token']}"}
    )
    assert [c["code"] for c in admin.json()["items"]] == ["MOB301"]


def test_notifications_for_admin_list_pending_courses(client, db):
    admin = make_user(db, role="admin")
    instructor = make_user(db, role="instructor")
    db.add(
        Course(
            instructor_id=instructor.id,
            title="Mobile Programming",
            slug="mobile",
            status="pending",
            code="MOB301",
        )
    )
    db.commit()
    items = client.get("/api/v1/meta/notifications", headers=auth(admin)).json()
    assert items[0]["text"] == "MOB301 Mobile Programming is waiting for approval"
    assert client.get("/api/v1/meta/notifications", headers=auth(instructor)).json()[0]["time"] == "Pending"
    assert client.get("/api/v1/meta/notifications").status_code == 401
