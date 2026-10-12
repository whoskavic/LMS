import uuid
from datetime import timedelta

from app.enrollments.models import Enrollment
from app.quizzes.models import QuizAttempt
from tests.helpers import auth, make_course, make_user

QUIZ = {
    "title": "CS205 Quiz 1",
    "passingScore": 60,
    "maxAttempts": 2,
    "timeLimit": 10,
    "questions": [
        {"text": "Main navigation element?", "options": ["<nav>", "<section>", "<div>", "<aside>"], "answer": 0},
        {"text": "Single row layout?", "options": ["Grid", "Flexbox", "Float", "Table"], "answer": 1},
    ],
}


def setup(client, db, quiz=QUIZ):
    instructor = make_user(db, role="instructor")
    course = make_course(db, instructor, code="CS205")
    student = make_user(db)
    db.add(Enrollment(user_id=student.id, course_id=course.id))
    db.commit()
    res = client.post(f"/api/v1/courses/{course.id}/quizzes", json=quiz, headers=auth(instructor))
    assert res.status_code == 201, res.text
    return instructor, course, student, res.json()


def answer_map(attempt, picks):
    """picks: daftar index opsi per soal → {questionId: optionId}"""
    return {q["id"]: q["options"][i]["id"] for q, i in zip(attempt["questions"], picks, strict=True)}


def test_instructor_creates_quiz_with_answer_keys(client, db):
    instructor, course, student, quiz = setup(client, db)
    assert quiz["questions"][1]["answer"] == 1 and quiz["stats"]["attempts"] == 0
    listed = client.get(f"/api/v1/courses/{course.id}/quizzes", headers=auth(instructor)).json()
    assert listed["items"][0]["questionCount"] == 2


def test_student_never_receives_answer_keys_before_submit(client, db):
    _, course, student, quiz = setup(client, db)
    listed = client.get(f"/api/v1/courses/{course.id}/quizzes", headers=auth(student)).json()["items"][0]
    assert "questions" not in listed and listed["mine"] == {
        "attempts": 0,
        "bestScore": None,
        "inProgressAttemptId": None,
    }
    detail = client.get(f"/api/v1/quizzes/{quiz['id']}", headers=auth(student)).json()
    assert "questions" not in detail
    attempt = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(student)).json()
    text = str(attempt)
    assert "isCorrect" not in text and "correctOptionId" not in text and "answer" not in attempt["questions"][0]
    review = client.get(f"/api/v1/attempts/{attempt['id']}", headers=auth(student)).json()
    assert "correctOptionId" not in str(review)


def test_attempt_is_graded_on_server_and_reviewable(client, db):
    _, _, student, quiz = setup(client, db)
    attempt = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(student)).json()
    assert attempt["status"] == "in_progress" and attempt["attemptNumber"] == 1
    # simpan jawaban sementara lalu lanjutkan (resume mengembalikan attempt yang sama)
    client.patch(
        f"/api/v1/attempts/{attempt['id']}", json={"answers": answer_map(attempt, [0, 0])}, headers=auth(student)
    )
    resumed = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(student)).json()
    assert resumed["id"] == attempt["id"] and resumed["questions"][0]["selectedOptionId"]
    res = client.post(
        f"/api/v1/attempts/{attempt['id']}/submit", json={"answers": answer_map(attempt, [0, 2])}, headers=auth(student)
    ).json()
    assert res["status"] == "submitted" and res["score"] == 50 and res["correct"] == 1 and res["passed"] is False
    assert res["questions"][1]["correctOptionId"] == attempt["questions"][1]["options"][1]["id"]
    again = client.post(f"/api/v1/attempts/{attempt['id']}/submit", json={}, headers=auth(student))
    assert again.status_code == 409 and again.json()["error"]["code"] == "ATTEMPT_SUBMITTED"
    history = client.get(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(student)).json()
    assert history["items"][0]["score"] == 50


def test_max_attempts_enforced(client, db):
    _, _, student, quiz = setup(client, db)
    for picks in ([0, 1], [1, 1]):
        attempt = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(student)).json()
        client.post(
            f"/api/v1/attempts/{attempt['id']}/submit",
            json={"answers": answer_map(attempt, picks)},
            headers=auth(student),
        )
    res = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(student))
    assert res.status_code == 409 and res.json()["error"]["code"] == "NO_ATTEMPTS_LEFT"
    mine = client.get(f"/api/v1/quizzes/{quiz['id']}", headers=auth(student)).json()["mine"]
    assert mine["attempts"] == 2 and mine["bestScore"] == 100


