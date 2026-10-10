from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth.deps import DB, CurrentUser, require_roles
from app.courses.service import owned_course, viewable_course
from app.quizzes import service
from app.quizzes.schemas import AnswersIn, QuizIn
from app.users.models import User

router = APIRouter(tags=["quizzes"])
Student = Annotated[User, Depends(require_roles("student"))]


@router.get("/courses/{course_id}/quizzes")
def list_quizzes(course_id: str, user: CurrentUser, db: DB) -> dict:
    """Instructor/admin: lengkap dengan soal & kunci. Student: ringkasan + attempt miliknya (tanpa soal & kunci)."""
    course = viewable_course(db, user, course_id)
    if user.role == "student":
        service.student_enrollment_for_course(db, user, course)
    quizzes = db.scalars(service.select_quizzes(course.id))
    items = [service.quiz_view(db, q, user) for q in quizzes]
    return {"items": items, "total": len(items), "page": 1, "pageSize": max(len(items), 1)}


@router.post("/courses/{course_id}/quizzes", status_code=201)
def create_quiz(course_id: str, body: QuizIn, user: CurrentUser, db: DB) -> dict:
    course = owned_course(db, user, course_id)
    return service.quiz_view(db, service.create_quiz(db, user, course, body), user)


@router.get("/quizzes/{quiz_id}")
def get_quiz(quiz_id: str, user: CurrentUser, db: DB) -> dict:
    quiz = service.find_quiz(db, quiz_id)
    viewable_course(db, user, str(quiz.course_id))
    if user.role == "student":
        service.student_enrollment(db, user, quiz)
    return service.quiz_view(db, quiz, user)


@router.patch("/quizzes/{quiz_id}")
def update_quiz(quiz_id: str, body: QuizIn, user: CurrentUser, db: DB) -> dict:
    """Edit quiz & soal (ID soal dipertahankan). maxAttempts tidak boleh di bawah attempt yang sudah dipakai."""
    quiz = service.owned_quiz(db, user, quiz_id)
    return service.quiz_view(db, service.update_quiz(db, quiz, body), user)


@router.delete("/quizzes/{quiz_id}")
def delete_quiz(quiz_id: str, user: CurrentUser, db: DB) -> dict:
    quiz = service.owned_quiz(db, user, quiz_id)
    db.delete(quiz)
    db.commit()
    return {"id": quiz_id}


# ---------------- Attempt (student) ----------------
@router.post("/quizzes/{quiz_id}/attempts", status_code=201)
def start_attempt(quiz_id: str, user: Student, db: DB) -> dict:
    """Mulai attempt (atau lanjutkan yang berjalan). Mengembalikan soal **tanpa kunci** dan `expiresAt`."""
    quiz = service.find_quiz(db, quiz_id)
    attempt = service.start_attempt(db, user, quiz)
    return service.attempt_view(db, attempt, quiz)


@router.get("/quizzes/{quiz_id}/attempts")
def my_attempts(quiz_id: str, user: Student, db: DB) -> dict:
    quiz = service.find_quiz(db, quiz_id)
    items = [service.attempt_summary(a, quiz) for a in service.my_attempts(db, user, quiz)]
    return {"items": items, "total": len(items), "page": 1, "pageSize": max(len(items), 1)}


@router.get("/attempts/{attempt_id}")
def get_attempt(attempt_id: str, user: Student, db: DB) -> dict:
    """Review attempt. Kunci jawaban hanya disertakan bila status `submitted`."""
    attempt = service.find_attempt(db, user, attempt_id)
    quiz = service.find_quiz(db, str(attempt.quiz_id))
    service.expire_stale(db, [attempt])
    db.commit()
    return service.attempt_view(db, attempt, quiz)


@router.patch("/attempts/{attempt_id}")
def save_answers(attempt_id: str, body: AnswersIn, user: Student, db: DB) -> dict:
    """Simpan jawaban sementara (untuk lanjut setelah refresh)."""
    attempt, quiz = service.save_answers(db, user, attempt_id, body.answers)
    return service.attempt_view(db, attempt, quiz)


@router.post("/attempts/{attempt_id}/submit")
def submit_attempt(attempt_id: str, body: AnswersIn, user: Student, db: DB) -> dict:
    """Kumpulkan & nilai di server. Lewat `expiresAt` + 30 detik → 409 `ATTEMPT_EXPIRED` (attempt ditandai expired)."""
    attempt, quiz = service.submit_attempt(db, user, attempt_id, body.answers)
    return service.attempt_view(db, attempt, quiz)
