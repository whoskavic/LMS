"""Ulasan course dan profil publik instructor (PR E)."""

from tests.helpers import auth, make_course, make_user

API = "/api/v1"


def _enroll(client, user, course):
    res = client.post(f"{API}/courses/{course.id}/enrollments", headers=auth(user))
    assert res.status_code == 201, res.text
    return res.json()


def test_review_lifecycle_and_rules(client, db):
    owner = make_user(db, role="instructor")
    alice, bob, stranger = make_user(db), make_user(db), make_user(db)
    admin = make_user(db, role="admin")
    course = make_course(db, owner)
    _enroll(client, alice, course)
    _enroll(client, bob, course)
    url = f"{API}/courses/{course.id}/reviews"

    assert client.post(url, json={"rating": 5}).status_code == 401
    assert client.post(url, json={"rating": 5}, headers=auth(stranger)).json()["error"]["code"] == "NOT_ENROLLED"
    assert client.post(url, json={"rating": 5}, headers=auth(owner)).status_code == 403
    bad = client.post(url, json={"rating": 6, "comment": "x" * 1001}, headers=auth(alice))
    assert bad.status_code == 400 and set(bad.json()["error"]["fields"]) == {"rating", "comment"}

    first = client.post(url, json={"rating": 5, "comment": " Great course "}, headers=auth(alice))
    assert first.status_code == 201 and first.json()["comment"] == "Great course"
    dup = client.post(url, json={"rating": 4}, headers=auth(alice))
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "ALREADY_REVIEWED"
    second = client.post(url, json={"rating": 2}, headers=auth(bob)).json()

    listed = client.get(url).json()  # publik
    assert listed["total"] == 2 and listed["items"][0]["id"] == second["id"]  # terbaru dulu
    assert listed["summary"]["average"] == 3.5 and listed["summary"]["count"] == 2
    assert listed["summary"]["distribution"][0] == {"stars": 5, "count": 1}

    # agregat di katalog dan landing page
    card = client.get(f"{API}/catalog/courses").json()["items"][0]
    assert card["ratingAverage"] == 3.5 and card["reviewCount"] == 2
    detail = client.get(f"{API}/catalog/courses/{course.id}", headers=auth(alice)).json()
    assert detail["viewer"]["canReview"] is False and detail["viewer"]["myReview"]["rating"] == 5
    detail = client.get(f"{API}/catalog/courses/{course.id}", headers=auth(owner)).json()
    assert "canReview" not in detail["viewer"]

    # edit hanya penulis; hapus penulis atau admin
    rid = first.json()["id"]
    assert client.patch(f"{API}/reviews/{rid}", json={"rating": 4}, headers=auth(bob)).status_code == 403
    edited = client.patch(f"{API}/reviews/{rid}", json={"rating": 4, "comment": ""}, headers=auth(alice))
    assert edited.status_code == 200 and edited.json()["rating"] == 4 and edited.json()["comment"] == ""
    assert client.delete(f"{API}/reviews/{rid}", headers=auth(bob)).status_code == 403
    assert client.delete(f"{API}/reviews/{second['id']}", headers=auth(admin)).status_code == 200
    assert client.delete(f"{API}/reviews/{rid}", headers=auth(alice)).status_code == 200
    assert client.get(url).json()["summary"] == {
        "average": None,
        "count": 0,
        "distribution": [{"stars": s, "count": 0} for s in (5, 4, 3, 2, 1)],
    }


def test_catalog_sort_by_rating(client, db):
    owner = make_user(db, role="instructor")
    learner = make_user(db)
    low = make_course(db, owner, title="Alpha course")
    high = make_course(db, owner, title="Beta course")
    make_course(db, owner, title="Gamma course")  # tanpa ulasan → paling akhir
    for course, rating in ((low, 2), (high, 5)):
        _enroll(client, learner, course)
        client.post(f"{API}/courses/{course.id}/reviews", json={"rating": rating}, headers=auth(learner))
    titles = [c["title"] for c in client.get(f"{API}/catalog/courses", params={"sort": "rating"}).json()["items"]]
    assert titles == ["Beta course", "Alpha course", "Gamma course"]


def test_reviews_of_inactive_course_are_hidden(client, db):
    owner = make_user(db, role="instructor")
    course = make_course(db, owner, status="draft")
    assert client.get(f"{API}/courses/{course.id}/reviews").status_code == 404


def test_instructor_profile_headline_bio_and_public_page(client, db):
    user = make_user(db, name="Rina Hartono")
    res = client.post(
        f"{API}/me/become-instructor", json={"headline": "Frontend engineer", "bio": "I teach CSS."}, headers=auth(user)
    )
    assert res.json()["headline"] == "Frontend engineer" and res.json()["bio"] == "I teach CSS."
    too_long = client.patch(f"{API}/me", json={"headline": "x" * 121}, headers=auth(user))
    assert too_long.status_code == 400 and "headline" in too_long.json()["error"]["fields"]
    res = client.patch(f"{API}/me", json={"bio": "Updated bio"}, headers=auth(user))
    assert res.json()["bio"] == "Updated bio" and res.json()["headline"] == "Frontend engineer"

    learner = make_user(db)
    course = make_course(db, user)
    make_course(db, user, title="Draft course", status="draft")  # tidak tampil di profil publik
    _enroll(client, learner, course)
    client.post(f"{API}/courses/{course.id}/reviews", json={"rating": 4}, headers=auth(learner))

    profile = client.get(f"{API}/instructors/{user.id}").json()
    assert profile["name"] == "Rina Hartono" and profile["headline"] == "Frontend engineer"
    assert profile["stats"] == {"courses": 1, "learners": 1, "reviews": 1, "rating": 4.0}
    assert [c["title"] for c in profile["courses"]] == ["Web Programming"]
    assert client.get(f"{API}/catalog/courses/{course.id}").json()["instructorHeadline"] == "Frontend engineer"

    # student / admin / id asal → 404
    assert client.get(f"{API}/instructors/{learner.id}").status_code == 404
    assert client.get(f"{API}/instructors/not-a-uuid").status_code == 404


def test_student_profile_update_ignores_instructor_fields(client, db):
    student = make_user(db)
    res = client.patch(f"{API}/me", json={"name": "New Name", "headline": "Hacker"}, headers=auth(student))
    assert res.status_code == 200 and res.json()["headline"] is None