def test_submit_after_deadline_is_rejected_and_marked_expired(client, db):
    _, _, student, quiz = setup(client, db)
    attempt = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(student)).json()
    row = db.get(QuizAttempt, uuid.UUID(attempt["id"]))
    row.expires_at = row.expires_at - timedelta(minutes=11)
    db.commit()
    res = client.post(
        f"/api/v1/attempts/{attempt['id']}/submit", json={"answers": answer_map(attempt, [0, 1])}, headers=auth(student)
    )
    assert res.status_code == 409 and res.json()["error"]["code"] == "ATTEMPT_EXPIRED"
    db.refresh(row)
    assert row.status == "expired" and row.score is None


def test_submit_within_grace_period_is_accepted(client, db):
    _, _, student, quiz = setup(client, db)
    attempt = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(student)).json()
    row = db.get(QuizAttempt, uuid.UUID(attempt["id"]))
    row.expires_at = row.expires_at - timedelta(minutes=10, seconds=10)  # lewat 10 detik, masih dalam grace 30 detik
    db.commit()
    res = client.post(
        f"/api/v1/attempts/{attempt['id']}/submit", json={"answers": answer_map(attempt, [0, 1])}, headers=auth(student)
    )
    assert res.status_code == 200 and res.json()["score"] == 100


def test_quiz_authorization(client, db):
    instructor, course, student, quiz = setup(client, db)
    outsider = make_user(db)
    other_instructor = make_user(db, role="instructor")
    assert client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(outsider)).status_code == 404
    # instructor pemilik tidak terdaftar di course-nya sendiri → tidak bisa mengerjakan
    assert client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(instructor)).status_code == 404
    admin = make_user(db, role="admin")
    assert client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(admin)).status_code == 403
    assert (
        client.patch(
            f"/api/v1/quizzes/{quiz['id']}", json={"title": "Hijack quiz"}, headers=auth(other_instructor)
        ).status_code
        == 403
    )
    assert client.post(f"/api/v1/courses/{course.id}/quizzes", json=QUIZ, headers=auth(student)).status_code == 403
    attempt = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(student)).json()
    assert client.get(f"/api/v1/attempts/{attempt['id']}", headers=auth(outsider)).status_code == 404


def test_quiz_validation_and_max_attempts_floor(client, db):
    instructor, _, student, quiz = setup(client, db)
    bad = {**QUIZ, "questions": [{"text": "Q", "options": ["a", "a", "b", "c"], "answer": 0}]}
    res = client.patch(f"/api/v1/quizzes/{quiz['id']}", json=bad, headers=auth(instructor))
    assert res.status_code == 400 and "questions.0" in res.json()["error"]["fields"]
    for _ in range(2):
        attempt = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(student)).json()
        client.post(f"/api/v1/attempts/{attempt['id']}/submit", json={}, headers=auth(student))
    res = client.patch(f"/api/v1/quizzes/{quiz['id']}", json={"maxAttempts": 1}, headers=auth(instructor))
    assert res.status_code == 400 and "maxAttempts" in res.json()["error"]["fields"]


def test_edit_quiz_keeps_question_ids_and_changes_answer(client, db):
    instructor, _, _, quiz = setup(client, db)
    edited = {**QUIZ, "questions": [{**QUIZ["questions"][0], "answer": 3}]}
    res = client.patch(f"/api/v1/quizzes/{quiz['id']}", json=edited, headers=auth(instructor)).json()
    assert res["questions"][0]["id"] == quiz["questions"][0]["id"] and res["questions"][0]["answer"] == 3
    assert len(res["questions"]) == 1
    assert client.delete(f"/api/v1/quizzes/{quiz['id']}", headers=auth(instructor)).status_code == 200


def test_archived_course_blocks_new_attempts(client, db):
    _, course, student, quiz = setup(client, db)
    course.status = "archived"
    db.commit()
    res = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=auth(student))
    assert res.status_code == 409 and res.json()["error"]["code"] == "COURSE_NOT_ACTIVE"
