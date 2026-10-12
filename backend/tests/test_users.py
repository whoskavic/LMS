from app.courses.models import Course
from app.enrollments.models import Enrollment
from app.users.models import User
from tests.helpers import auth, make_user

NEW_STUDENT = {
    "role": "student",
    "name": "Siti Rahma",
    "email": "siti@test.dev",
    "status": "Active",
    "password": "secret123",
}


def test_admin_crud_users(client, db):
    admin = make_user(db, role="admin")
    headers = auth(admin)
    res = client.post("/api/v1/users", json=NEW_STUDENT, headers=headers)
    assert res.status_code == 201, res.text
    created = res.json()
    assert created["courses"] == 0 and "idNumber" not in created and "department" not in created

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
    res = client.post("/api/v1/users", json={**NEW_STUDENT, "email": "not-an-email"}, headers=headers)
    assert res.status_code == 400 and "email" in res.json()["error"]["fields"]
    client.post("/api/v1/users", json=NEW_STUDENT, headers=headers)
    res = client.post("/api/v1/users", json=NEW_STUDENT, headers=headers)
    assert res.status_code == 409
    assert set(res.json()["error"]["fields"]) == {"email"}


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


def test_departments_meta_removed(client, db):
    admin = make_user(db, role="admin")
    assert client.get("/api/v1/meta/departments", headers=auth(admin)).status_code == 404


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
    assert [c["title"] for c in admin.json()["items"]] == ["Mobile Programming"]
    # aturan submit: course demo Pending/Active selalu punya modul
    from sqlalchemy import func, select

    from app.courses.models import Module

    empty = db.scalars(
        select(Course.title)
        .outerjoin(Module, Module.course_id == Course.id)
        .where(Course.status.in_(("pending", "active")))
        .group_by(Course.id)
        .having(func.count(Module.id) == 0)
    ).all()
    assert empty == []


def test_seed_extras_fill_existing_data_idempotently(client, db):
    from sqlalchemy import func, select

    from app.reviews.models import Review
    from app.seed import DEMO_REVIEWS, seed, seed_extras

    seed(db)
    assert db.scalar(select(func.count()).select_from(Review)) == len(DEMO_REVIEWS)
    # simulasikan database lama (sebelum PR E): tanpa ulasan dan profil instructor
    db.query(Review).delete()
    budi = db.scalar(select(User).where(User.email == "budi@learnova.ac.id"))
    budi.headline = budi.bio = None
    db.commit()
    assert seed_extras(db) == len(DEMO_REVIEWS) + 1
    assert seed_extras(db) == 0  # idempoten
    assert budi.headline
    profile = client.get(f"/api/v1/instructors/{budi.id}").json()
    assert profile["stats"]["courses"] > 0 and profile["bio"]


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
    assert items[0]["text"] == "Mobile Programming is waiting for approval"
    assert client.get("/api/v1/meta/notifications", headers=auth(instructor)).json()[0]["time"] == "Pending"
    assert client.get("/api/v1/meta/notifications").status_code == 401
